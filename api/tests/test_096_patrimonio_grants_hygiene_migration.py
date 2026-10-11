"""Revisão estática da migration 096 (Patrimônio — higiene de GRANTS).

Contexto: o Supabase cria todo objeto novo do schema `public` com privilégios
de plataforma amplos (`pg_default_acl` → `arwdDxtm` para
anon/authenticated/service_role, incluindo TRUNCATE — que RLS NÃO bloqueia).
As migrations 091-094 revogaram `anon`, mas não normalizaram `authenticated`;
o desvio ficou invisível no CI (PostgreSQL puro sem defaults de plataforma) e
só apareceu no banco real (check 094 falhou no DEV; PROD confirmado na
auditoria de grants).

Esta migration codifica a correção emergencial executada no PROD: exatamente
4 REVOKEs idempotentes, sem CASCADE, sem tocar em service_role/anon, sem
remover UPDATE/DELETE de assets/locations/responsibles (gated por RLS) e sem
qualquer efeito no Stock.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "096_patrimonio_grants_hygiene.sql"
CHECKS = ROOT / "supabase" / "migrations" / "tests" / "096_patrimonio_grants_hygiene_checks.sql"

SQL = MIGRATION.read_text(encoding="utf-8")
# código efetivo (sem comentários) — as asserções de "proibido" avaliam só o SQL
CODE = "\n".join(l for l in SQL.splitlines() if not l.strip().startswith("--"))
CODE_NO_WS = re.sub(r"\s+", " ", CODE)


def test_096_sequencial_e_presente():
    assert MIGRATION.is_file()
    assert (ROOT / "supabase" / "migrations" / "095_patrimonio_rbac_actions.sql").is_file(), (
        "096 deve vir depois da 095"
    )


def test_096_exatamente_os_4_revokes_autorizados():
    revokes = re.findall(r"REVOKE\s+([^;]+?)\s+ON\s+public\.([^;]+?)\s+FROM\s+authenticated;", CODE_NO_WS)
    assert len(revokes) == 4, f"esperados 4 REVOKEs, encontrados {len(revokes)}"
    privs, table = revokes[0]
    assert privs.strip() == "UPDATE, DELETE, TRUNCATE" and table.strip() == "asset_movements"
    for privs, table in revokes[1:]:
        assert table.strip() in ("patrimonio_locations", "patrimonio_responsibles", "assets")
        assert privs.strip() == "TRUNCATE", "somente TRUNCATE é revogado das outras três"


def test_096_nao_usa_cascade_nem_concede():
    assert "CASCADE" not in CODE.upper(), "096 não pode usar CASCADE"
    assert not re.search(r"\bGRANT\b", CODE, re.I), "096 não pode conceder privilégios"


def test_096_nao_toca_service_role_nem_anon():
    assert "service_role" not in CODE
    assert re.search(r"FROM\s+anon\b", CODE, re.I) is None
    assert re.search(r"TO\s+anon\b", CODE, re.I) is None


def test_096_preserva_select_insert_de_asset_movements():
    block = re.search(r"REVOKE\s+([^;]+?)\s+ON\s+public\.asset_movements\s+FROM\s+authenticated;", CODE_NO_WS)
    assert block, "REVOKE de asset_movements ausente"
    assert "SELECT" not in block.group(1) and "INSERT" not in block.group(1)


def test_096_nao_remove_update_delete_das_outras_tres():
    for table in ("patrimonio_locations", "patrimonio_responsibles", "assets"):
        block = re.search(rf"REVOKE\s+([^;]+?)\s+ON\s+public\.{table}\s+FROM\s+authenticated;", CODE_NO_WS)
        assert block, f"REVOKE de {table} ausente"
        assert "UPDATE" not in block.group(1) and "DELETE" not in block.group(1), (
            f"UPDATE/DELETE de {table} não podem ser revogados pela 096 (gated por RLS)"
        )


def test_096_nao_toca_stock_nem_estrutura():
    assert "stock" not in CODE.lower(), "096 não pode referenciar o módulo Stock"
    for kw in ("ALTER ", "DROP ", "CREATE ", "TRUNCATE ", "DELETE FROM", "INSERT INTO"):
        assert not re.search(rf"^{kw}", CODE, re.M | re.I), f"statement inesperado ({kw}) na 096"


def test_096_idempotente_e_sem_historico_manual():
    assert "schema_migrations" not in CODE, "a 096 não pode marcar histórico manualmente"
    assert len(re.findall(r"REVOKE\s", CODE)) == 4
    assert "BEGIN" not in CODE and "COMMIT" not in CODE, "a transação é do runner"


def test_096_checks_sql_verificam_privilegios_efetivos():
    checks = CHECKS.read_text(encoding="utf-8")
    assert "has_table_privilege('authenticated', 'public.asset_movements', 'UPDATE')" in checks
    assert "has_table_privilege('authenticated', 'public.asset_movements', 'TRUNCATE')" in checks
    assert "has_table_privilege('service_role'" in checks
    assert "has_table_privilege('anon'" in checks
    # policies/RLS continuam ativas (verificação via catálogo no check 096)
    assert "pg_policies" in checks
    assert "relrowsecurity" in checks
    assert "stock" in checks  # confirmar que o Stock não foi tocado


def test_096_nao_introduz_segundo_mecanismo_de_versionamento():
    sql_text = SQL.lower()
    assert "supabase_migrations" not in sql_text
    assert "insert into" not in sql_text
