"""Revisão estática da migration 091 (Patrimônio — tabela de locais, issue #289).

Mesmo padrão de `api/tests` para migrations: leitura estática do DDL (a suíte
backend roda sem Postgres ao vivo). A prova comportamental (RLS com sessão
real) roda no Migrations CI em PostgreSQL efêmero via
`scripts/ci/behavioral_patrimonio.py`.

Coberto aqui:
  1. a migration 091 existe e é sequencial (imediatamente após a 090);
  2. tabela com os níveis estruturados (prédio/andar/sala/complemento) e
     CHECK de nome não vazio;
  3. UNIQUE (workspace_id, predio, andar, nome) — prédios/salas múltiplos
     por campus;
  4. leitura gated por `patrimonio.view`; escrita por
     `patrimonio.locations.manage`; super admin entra como bypass nas
     policies (`is_super_admin() OR …`), nunca dentro de helper;
  5. ACL no padrão do repo: REVOKE anon + GRANT authenticated;
  6. RLS habilitado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "091_patrimonio_locations.sql"

SQL = MIGRATION.read_text(encoding="utf-8")


def test_091_sequencial_e_presente():
    assert MIGRATION.is_file()
    prev = MIGRATIONS_DIR / "090_chamados_espera_indeferido.sql"
    nxt = sorted(p.name for p in MIGRATIONS_DIR.glob("092_*.sql"))
    assert prev.is_file(), "091 deve vir depois da 090"
    assert nxt, "092 deve existir na sequência"


def test_091_tabela_com_niveis_estruturados():
    ddl = re.search(r"CREATE TABLE IF NOT EXISTS public\.patrimonio_locations \((.*?)\);", SQL, re.S)
    assert ddl, "CREATE TABLE de patrimonio_locations ausente"
    body = ddl.group(1)
    for col in ("predio", "andar", "nome", "complemento", "workspace_id"):
        assert re.search(rf"\b{col}\b", body), f"coluna {col} ausente"
    assert "btrim(nome) <> ''" in body, "CHECK de nome não vazio ausente"


def test_091_unique_por_campus_predio_andar_sala():
    assert re.search(
        r"CREATE UNIQUE INDEX IF NOT EXISTS ux_patrimonio_locations_ws_full\s+"
        r"ON public\.patrimonio_locations \(workspace_id, predio, andar, nome\)",
        SQL,
    ), "UNIQUE (workspace_id, predio, andar, nome) ausente"


@pytest.mark.parametrize(
    ("policy", "action", "cmd"),
    [
        ("patrimonio_locations_select", "patrimonio.view", "FOR SELECT"),
        ("patrimonio_locations_insert", "patrimonio.locations.manage", "FOR INSERT"),
        ("patrimonio_locations_update", "patrimonio.locations.manage", "FOR UPDATE"),
        ("patrimonio_locations_delete", "patrimonio.locations.manage", "FOR DELETE"),
    ],
)
def test_091_policies_gated_por_action(policy, action, cmd):
    block = re.search(
        rf'CREATE POLICY "{policy}"\s+ON public\.patrimonio_locations\s+{cmd}(.*?);',
        SQL,
        re.S,
    )
    assert block, f"policy {policy} ausente"
    body = block.group(1)
    assert re.search(rf"'\b{action}\b'", body), f"{policy} sem gate {action}"
    assert "is_super_admin()" in body, f"{policy} sem bypass de super admin"


def test_091_super_admin_nao_dentro_de_helper():
    # invariante 059: bypass vive na policy, não na helper
    helper = re.search(
        r"CREATE OR REPLACE FUNCTION public\.user_has_action.*?;",
        SQL,
        re.S,
    )
    assert helper is None, "091 não deve redefinir user_has_action"


def test_091_acl_padrao_do_repo():
    assert re.search(r"REVOKE ALL ON public\.patrimonio_locations FROM anon", SQL)
    assert re.search(r"REVOKE ALL ON public\.patrimonio_locations FROM PUBLIC", SQL)
    assert re.search(
        r"GRANT SELECT, INSERT, UPDATE, DELETE ON public\.patrimonio_locations TO authenticated", SQL
    )
    assert re.search(r"GRANT ALL ON public\.patrimonio_locations TO service_role", SQL)


def test_091_rls_habilitado():
    assert re.search(
        r"ALTER TABLE public\.patrimonio_locations ENABLE ROW LEVEL SECURITY", SQL
    )
