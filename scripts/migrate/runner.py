"""Orquestração do migration runner.

Fluxo (idempotente e seguro):

1. Garante a existência de ``public.schema_migrations`` (CREATE TABLE IF NOT EXISTS).
2. Lê as versões já aplicadas do banco via Management API.
3. Resolve o baseline:
   - tabela vazia + ``BASELINE_VERSION`` definido -> grava baseline e aplica
     apenas versões > baseline;
   - tabela vazia + sem ``BASELINE_VERSION`` -> usa a maior versão do repositório
     como baseline implícito (NÃO reaplica histórico; aplica apenas o que vier
     depois). Seguro para o banco de produção que já teve migrations aplicadas
     manualmente sem tabela de histórico.
   - tabela com linhas -> baseline = maior versão de baseline registrada.
4. Aplica cada migration pendente numa transação própria que embute um advisory
   lock transacional (``pg_advisory_xact_lock``) para serializar execuções
   concorrentes, o corpo do arquivo e o registro em ``schema_migrations``.
   Só registra depois que o SQL roda sem erro (ON CONFLICT DO NOTHING evita
   duplicar em corrida).
5. Sai com código != 0 na primeira falha, sem marcar a migration como aplicada.
"""
from __future__ import annotations

import os
from pathlib import Path

from .api import ManagementAPI
from .core import (
    BASELINE_FILENAME,
    Migration,
    MigrationError,
    discover_migrations,
    latest_version,
    pending_migrations,
)

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

_BASELINE_INSERT = """
INSERT INTO public.schema_migrations (version, filename, applied_at, duration_ms)
VALUES ('{version}', '{filename}', now(), 0)
ON CONFLICT (version) DO NOTHING;
"""

_ADVISORY_LOCK_WRAP_BEGIN = """
BEGIN;
SELECT pg_advisory_xact_lock({key});
"""

_ADVISORY_LOCK_WRAP_END = """
INSERT INTO public.schema_migrations (version, filename, applied_at, duration_ms)
VALUES ('{version}', '{filename}', now(), 0)
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

def _stamp_baseline(api: ManagementAPI, version: str, filename: str) -> None:
    api.query(_BASELINE_INSERT.format(version=version, filename=filename))


def _read_applied(api: ManagementAPI) -> tuple[set[str], str | None]:
    """Retorna (versões aplicadas, maior versão de baseline)."""
    rows = api.query(_SELECT_APPLIED) or []
    applied: set[str] = set()
    baseline: str | None = None
    if isinstance(rows, list):
        for row in rows:
            version = row.get("version")
            filename = row.get("filename")
            if version is None:
                continue
            applied.add(version)
            if filename == BASELINE_FILENAME:
                if baseline is None or int(version) > int(baseline):
                    baseline = version
    return applied, baseline


def _bootstrap_schema_migrations(api: ManagementAPI) -> None:
    api.query(_CREATE_SCHEMA_MIGRATIONS)


def _env_baseline() -> str | None:
    value = os.environ.get("BASELINE_VERSION", "").strip()
    return value or None


# ---------------------------------------------------------------------------
# aplicação
# ---------------------------------------------------------------------------

def apply_migration(api: ManagementAPI, migration: Migration) -> None:
    """Aplica UMA migration em transação com advisory lock + registro original.

    O corpo (idempotente, sem BEGIN/COMMIT próprios) é executado entre um
    advisory lock transacional e o INSERT do registro, tudo num único
    ``database/query``. Se qualquer statement falhar, a transação inteira
    (inclusive o INSERT de registro) é revertida — nada é marcado como aplicado.
    """
    body = migration.path.read_text(encoding="utf-8").strip()
    sql = (
        _ADVISORY_LOCK_WRAP_BEGIN.format(key=ADVISORY_LOCK_KEY)
        + "\n" + body + "\n"
        + _ADVISORY_LOCK_WRAP_END.format(version=migration.version, filename=migration.filename)
    )
    api.query(sql)


def run(migrations_dir: Path, api: ManagementAPI) -> RunnerResult:
    """Executa o fluxo completo de migrations. Idempotente e concurrency-safe."""
    migrations = discover_migrations(migrations_dir)
    if not migrations:
        raise MigrationError("Nenhuma migration encontrada em " + str(migrations_dir))

    api_call_count = 0

    # 1. garante a tabela de histórico
    _bootstrap_schema_migrations(api)
    api_call_count += 1

    # 2. lê o estado atual
    applied_versions, db_baseline = _read_applied(api)
    api_call_count += 1

    # 3. resolve o baseline
    env_baseline = _env_baseline()
    if not applied_versions:
        if db_baseline is not None:
            baseline = db_baseline
        elif env_baseline is not None:
            baseline = env_baseline
            _stamp_baseline(api, baseline, BASELINE_FILENAME)
            api_call_count += 1
        else:
            baseline = latest_version(migrations)
            if baseline:
                _stamp_baseline(api, baseline, BASELINE_FILENAME)
                api_call_count += 1
    else:
        baseline = db_baseline if db_baseline is not None else (
            sorted(applied_versions, key=int)[-1] if applied_versions else None
        )

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
