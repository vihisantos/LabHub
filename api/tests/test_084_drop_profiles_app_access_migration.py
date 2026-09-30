"""Revisão estática da migration 084 (F2-D-N3 — remover `profiles.app_access`).

Contexto: a auditoria live (F2-D-N3) rodou em DEV e PROD e provou, contra o
catálogo do PostgreSQL e não contra o texto das migrations, que a coluna já
não tem dependência estrutural nem poder de decisão:

    · pg_depend de public.profiles.app_access ...... 0 dependências
    · triggers de public.profiles .................. 2, ambos da 083
    · funções (todos os schemas) ................... 0 com referência
      EXECUTÁVEL a app_access
    · views / índices / policies ................... 0 referências
    · validador 067 ............................... 26/26

O comportamento pós-DROP (UPDATE em `profiles` continua funcionando, triggers
seguem gravando auditoria) roda no harness comportamental
`supabase/migrations/tests/084_drop_profiles_app_access.sql` (Migrations CI,
PostgreSQL efêmero). Aqui fica a verificação estrutural do que é executado.

REGRA CENTRAL DESTA MIGRATION: ela contém UM statement e só um. A revisão
trabalha sobre o corpo EXECUTÁVEL (comentários removidos), porque o cabeçalho
documenta — e precisa mencionar — termos como `CASCADE`, `role` e `memberships`
para explicar por que NÃO são tocados.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "084_drop_profiles_app_access.sql"
TEST_084 = MIGRATIONS_DIR / "tests" / "084_drop_profiles_app_access.sql"

ORIG_013 = MIGRATIONS_DIR / "013_add_app_access.sql"
ORIG_083 = MIGRATIONS_DIR / "083_decouple_profiles_app_access_from_triggers.sql"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _corpo(sql: str) -> str:
    """Remove comentários de linha e de bloco.

    O cabeçalho da 084 documenta o contexto (inclusive os termos que ela NÃO
    deve tocar). Sem esta separação, os testes dariam falso positivo.
    """
    sem_bloco = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    return re.sub(r"--[^\n]*", "", sem_bloco)


@pytest.fixture(scope="module")
def migration() -> str:
    return _read(MIGRATION)


@pytest.fixture(scope="module")
def corpo(migration: str) -> str:
    return _corpo(migration)


# ── 1. a migration existe ────────────────────────────────────────────────────
def test_migration_existe():
    assert MIGRATION.is_file(), f"081 ausente: {MIGRATION}"
    assert MIGRATION.name == "084_drop_profiles_app_access.sql"
    assert TEST_084.is_file(), f"harness comportamental ausente: {TEST_084}"


# ── 2/3/4/5. alvo, DROP e idempotência ──────────────────────────────────────
def test_drop_da_coluna_app_access_de_profiles(corpo: str):
    assert re.search(r"ALTER\s+TABLE\s+public\.profiles\b", corpo, re.I), (
        "a 084 precisa alterar public.profiles"
    )
    assert re.search(r"DROP\s+COLUMN\s+IF\s+EXISTS\s+app_access", corpo, re.I), (
        "a 084 precisa remover app_access com DROP COLUMN IF EXISTS"
    )


def test_e_um_unico_statement(corpo: str):
    # Uma migration, um statement. Qualquer DDL/DML extra violaria o escopo.
    declaracoes = [d for d in corpo.split(";") if d.strip()]
    assert len(declaracoes) == 1, (
        f"a 084 deve conter exatamente 1 statement; encontrou {len(declaracoes)}: {declaracoes}"
    )


# ── 6. sem CASCADE ──────────────────────────────────────────────────────────
def test_nao_usa_cascade(corpo: str):
    assert not re.search(r"\bCASCADE\b", corpo, re.I), (
        "a 084 NÃO pode usar CASCADE: uma dependência inesperada deve FALHAR a "
        "migration, não ser removida em cascata"
    )


# ── 7/8. nenhum outro objeto tocado ────────────────────────────────────────
def test_nao_toca_outras_colunas_de_profiles(corpo: str):
    proibidas = ["role", "workspace_ids", "status", "is_super_admin", "id", "name"]
    for col in proibidas:
        # `\b` evita colisão de substring (ex.: `id` dentro de `workspace_ids`
        # não deve ser sinalizado, por isso checamos a palavra isolada).
        if re.search(rf"\b{re.escape(col)}\b", corpo, re.I):
            raise AssertionError(
                f"a 084 não pode mencionar a coluna `{col}` de public.profiles"
            )


def test_nao_altera_rls_rbac_nem_faz_dml(corpo: str):
    proibidos = [
        r"\bCREATE\b", r"\bDROP\s+TABLE\b", r"\bTRUNCATE\b",
        r"\bPOLICY\b", r"\bTRIGGER\b", r"\bGRANT\b", r"\bREVOKE\b",
        r"\bINSERT\b", r"\bUPDATE\b", r"\bDELETE\b", r"\bSELECT\b",
        r"role_permissions", r"memberships?", r"action",
        r"auth\.users", r"is_super_admin\s*=",
    ]
    for padrao in proibidos:
        achou = re.search(padrao, corpo, re.I)
        assert achou is None, (
            f"a 084 não pode conter {padrao!r} (encontrado: {achou.group(0)!r})"
        )


# ── 9. sem secrets ──────────────────────────────────────────────────────────
def test_nao_contem_segredos(migration: str):
    proibidos = [
        "sbp_", "eyJ", "service_role", "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_SERVICE_KEY", "SUPABASE_PROJECT_REF", "password",
        "postgres://", "postgresql://",
    ]
    baixo = migration.lower()
    for token in proibidos:
        assert token.lower() not in baixo, f"a 084 não pode conter {token!r}"


# ── 10. pré-requisito: 080 aplicada, 013 é quem criou a coluna ───────────────
def test_prerequisito_083_e_a_origem_013():
    assert ORIG_083.is_file()
    assert ORIG_013.is_file()
    corpo_013 = _corpo(_read(ORIG_013))
    assert re.search(r"ADD\s+COLUMN", corpo_013, re.I), "013 deveria ter criado a coluna"
    assert "app_access" in corpo_013


def test_header_documenta_o_porque():
    """A justificativa precisa existir: uma migration destrutiva sem contexto
    é impossível de revisar depois."""
    migration = _read(MIGRATION)
    for termo in ("F2-D-N3", "pg_depend", "077", "078", "080", "CASCADE"):
        assert termo in migration, f"o cabeçalho da 084 deveria mencionar {termo!r}"
