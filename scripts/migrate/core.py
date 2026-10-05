"""Descoberta, ordenação e auditoria de identidade das migrations SQL do LabHub.

O migration runner segue o padrão versionado do repositório:

    supabase/migrations/NNN_nome.sql

onde ``NNN`` é um número sequencial de 3 dígitos (ou mais, caso necessário)
nunca reutilizado. Este módulo é puro (sem I/O de rede) e 100% testável.

Duas invariantes sustentam a segurança do runner:

1. **Filename é dado, não template.** O nome do arquivo entra em SQL, então é
   validado de forma estrita (:func:`validate_migration_filename`) e inserido via
   :func:`sql_string_literal`, que só aceita o charset da convenção. Não existe
   caminho em que um caractere do filesystem vire SQL.

2. **Identidade é ``(version, filename)``, não só ``version``.** Se uma migration
   já aplicada for renumerada, o número deixa de bater e o runner a trataria
   como nova — reexecutando DDL sobre um banco que já a contém.
   :func:`audit_applied_identities` transforma isso em erro explícito.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Prefixo numérico no início do filename: "NNN_descricao.sql"
_VERSION_RE = re.compile(r"^(\d+)_(.+)\.sql$")

# Convenção ESTRITA de filename (#285). O nome do arquivo é interpolado em SQL
# (registro em schema_migrations), então o charset é fechado de propósito:
# sem aspas, sem ponto-e-vírgula, sem hífen, sem barra, sem espaço. As 84
# migrations do repositório respeitam esta regra — nenhum arquivo existente
# precisou ser renomeado.
#
# Gaps de NUMERAÇÃO são permitidos e legítimos (o repo tem 37, 80 e 81
# desmontados por renumeração). O que não é permitido é(filename) malformado.
MIGRATION_FILENAME_PATTERN = r"^\d{3,}_[a-z0-9_]+\.sql$"
_MIGRATION_FILENAME_RE = re.compile(MIGRATION_FILENAME_PATTERN)

# Allowlist do literal SQL do runner: `[0-9a-z_]` com sufixo `.sql` opcional.
# Nenhuma aspa, ponto-e-virgula, espaco, hifen ou `/` — ou seja, nada que
# permita fechar o literal, abrir comentário ou encadear statements.
SQL_LITERAL_PATTERN = r"^[0-9a-z_]+(?:\.sql)?$"
_SQL_LITERAL_RE = re.compile(SQL_LITERAL_PATTERN)

# Filename usado pela linha de baseline (não corresponde a uma migration real).
BASELINE_FILENAME = "__baseline__"


class MigrationError(Exception):
    """Erro de domínio do migration runner (sem expor segredos)."""


class MigrationVersionError(MigrationError):
    """Filename de migration inválido ou versões duplicadas."""


class MigrationFilenameError(MigrationVersionError):
    """Filename fora da convenção ``NNN_nome.sql``.

    Separada de :class:`MigrationVersionError` para que a causa da falha fique
    explícita no log: nome malformado é problema de repositório, não de drift.
    """


class AppliedIdentityError(MigrationError):
    """Migration registrada como aplicada não corresponde a nenhum arquivo.

    Cobre os dois lados da mesma falha — renumerar uma migration já aplicada, ou
    remover/renomear o arquivo dela. Nos dois casos o banco tem uma versão que o
    repositório não consegue mais explicar, e a única resposta segura é abortar
    em vez de reaplicar.
    """


class BaselineConfigurationError(MigrationError):
    """``BASELINE_VERSION`` obrigatório ausente ou inválido.

    Levantada apenas quando o baseline é exigido (``require_baseline=True``),
    isto é, no caminho de produção. Ver :func:`migrate.runner.run`.
    """


@dataclass(frozen=True)
class Migration:
    version: str      # "036"
    number: int       # 36
    name: str         # "criar_x"
    path: Path        # caminho absoluto do arquivo .sql
    filename: str     # "036_criar_x.sql"

    @property
    def sort_key(self) -> int:
        return self.number


def validate_migration_filename(filename: str) -> None:
    """Levanta :class:`MigrationFilenameError` se o filename estiver fora da convenção.

    A checagem é feita na descoberta, ou seja, ANTES de qualquer chamada de rede
    e antes de o filename chegar a um template SQL. Cobre tanto o filename
    malformado (``086_x.sql;``, ``086_x --.sql``) quanto a tentativa de injeção
    (``086_x';DROP TABLE users;--.sql``).
    """
    if not _MIGRATION_FILENAME_RE.match(filename):
        raise MigrationFilenameError(
            f"Filename de migration fora da convencao "
            f"({MIGRATION_FILENAME_PATTERN}): {filename!r}. "
            f"Esperado 'NNN_nome_minusculo.sql' (>=3 digitos, sem aspas, "
            f"hifen, ponto-e-virgula ou comentario)."
        )


def sql_string_literal(value: str) -> str:
    """Devolve ``value`` como literal SQL seguro para os campos do runner.

    Substitui o ``.format()`` que antes interpolava ``filename`` direto no SQL de
    ``schema_migrations``. A validação é *allowlist* de charset, não *blocklist*
    de aspas: o único caractere que poderia fechar o literal ou comentar o resto
    do statement (``,``, ``;``, ``-``, espaço, ``/*``) não faz parte do alfabeto
    aceito, então não existe escape a fazer nem ``; DROP TABLE`` a percolarem.

    Cobre exatamente os três formatos que o runner interpola:

    * ``version``  — ``"086"``;
    * ``filename`` — ``"086_x.sql"`` (o sufixo ``.sql`` é literal no padrão);
    * sentinela de baseline — ``"__baseline__"``.

    Qualquer outra coisa levanta :class:`MigrationFilenameError` em vez de virar
    SQL executável.
    """
    if not value or not _SQL_LITERAL_RE.match(value):
        raise MigrationFilenameError(
            f"valor nao seguro para literal SQL do runner: {value!r} "
            f"(permitido: {SQL_LITERAL_PATTERN})"
        )
    return "'" + value + "'"


def _looks_like_migration(filename: str) -> bool:
    """Heurística: o nome tem cara de migration (``digits_``)?"""
    return bool(re.match(r"^\d+_", filename))


def _parse_filename(filename: str, parent: Path) -> Migration | None:
    """Extrai (version, number, name) de um filename válido.

    Retorna ``None`` para arquivos que não são migrations (ex.: README, .md).
    Levanta :class:`MigrationFilenameError` para um nome que tem cara de
    migration (``digits_``) mas foge da convenção estrita — antes isso era
    aceito em silêncio e podia conter aspa, ponto-e-vírgula ou ``--``.
    """
    m = _VERSION_RE.match(filename)
    if not m:
        # Sem o prefixo `NNN_` não é migration. Mas se o nome ainda assim parece
        # uma migration (`086_x.sql;` casa o regex largo mas não o estrito),
        # exigimos a convenção em vez de descartar em silêncio.
        if _looks_like_migration(filename):
            raise MigrationFilenameError(
                f"Filename parece migration mas nao casa com a convencao "
                f"({MIGRATION_FILENAME_PATTERN}): {filename!r}"
            )
        return None
    digits, name = m.group(1), m.group(2)
    validate_migration_filename(filename)
    number = int(digits)
    return Migration(
        version=digits,
        number=number,
        name=name,
        path=parent / filename,
        filename=filename,
    )


def discover_migrations(migrations_dir: Path) -> list[Migration]:
    """Descobre e ordena numericamente todas as migrations do diretório."""
    if not migrations_dir.is_dir():
        raise MigrationError(f"Diretório de migrations não encontrado: {migrations_dir}")

    discovered: dict[int, Migration] = {}
    for entry in sorted(migrations_dir.iterdir(), key=lambda p: p.name):
        if not entry.is_file():
            continue
        migration = _parse_filename(entry.name, migrations_dir)
        if migration is None:
            continue
        if migration.number in discovered:
            raise MigrationVersionError(
                f"Versão duplicada {migration.version} em "
                f"'{discovered[migration.number].filename}' e '{migration.filename}'"
            )
        discovered[migration.number] = migration

    return [discovered[k] for k in sorted(discovered)]


def latest_version(migrations: list[Migration]) -> str | None:
    """Maior versão presente no repositório (usada como baseline implícito)."""
    if not migrations:
        return None
    return max(migrations, key=lambda m: m.number).version


# ---------------------------------------------------------------------------
# normalização de transação embutida em arquivos de migration
# ---------------------------------------------------------------------------
#
# D2 documentado: várias migrations trazem `BEGIN;`/`COMMIT;` de nível de
# arquivo. O runner é o dono da transação (wrapper BEGIN→lock→corpo→INSERT
# registro→COMMIT); um `COMMIT;` interno encerraria a transação ANTES do
# registro em schema_migrations (quebra atômica) e o COMMIT final do wrapper
# falharia ("no transaction in progress"). A normalização abaixo remove UM
# `BEGIN;` e UM `COMMIT;` na posição de comando top-level (primeira/última
# linha executável), tornando a aplicação via runner segura em banco novo.
#
# ATUALIZADO em #285. O comentário anterior afirmava que "nenhuma migration
# atual (fora a 000) possui BEGIN/COMMIT top-level — a normalização é no-op
# para 001-072". Era falso. Verificado no repositório: 12 migrations têm o par,
# não só a 000:
#
#     000  029  030  032  034  038  039  055  056  057  058  061
#
# O comportamento em si está correto — o strip é no-op para as outras 72. O que
# estava errado era a documentação, que faria quem maintainer avaliarem o risco
# do `strip_inner_transaction` a partir de uma premissa falsa.
#
# Segurança do regex: `BEGIN;` e `COMMIT;` exigem o `;` na própria linha;
# blocos `DO $$ ... BEGIN ... END $$;` usam `begin`/`end` SEM ponto-e-vírgula
# nessa posição e não são atingidos.
_BEGIN_STMT_RE = re.compile(r"^\s*BEGIN\s*;\s*$", re.IGNORECASE)
_COMMIT_STMT_RE = re.compile(r"^\s*COMMIT\s*;", re.IGNORECASE)


def strip_inner_transaction(sql: str) -> str:
    """Remove um ``BEGIN;`` top-level inicial e um ``COMMIT;`` final (se houver).

    Devolve o SQL sem os delimitadores de transação embutidos; o chamador
    (runner) controla a transação. Não é alteração de migration — é a
    normalização aplicada apenas no momento de executar.
    """
    lines = sql.split("\n")
    for i, line in enumerate(lines):
        if _BEGIN_STMT_RE.match(line):
            lines.pop(i)
            break
    for i in range(len(lines) - 1, -1, -1):
        if _COMMIT_STMT_RE.match(lines[i]):
            lines.pop(i)
            break
    return "\n".join(lines)


def pending_migrations(
    migrations: list[Migration],
    applied_versions: set[str],
    baseline_version: str | None,
) -> list[Migration]:
    """Retorna as migrations ainda não aplicadas, na ordem numérica.

    Regras:
      - migrations com versão <= baseline nunca são aplicadas (o baseline
        representa "tudo até aqui já está no banco por decisão do operador");
      - migrations já presentes em ``applied_versions`` são ignoradas;
      - o restante é ordenado numericamente.

    Não use isto como única barreira antes de aplicar: ``applied_versions``
    carrega só a versão. Chame :func:`audit_applied_identities` antes, senão uma
    migration renumerada passa por esta função como se fosse nova.
    """
    baseline_num = int(baseline_version) if baseline_version is not None else -1
    return [
        m
        for m in sorted(migrations, key=lambda m: m.number)
        if m.number > baseline_num and m.version not in applied_versions
    ]


# ---------------------------------------------------------------------------
# identidade das migrations já aplicadas (#285)
# ---------------------------------------------------------------------------
#
# O histórico em ``schema_migrations`` guarda ``(version, filename)``, mas o
# cálculo de pendentes usava só ``version``. A divergência entre os dois abre um
# buraco silencioso:
#
#     banco:      080  080_nome_antigo.sql   (aplicada)
#     repositório 083  083_nome_novo.sql     (arquivo renomeado)
#
# ``083`` não está em ``applied_versions``, então vira pendente e o runner
# executa DDL de novo sobre um banco que já a contém. Em ``schema_migrations``
# isso produz falha de PRIMARY KEY; em migration idempotente, um segundo efeito
# silencioso. Nenhum dos dois é um sinal claro de "renumere arquivo já aplicado".
#
# Isto já aconteceu no repositório: o commit 5394940 renumerou 079/080/081 para
# 082/083/084 DEPOIS de 080 e 081 terem sido aplicadas em produção. Foi
# compensado manualmente (``BASELINE_VERSION``), não detectado pelo runner.


@dataclass(frozen=True)
class AppliedIdentityDivergence:
    """Uma migration aplicada que o repositório não consegue mais explicar."""

    version: str
    recorded_filename: str
    repository_filename: str | None
    reason: str  # "renumbered" | "missing_file" | "renumbered_away"

    def describe(self) -> str:
        if self.reason == "missing_file":
            return (
                f"version {self.version} foi aplicada como "
                f"'{self.recorded_filename}', mas esse arquivo nao existe "
                f"mais no repositorio"
            )
        if self.reason == "renumbered":
            return (
                f"version {self.version} foi aplicada como "
                f"'{self.recorded_filename}', mas no repositorio o mesmo numero "
                f"agora aponta para '{self.repository_filename}'"
            )
        return (
            f"version {self.version} foi aplicada como "
            f"'{self.recorded_filename}', mas esse arquivo foi renumerado no "
            f"repositorio"
        )


def audit_applied_identities(
    applied_rows: Iterable[Mapping[str, Any]],
    migrations: Sequence[Migration],
) -> list[AppliedIdentityDivergence]:
    """Confere se toda migration aplicada ainda existe no repo como ela foi aplicada.

    Invariante: para cada linha de ``schema_migrations`` que não seja a linha de
    baseline (``filename = '__baseline__'``, que não corresponde a arquivo), o
    repositório precisa conter uma migration com a MESMA versão E o MESMO
    filename.

    Gaps de numeração são legítimos e não são reportados — o repositório tem
    37/80/81 desmontados. O que é ilegítimo é a identidade não fechar.

    Devolve a lista de divergências (vazia quando tudo bate) para que o chamador
    decida como levantar o erro, acumulando todas em vez de parar na primeira.
    """
    by_version = {m.version: m for m in migrations}
    # filename -> migration, para distinguir "renumerado" de "removido"
    by_filename = {m.filename: m for m in migrations}

    divergences: list[AppliedIdentityDivergence] = []
    for row in applied_rows:
        if not isinstance(row, Mapping):
            continue
        version = row.get("version")
        filename = row.get("filename")
        if version is None or filename is None:
            continue
        # A linha de baseline carrega um numero real mas filename sintetico.
        if filename == BASELINE_FILENAME:
            continue

        repo_migration = by_version.get(version)
        if repo_migration is None:
            # Numero nao existe mais no repo. Se o arquivo antigo ainda existir
            # sob outro numero, o operador renumerou; se nao existir, removeu.
            if filename in by_filename:
                reason = "renumbered_away"
            else:
                reason = "missing_file"
            divergences.append(
                AppliedIdentityDivergence(
                    version=version,
                    recorded_filename=filename,
                    repository_filename=None,
                    reason=reason,
                )
            )
        elif repo_migration.filename != filename:
            divergences.append(
                AppliedIdentityDivergence(
                    version=version,
                    recorded_filename=filename,
                    repository_filename=repo_migration.filename,
                    reason="renumbered",
                )
            )
    return divergences
