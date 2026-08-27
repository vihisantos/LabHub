"""Descoberta e ordenação de migrations SQL do LabHub.

A migration runner segue o padrão versionado do repositório:

    supabase/migrations/NNN_nome.sql

onde ``NNN`` é um número sequencial de 3 dígitos (ou mais, caso necessário)
nunca reutilizado. Este módulo é puro (sem I/O de rede) e 100% testável.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# Prefixo numérico no início do filename: "NNN_descricao.sql"
_VERSION_RE = re.compile(r"^(\d+)_(.+)\.sql$")

# Filename usado pela linha de baseline (não corresponde a uma migration real).
BASELINE_FILENAME = "__baseline__"


class MigrationError(Exception):
    """Erro de domínio do migration runner (sem expor segredos)."""


class MigrationVersionError(MigrationError):
    """Filename de migration inválido ou versões duplicadas."""


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


def _parse_filename(filename: str, parent: Path) -> Migration | None:
    """Extrai (version, number, name) de um filename válido.

    Retorna ``None`` para arquivos que não são migrations (ex.: README, .md).
    Levanta ``MigrationVersionError`` para nomes malformados que parecem
    migration mas não seguem o padrão ``NNN_nome.sql``.
    """
    m = _VERSION_RE.match(filename)
    if not m:
        return None
    digits, name = m.group(1), m.group(2)
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
    """
    baseline_num = int(baseline_version) if baseline_version is not None else -1
    return [
        m
        for m in sorted(migrations, key=lambda m: m.number)
        if m.number > baseline_num and m.version not in applied_versions
    ]
