"""Revisão estática da migration 074 (#286 PR-1 — estado terminal `rejected`).

O que é verificado aqui (padrão `api/tests`: leitura estática do DDL):

  1. `rejected` entra no conjunto permitido de `profiles.status`;
  2. os estados canônicos pré-existentes continuam permitidos
     (`pending`, `active`, `blocked`) — sem breaking change;
  3. `suspended` permanece no conjunto (legado dos scripts de validação DEV);
  4. a migration é idempotente (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`);
  5. o constraint é `NOT VALID` — não pode falhar por dados históricos
     (PROD pode conter valores fora do conjunto);
  6. a migration NÃO toca policy/RLS, `profiles.role`/`app_access`/
     `workspace_ids`, `memberships`, `auth.users`, RPCs 052/072, gatilhos,
     Coordinator ou RBAC 2.0; e NÃO recria a policy redundante
     `admin_abs_delete_profiles` (fora de escopo por decisão do PR).
  7. `profiles.status` NÃO é enum/domínio: é `TEXT` (012:6) — o mecanismo
     real é CHECK constraint, e o teste trava esseinvariant.

LIMITAÇÃO (teste comportamental): provar `rejected` → 401 em runtime exige
`require_auth` + banco. Feito em `test_admin_reject_endpoint.py` (unitário,
perfil `rejected`) e no teste real no Supabase DEV (fluxo completo do PR-1).
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "074_admin_rejection_state.sql"
STATUS_COLUMN_ORIGIN = (
    ROOT / "supabase" / "migrations" / "012_add_status_avatar_to_profiles.sql"
)

# Conjunto exigido pelo PR-1 + o legado que o codebase realmente usa.
REQUIRED_STATES = ("pending", "active", "blocked", "rejected")
LEGACY_STATES = ("suspended",)

FORBIDDEN = [
    "POLICY",
    "ROW LEVEL SECURITY",
    "GRANT ",
    "REVOKE ",
    "CREATE TRIGGER",
    "CREATE OR REPLACE FUNCTION",
    "CREATE FUNCTION",
    "INSERT INTO",
    "DELETE FROM",
    "UPDATE public.profiles SET",
    "auth.users",
    "app_access",
    "workspace_ids",
    "memberships",
    "admin_set_user_memberships",
    "admin_upsert_membership",
    "coordinator_",
    "profiles.role",
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", text)


@pytest.fixture(scope="module")
def ddl() -> str:
    """DDL da 074 sem comentários (o comentário do cabeçalho cita esses nomes)."""
    assert MIGRATION.exists(), f"migration 074 ausente: {MIGRATION}"
    return _normalize(_strip_comments(MIGRATION.read_text(encoding="utf-8")))


def _states(ddl: str) -> list[str]:
    m = re.search(r"CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)", ddl)
    assert m, f"CHECK constraint de profiles.status não encontrado: {ddl[:200]}"
    return re.findall(r"'([^']+)'", m.group(1))


def test_rejected_e_aceito(ddl: str) -> None:
    assert "rejected" in _states(ddl)


def test_estados_existentes_continuam_aceitos(ddl: str) -> None:
    states = _states(ddl)
    for state in REQUIRED_STATES:
        assert state in states, f"estado obrigatório {state!r} ausente de {states}"


def test_estados_legados_preservados(ddl: str) -> None:
    """`suspended` é gravado por scripts DEV (e2e_db.py, validate_067)."""
    states = _states(ddl)
    for state in LEGACY_STATES:
        assert state in states, (
            f"estado legado {state!r} removido de {states} — quebraria os scripts "
            "de validação em DEV"
        )


def test_migration_e_idempotente(ddl: str) -> None:
    assert re.search(
        r"DROP CONSTRAINT IF EXISTS profiles_status_check", ddl, re.IGNORECASE
    ), "DROP CONSTRAINT IF EXISTS ausente (replay não seria seguro)"
    assert ddl.count("ADD CONSTRAINT") == 1, "mais de um ADD CONSTRAINT na migration"


def test_constraint_not_valid(ddl: str) -> None:
    """`NOT VALID`: vale para escritas novas sem falhar em dados históricos."""
    assert re.search(r"NOT VALID", ddl, re.IGNORECASE), (
        "sem NOT VALID a migration falha se algum ambiente tiver status fora "
        "do conjunto (risco de deploy em PROD)"
    )


def test_nao_toca_fora_de_escopo(ddl: str) -> None:
    for token in FORBIDDEN:
        assert token.lower() not in ddl.lower(), (
            f"a 074 não deveria referenciar {token!r} (fora do escopo do PR-1)"
        )


def test_nao_recria_policy_redundante(ddl: str) -> None:
    """`admin_abs_delete_profiles` (022) fica fora do PR por decisão explícita."""
    assert "admin_abs_delete_profiles" not in ddl


def test_precheck_do_operador_documentado() -> None:
    """O pre-check read-only precisa continuar documentado na migration.

    Não existe etapa de preflight no Migration CI e a 074 NÃO saneia dados;
    como o constraint é `NOT VALID`, a aplicação não falha — o risco é um
    UPDATE posterior em linha legada. A.query que o operador deve rodar antes
    de aplicar é, portanto, parte do contrato da migration.
    """
    text = MIGRATION.read_text(encoding="utf-8")
    assert re.search(
        r"SELECT\s+status\s*,\s*count\(\*\)\s*FROM\s+public\.profiles\s+"
        r"GROUP BY status",
        _normalize(text),
        re.IGNORECASE,
    ), "a migration perdeu a query de pre-check do operador"
    assert "PRE-CHECK OBRIGATÓRIO" in text, (
        "a migration perdeu o aviso de pre-check obrigatório"
    )
    # a migration não pode sanear dados automaticamente
    ddl = _normalize(_strip_comments(text))
    for destrutivo in ("UPDATE public.profiles", "DELETE FROM public.profiles"):
        assert destrutivo not in ddl, (
            f"a 074 não pode sanear dados automaticamente ({destrutivo})"
        )


def test_status_e_text_e_nao_enum() -> None:
    """Trava o mecanismo real: `status` é TEXT (012), não enum/domínio."""
    origin = _normalize(
        _strip_comments(STATUS_COLUMN_ORIGIN.read_text(encoding="utf-8"))
    )
    assert re.search(
        r"ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'",
        origin,
        re.IGNORECASE,
    ), (
        "a coluna profiles.status não é mais TEXT com default 'active' — o "
        "mecanismo mudou e esta revisão precisa ser refeita"
    )
