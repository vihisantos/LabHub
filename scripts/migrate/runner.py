"""Orquestração do migration runner.

Fluxo (idempotente e seguro):

1. Garante a existência de ``public.schema_migrations`` (CREATE TABLE IF NOT EXISTS).
2. Lê as versões já aplicadas do banco via Management API.
3. **Audita a identidade** de cada migration já aplicada: a entrada precisa
   continuar existindo no repositório com a mesma versão E o mesmo filename
   (#285). Renumeração aborta — antes, ela passava como migration nova.
4. Resolve o baseline:
   - ``require_baseline`` + nada resolvido -> aborta (fail-closed, produção);
   - tabela vazia + ``BASELINE_VERSION`` definido -> grava baseline e aplica
     apenas versões > baseline;
   - tabela vazia + sem ``BASELINE_VERSION`` -> usa a maior versão do repositório
     como baseline implícito (NÃO reaplica histórico; aplica apenas o que vier
     depois). Mantido para banco legado e uso local; **desligado** em produção
     desde #285, onde o fallback silencioso era um no-op que reportava sucesso.
   - tabela com linhas -> baseline = maior versão de baseline registrada.
5. Aplica cada migration pendente numa transação própria que embute um advisory
   lock transacional (``pg_advisory_xact_lock``) para serializar execuções
   concorrentes, o corpo do arquivo e o registro em ``schema_migrations``.
   Só registra depois que o SQL roda sem erro (ON CONFLICT DO NOTHING evita
   duplicar em corrida).
6. Sai com código != 0 na primeira falha, sem marcar a migration como aplicada.
"""
from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from .api import ManagementAPI
from .core import (
    BASELINE_FILENAME,
    AppliedIdentityError,
    BaselineConfigurationError,
    Migration,
    MigrationError,
    audit_applied_identities,
    discover_migrations,
    latest_version,
    pending_migrations,
    sql_string_literal,
    strip_inner_transaction,
)
from .environment import missing_baseline_message, resolve_policy

# Chave do advisory lock: inteiro arbitrário, fixo, específico deste projeto.
# Regras do Postgres exigem um bigint; usamos um valor dedicado ao LabHub.
ADVISORY_LOCK_KEY = 958823001

_CREATE_SCHEMA_MIGRATIONS = """
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     text PRIMARY KEY,
    filename    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms integer NOT NULL DEFAULT 0
);
"""

_SELECT_APPLIED = """
SELECT version, filename FROM public.schema_migrations;
"""

_SELECT_TABLE_EXISTS = """
SELECT to_regclass('public.schema_migrations');
"""

# Templates parameterized por POSIÇÃO, preenchidos com literais já validados
# por `core.sql_string_literal` (allowlist de charset [0-9a-z_] + sufixo `.sql`).
# Antes estes templates usavam `.format(filename=...)` com o nome do arquivo
# vindo cru do disco — um arquivo chamado `086_x'; DROP TABLE users; --.sql`
# viraria SQL executável.
# Não usamos bind variables porque o corpo é enviado como um único script
# multi-statement (BEGIN/lock/corpo/INSERT/COMMIT); ver core.sql_string_literal.
_BASELINE_INSERT = """
INSERT INTO public.schema_migrations (version, filename, applied_at, duration_ms)
VALUES ({version}, {filename}, now(), 0)
ON CONFLICT (version) DO NOTHING;
"""

_ADVISORY_LOCK_WRAP_BEGIN = """
BEGIN;
SELECT pg_advisory_xact_lock({key});
"""

_ADVISORY_LOCK_WRAP_END = """
INSERT INTO public.schema_migrations (version, filename, applied_at, duration_ms)
VALUES ({version}, {filename}, now(), 0)
ON CONFLICT (version) DO NOTHING;
COMMIT;
"""


class RunnerResult:
    def __init__(self, *, baseline: str | None, pending: list[str], applied: list[str],
                 already_applied: list[str], api_call_count: int):
        self.baseline = baseline
        self.pending = pending
        self.applied = applied
        self.already_applied = already_applied
        self.api_call_count = api_call_count


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _stamped_insert(version: str, filename: str) -> str:
    """Monta o INSERT de schema_migrations com literais validados."""
    return _BASELINE_INSERT.format(
        version=sql_string_literal(version),
        filename=sql_string_literal(filename),
    )


def _stamp_baseline(api: ManagementAPI, version: str, filename: str) -> None:
    api.query(_stamped_insert(version, filename))


def _read_applied_rows(api: ManagementAPI) -> list[Mapping]:
    """Lê as linhas brutas de ``schema_migrations`` (version + filename)."""
    rows = api.query(_SELECT_APPLIED) or []
    return rows if isinstance(rows, list) else []


def _applied_index(rows: list[Mapping]) -> tuple[set[str], str | None]:
    """Deriva (versões aplicadas, maior versão de baseline) das linhas brutas."""
    applied: set[str] = set()
    baseline: str | None = None
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        version = row.get("version")
        filename = row.get("filename")
        if version is None:
            continue
        applied.add(version)
        if filename == BASELINE_FILENAME:
            if baseline is None or int(version) > int(baseline):
                baseline = version
    return applied, baseline


def _read_applied(api: ManagementAPI) -> tuple[set[str], str | None]:
    """Retorna (versões aplicadas, maior versão de baseline)."""
    return _applied_index(_read_applied_rows(api))


def _audit_identity(api: ManagementAPI, migrations: list[Migration]) -> None:
    """Aborta se alguma migration já aplicada não bater com o repositório (#285).

    Roda ANTES de calcular pendentes e ANTES de qualquer DDL. Sem esta checagem,
    uma migration renumerada depois de aplicada entra na fila de pendentes e
    reexecuta DDL sobre um banco que já a contém — falha opaca de PRIMARY KEY
    ou, pior, um segundo efeito idempotente silencioso.

    A linha de baseline (``filename = '__baseline__'``) é ignorada: ela
    representa uma decisão do operador, não um arquivo, e por isso não tem
    identidade a conferir.
    """
    rows = _read_applied_rows(api)
    divergences = audit_applied_identities(rows, migrations)
    if not divergences:
        return
    details = "\n".join(f"  - {d.describe()}" for d in divergences)
    raise AppliedIdentityError(
        "Migration renumbering detected: o banco tem migrations aplicadas que "
        "o repositorio atual nao consegue explicar. Abortando SEM reaplicar.\n"
        f"{details}\n"
        "Se a renumeracao foi intencional, o operador precisa reconciliar o "
        "historico (linha em public.schema_migrations) de forma explicita -- "
        "esta PR nao altera migrations nem o historico do banco."
    )


def _bootstrap_schema_migrations(api: ManagementAPI) -> None:
    api.query(_CREATE_SCHEMA_MIGRATIONS)


def _schema_migrations_exists(api: ManagementAPI) -> bool:
    """Verificação READ-ONLY da existência da tabela de histórico.

    Usada SÓ no dry-run — o dry-run nunca pode executar o ``CREATE TABLE
    IF NOT EXISTS`` (mutation). ``to_regclass`` responde NULL sem criar nada.
    """
    rows = api.query(_SELECT_TABLE_EXISTS) or []
    value = None
    if isinstance(rows, list) and rows:
        value = rows[0].get("to_regclass")
    return value is not None


def _env_baseline() -> str | None:
    value = os.environ.get("BASELINE_VERSION", "").strip()
    return value or None


# ---------------------------------------------------------------------------
# aplicação
# ---------------------------------------------------------------------------

def apply_migration(api: ManagementAPI, migration: Migration) -> None:
    """Aplica UMA migration em transação com advisory lock + registro original.

    O corpo (idempotente) é executado entre um advisory lock transacional e o
    INSERT do registro, tudo num único ``database/query``. Se qualquer
    statement falhar, a transação inteira (inclusive o INSERT de registro) é
    revertida — nada é marcado como aplicado.

    D2: o corpo passa por ``strip_inner_transaction`` — remove um ``BEGIN;``
    top-level inicial e um ``COMMIT;`` final SE o arquivo tiver controle de
    transação embutido. São 12 migrations com esse par (000, 029, 030, 032, 034,
    038, 039, 055, 056, 057, 058, 061), não só a 000; ver core.py. O runner é o
    dono da transação; sem isso o ``COMMIT;`` interno quebraria a atomicidade
    registro+migration e o ``COMMIT;`` final do wrapper falharia.

    ``version``/``filename`` entram no SQL por literais validados
    (``core.sql_string_literal``), nunca por interpolação crua do nome do arquivo.
    """
    body = migration.path.read_text(encoding="utf-8").strip()
    body = strip_inner_transaction(body)
    sql = (
        _ADVISORY_LOCK_WRAP_BEGIN.format(key=ADVISORY_LOCK_KEY)
        + "\n" + body + "\n"
        + _ADVISORY_LOCK_WRAP_END.format(
            version=sql_string_literal(migration.version),
            filename=sql_string_literal(migration.filename),
        )
    )
    api.query(sql)


def _resolve_baseline(
    *,
    applied_versions: set[str],
    db_baseline: str | None,
    env_baseline: str | None,
    from_scratch: bool,
    migrations: list[Migration],
    require_baseline: bool = False,
    policy=None,
) -> tuple[str | None, bool]:
    """Resolve o baseline e se ele precisa ser gravado (``__baseline__``).

    Retorna ``(baseline, precisa_gravar)``.

    Regras (preservadas do comportamento histórico, com uma exceção fechada):
      - ``from_scratch`` + tabela vazia -> baseline ``None`` (aplica TUDO, da
        000 em diante) e NÃO grava linha de baseline. Aplica-se apenas a banco
        NOVO/efêmero — nunca a produção legada.
      - tabela vazia + ``BASELINE_VERSION`` -> esse valor, grava a linha.
      - tabela vazia + sem env -> maior versão do repositório (baseline
        implícito, seguro p/ produção legada), grava a linha.
      - tabela com linhas -> baseline do banco (ou a maior aplicada).

    #285 — fail-closed: quando ``require_baseline`` é verdadeiro (target de
    produção) e nada define o baseline, aborta em vez de cair no implícito. O
    fallback sem baseline é um **no-op silencioso**: nada é aplicado e o processo
    termina com 0, então um secret ausente some sem sinal. Em produção isso
    significa schema congelado sem ninguém perceber.
    """
    if from_scratch and not applied_versions and db_baseline is None:
        # Banco novo/efêmero não tem nada que baselinar; `require_baseline`
        # não se aplica (não há histórico a reconciliar).
        return None, False
    if not applied_versions:
        if db_baseline is not None:
            return db_baseline, False
        if env_baseline is not None:
            return env_baseline, True
        if require_baseline:
            raise BaselineConfigurationError(
                missing_baseline_message(
                    policy if policy is not None else resolve_policy()
                )
            )
        implicit = latest_version(migrations)
        return implicit, implicit is not None
    return (db_baseline if db_baseline is not None else sorted(applied_versions, key=int)[-1]), False


def run(
    migrations_dir: Path,
    api: ManagementAPI,
    *,
    dry_run: bool = False,
    from_scratch: bool = False,
    require_baseline: bool = False,
    policy=None,
) -> RunnerResult:
    """Executa o fluxo completo de migrations. Idempotente e concurrency-safe.

    ``dry_run``: VALIDA config, descobre, consulta o estado (SÓ leitura) e
    calcula baseline/pendentes — nunca emite DDL/DML (nem CREATE TABLE nem
    INSERT de baseline, nem aplicação). ``from_scratch``: banco NOVO/efêmero —
    tabela vazia => aplica TODAS as migrations (000 em diante), em vez do
    baseline implícito "maior versão" pensado para produção legada.
    ``require_baseline``: fail-closed — sem baseline resolvido, aborta (#285).

    A auditoria de identidade (#285) roda nos DOIS caminhos, inclusive no
    dry-run: um plano que reaplicaria uma migration renumerada é exatamente o
    que o operador precisa ver antes de confirmar a aplicação.
    """
    migrations = discover_migrations(migrations_dir)
    if not migrations:
        raise MigrationError("Nenhuma migration encontrada em " + str(migrations_dir))

    api_call_count = 0
    env_baseline = _env_baseline()

    # ── dry-run: planejar SEM nunca escrever ─────────────────────────────────
    if dry_run:
        table_exists = _schema_migrations_exists(api)
        api_call_count += 1
        applied_versions: set[str]
        db_baseline: str | None
        if table_exists:
            # Auditoria antes de planejar: aborta em renumeração, sem escrever.
            _audit_identity(api, migrations)
            api_call_count += 1
            applied_versions, db_baseline = _read_applied(api)
            api_call_count += 1
        else:
            applied_versions, db_baseline = set(), None
        baseline, _ = _resolve_baseline(
            applied_versions=applied_versions,
            db_baseline=db_baseline,
            env_baseline=env_baseline,
            from_scratch=from_scratch,
            migrations=migrations,
            require_baseline=require_baseline,
            policy=policy,
        )
        ordered = sorted(migrations, key=lambda m: m.number)
        baseline_num = int(baseline) if baseline is not None else -1
        already_applied = [
            m.filename for m in ordered if (m.version in applied_versions or m.number <= baseline_num)
        ]
        pending = pending_migrations(migrations, applied_versions, baseline)
        return RunnerResult(
            baseline=baseline,
            pending=[m.version for m in pending],
            applied=[],
            already_applied=already_applied,
            api_call_count=api_call_count,
        )

    # ── execução real ────────────────────────────────────────────────────────
    # 1. verifica a existência da tabela de histórico — `to_regclass` é
    #    READ-ONLY. Precisa vir antes de qualquer escrita para que a auditoria de
    #    identidade (#285) ocorra ANTES de QUALQUER DDL: sem esta ordem, um
    #    `CREATE TABLE IF NOT EXISTS` já teria sido emitido antes de descobrir
    #    que o histórico está divergente.
    table_exists = _schema_migrations_exists(api)
    api_call_count += 1

    # 2. cria a tabela de histórico só quando ela realmente não existe
    if not table_exists:
        _bootstrap_schema_migrations(api)
        api_call_count += 1

    # 3. lê o estado atual e AUDITA a identidade antes de aplicar DDL (#285).
    #    Uma migration renumerada depois de aplicada apareceria como pendente e
    #    reexecutaria DDL sobre um banco que já a contém.
    applied_versions: set[str]
    db_baseline: str | None
    if table_exists:
        _audit_identity(api, migrations)
        api_call_count += 1
        applied_versions, db_baseline = _read_applied(api)
        api_call_count += 1
    else:
        # Tabela recem-criada: histórico vazio, nada a auditar nem baselinar
        # além do que _resolve_baseline decidir.
        applied_versions, db_baseline = set(), None

    # 4. resolve o baseline e grava a linha quando aplicável
    baseline, should_stamp = _resolve_baseline(
        applied_versions=applied_versions,
        db_baseline=db_baseline,
        env_baseline=env_baseline,
        from_scratch=from_scratch,
        migrations=migrations,
        require_baseline=require_baseline,
        policy=policy,
    )
    if should_stamp and baseline is not None:
        _stamp_baseline(api, baseline, BASELINE_FILENAME)
        api_call_count += 1

    # 4. calcula pendentes e aplica
    ordered = sorted(migrations, key=lambda m: m.number)
    pending = pending_migrations(migrations, applied_versions, baseline)
    baseline_num = int(baseline) if baseline is not None else -1
    already_applied = [
        m.filename for m in ordered if (
            m.version in applied_versions or m.number <= baseline_num
        )
    ]

    applied: list[str] = []
    for migration in pending:
        apply_migration(api, migration)
        api_call_count += 1
        applied.append(migration.version)

    return RunnerResult(
        baseline=baseline,
        pending=[m.version for m in pending],
        applied=applied,
        already_applied=already_applied,
        api_call_count=api_call_count,
    )
