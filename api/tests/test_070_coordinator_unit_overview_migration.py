"""Revisão estática da migration 070 (Central do Coordenador - Fase 1).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL). Os invariantes que vivem DENTRO da transação SQL — `get_coordinator_unit_overview`
como ÚNICA função nova, READ-ONLY sobre `chamados_tickets` (status/prioridade/
`archived`/`assignedToUserId` definindo open/in_progress/unassigned/high_priority/
urgent e os 5 recentes), autorização fail-closed reutilizando `is_coordinator_of`
(047) com negação EXPLÍCITA (RAISE 42501, nunca zeros falsos), ausência de
escrita em chamados/policies/RLS/tabelas novas, ACL (anon/PUBLIC revogado,
authenticated) e não-recriação das demais RPCs — são verificados aqui para que
qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (transação real + ROLLBACK, com `auth.uid()` via
`set_config('request.jwt.claim.sub', ...)`) vive em
scripts/validate_rbac2_coordinator_070_dev.py (roda contra o DEV).

Links:
  - Migration:    supabase/migrations/070_rbac2_coordinator_unit_overview.sql
  - Escopo (047): supabase/migrations/047_rbac2_coordinator_scope.sql
  - Gestão (065): supabase/migrations/065_rbac2_coordinator_membership_management.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "070_rbac2_coordinator_unit_overview.sql"

FUNCTION = "get_coordinator_unit_overview"

# RPCs/objetos que NÃO podem ser recriados/duplicados aqui (nem criados novos).
REUSED_OBJECTS = [
    "is_coordinator_of",
    "coordinator_get_requests",
    "coordinator_get_inactive_members",
    "coordinator_approve_membership",
    "coordinator_reject_membership",
    "coordinator_suspend_membership",
    "coordinator_restore_membership",
    "coordinator_remove_membership",
    "coordinator_set_manager",
    "coordinator_set_role",
    "audit_memberships_change",
    "admin_set_user_memberships",
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _strip_comments(text: str) -> str:
    """Remove comentários `--`/`/* */` para que asserts negativos chequem só DDL."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", text)


def _function_body(sql: str, name: str) -> str:
    """Recorta o corpo de `FUNCTION public.<name>(` até o terminador."""
    m = re.search(
        rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION) public\.{name}\s*\(.*?"
        rf"(?:\$\$\s*LANGUAGE\s+[a-z]+[^;]*;|\$\$;)",
        sql,
        re.DOTALL,
    )
    assert m, f"corpo da função {name} não encontrado"
    return m.group(0)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(_strip_comments(MIGRATION.read_text(encoding="utf-8")))


@pytest.fixture(scope="module")
def body(sql: str) -> str:
    return _function_body(sql, FUNCTION)


class TestArquivoEFuncoes:
    def test_migration_existe(self):
        assert MIGRATION.is_file(), f"migration ausente: {MIGRATION}"

    def test_apenas_uma_funcao_criada(self, sql):
        match = re.findall(
            r"CREATE (?:OR REPLACE )?FUNCTION public\.[a-z_0-9]+\s*\(", sql
        )
        assert match == [f"CREATE OR REPLACE FUNCTION public.{FUNCTION}("], (
            f"deve criar SOMENTE {FUNCTION}: {match}"
        )

    def test_funcao_presente(self, sql):
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{FUNCTION}\s*\(", sql
        )

    def test_assinatura(self, sql):
        assert "p_workspace_id uuid" in sql
        assert "RETURNS jsonb" in sql
        assert "LANGUAGE plpgsql" in sql
        assert "STABLE" in sql
        assert "SECURITY DEFINER" in sql
        assert "SET search_path = public" in sql

    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql
        assert "CREATE INDEX" not in sql
        assert "CREATE TRIGGER" not in sql

    def test_nao_altera_policies_nem_rls(self, sql):
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql
        assert "ALTER TABLE" not in sql
        assert "ENABLE ROW LEVEL SECURITY" not in sql

    def test_nao_recria_objetos_existentes(self, sql):
        for name in REUSED_OBJECTS:
            assert not re.search(
                rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION|DROP FUNCTION IF EXISTS)\s+public\.{name}\s*\(",
                sql,
            ), f"não deveria recriar {name}"


class TestAutorizacao:
    def test_reutiliza_is_coordinator_of(self, body):
        assert "public.is_coordinator_of(p_workspace_id)" in body, (
            "escopo deve reutilizar o predicado 047"
        )

    def test_negacao_explicita(self, body):
        assert "only an active coordinator of this unit can view its overview" in body
        assert "RAISE EXCEPTION" in body

    def test_negacao_com_errcode_42501(self, body):
        assert "ERRCODE = '42501'" in body, (
            "negação deve sinalizar insuficient_privilege (a UI distingue negado de unidade vazia)"
        )

    def test_nao_confunde_negado_com_vazio(self, body):
        # Zero honesto existe só para leitura autorizada (contagem sobre a unidade).
        assert "archived = false" in body
        assert "public.is_coordinator_of(p_workspace_id)" in body

    def test_nao_cria_nova_autorizacao(self, sql):
        assert "INSERT INTO public.role_permissions" not in sql
        assert "INSERT INTO public.roles" not in sql
        assert "membership_overrides" not in sql
        assert "is_super_admin" not in sql, (
            "não pode dar bypass por is_super_admin: a coordenação ativa é a autoridade"
        )


class TestLeituraSomente:
    def test_nao_escreve_em_chamados(self, body):
        for kw in ("INSERT INTO public.chamados_tickets", "UPDATE public.chamados_tickets",
                   "DELETE FROM public.chamados_tickets"):
            assert kw not in body, f"{kw} — a RPC é READ-ONLY"

    def test_dominio_apenas_chamados(self, sql):
        # Única leitura de dados de aplicação é chamados_tickets (ticket.view).
        direct_reads = re.findall(r"FROM public\.([a-z_0-9]+)", sql)
        assert "chamados_tickets" in direct_reads
        other_app_tables = {
            t for t in direct_reads
            if t not in ("chamados_tickets", "workspaces")
        }
        assert other_app_tables == set(), (
            f"não pode ler outras tabelas de aplicação: {other_app_tables}"
        )

    def test_totais_definidos_pelo_escopo_07(self, body):
        # Escopo 'aberto'/'a_caminho'/'em_atendimento' — o restante (resolvido/
        # fechado) não conta como ativo.
        assert "t.status = 'aberto'" in body
        assert "t.status IN ('a_caminho', 'em_atendimento')" in body
        assert "btrim(coalesce(t.\"assignedToUserId\", '')) = ''" in body, (
            "unassigned usa o mesmo critério de atribuição do app (assignedToUserId vazio)"
        )

    def test_prioridades_cobertas(self, body):
        assert "t.priority = 'alta'" in body
        assert "t.priority = 'urgente'" in body

    def test_recentes_limitados(self, body):
        assert "ORDER BY t.\"updatedAt\" DESC NULLS LAST" in body
        assert "LIMIT 5" in body


class TestACL:
    def test_revoga_anon_e_public(self, sql):
        esc = re.escape("public.get_coordinator_unit_overview(uuid)")
        assert re.search(rf"REVOKE ALL ON FUNCTION {esc} FROM PUBLIC", sql)
        assert re.search(rf"REVOKE ALL ON FUNCTION {esc} FROM anon", sql)

    def test_concede_authenticated(self, sql):
        assert re.search(
            r"GRANT EXECUTE ON FUNCTION public\.get_coordinator_unit_overview\(uuid\) TO authenticated",
            sql,
        )