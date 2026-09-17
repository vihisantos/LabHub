"""Revisão estática da migration 065 (gestão de memberships pelo Coordenador).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL + fakes). Os invariantes que vivem DENTRO da transação SQL — escopo
fail-closed por `is_coordinator_of`, ciclo de vida restrito, cargos atribuíveis
(tec|vis|est|opv|lider) e NUNCA adm/coordinator, ausência de escrita em
`profiles.role`/`auth.users`, reuso (sem recriar) dos RPCs 047, ACL
(anon/PUBLIC revogado, authenticated), e auditoria aditiva em
`app_audit_logs` (sem terceira tabela, sem novas `action`) — são verificados
aqui para que qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (permissões, ciclo de vida, gestor, auditoria) vive
em scripts/validate_rbac2_coordinator_065_dev.py (roda contra o DEV, uma
transação + ROLLBACK).

Links:
  - Migration:      supabase/migrations/065_rbac2_coordinator_membership_management.sql
  - Escopo (047):   supabase/migrations/047_rbac2_coordinator_scope.sql
  - Auditoria(054): supabase/migrations/054_app_audit_logs.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "065_rbac2_coordinator_membership_management.sql"

# RPCs NOVOS desta fase (nomes). As assinaturas de ACL usam apenas os tipos.
NEW_RPCS = [
    "coordinator_get_requests",
    "coordinator_approve_membership",
    "coordinator_reject_membership",
    "coordinator_suspend_membership",
    "coordinator_restore_membership",
    "coordinator_remove_membership",
    "coordinator_set_role",
]

ACL_SIGNATURES = [
    "coordinator_get_requests(uuid)",
    "coordinator_approve_membership(uuid)",
    "coordinator_reject_membership(uuid)",
    "coordinator_suspend_membership(uuid)",
    "coordinator_restore_membership(uuid)",
    "coordinator_remove_membership(uuid)",
    "coordinator_set_role(uuid, text)",
]

# RPCs EXISTENTES que NÃO podem ser recriados/duplicados aqui.
REUSED_RPCS = [
    "coordinator_set_manager",
    "is_coordinator_of",
    "get_coordinator_units",
    "get_coordinator_leaders",
    "get_memberships_by_manager",
]

ALLOWED_ROLE_SLUGS = {"tec", "vis", "est", "opv", "lider"}
FORBIDDEN_ROLE_SLUGS = {"adm", "coordinator"}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _function_body(sql: str, name: str) -> str:
    """Recorta o corpo de `CREATE OR REPLACE FUNCTION public.<name>(` até o
    terminador (`$$;` para SQL, `$$ LANGUAGE ...;` para plpgsql)."""
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{name}\s*\(.*?"
        rf"(?:\$\$\s*LANGUAGE\s+[a-z]+[^;]*;|\$\$;)",
        sql,
        re.DOTALL,
    )
    assert m, f"corpo da função {name} não encontrado"
    return m.group(0)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


class TestArquivoEFuncoes:
    def test_migration_existe(self):
        assert MIGRATION.is_file(), f"migration ausente: {MIGRATION}"

    def test_todos_os_rpcs_novos_presentes(self, sql):
        for name in NEW_RPCS:
            assert re.search(
                rf"CREATE OR REPLACE FUNCTION public\.{name}\s*\(", sql
            ), f"RPC ausente: {name}"

    def test_nao_duplica_rpcs_existentes(self, sql):
        for name in REUSED_RPCS:
            assert not re.search(
                rf"CREATE OR REPLACE FUNCTION public\.{name}\s*\(", sql
            ), f"RPC existente recriado (duplicação): {name}"

    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql

    def test_nao_altera_rls(self, sql):
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql
        assert "ALTER TABLE" not in sql

    def test_reutiliza_is_coordinator_of(self, sql):
        assert "public.is_coordinator_of(" in sql, "escopo deve reutilizar o predicado 047"


class TestEscopoFailClosed:
    def test_toda_escrita_verifica_escopo(self, sql):
        for fn in (
            "coordinator_approve_membership",
            "coordinator_reject_membership",
            "coordinator_suspend_membership",
            "coordinator_restore_membership",
            "coordinator_remove_membership",
            "coordinator_set_role",
        ):
            body = _function_body(sql, fn)
            assert "public.is_coordinator_of(v_ws)" in body, f"{fn} não valida escopo"
            assert "RAISE EXCEPTION" in body

    def test_get_requests_fail_closed_e_pending(self, sql):
        body = _function_body(sql, "coordinator_get_requests")
        assert "public.is_coordinator_of(p_workspace_id)" in body
        assert "status = 'pending'" in body

    def test_status_de_partida_verificado(self, sql):
        assert "only pending memberships can be approved" in sql
        assert "only pending memberships can be rejected" in sql
        assert "only active memberships can be suspended" in sql
        assert "only suspended memberships can be restored" in sql
        assert "only active memberships can be removed" in sql


class TestCargos:
    def test_conjunto_permitido_exato(self, sql):
        m = re.search(r"p_role_slug NOT IN \(([^)]+)\)", sql)
        assert m, "lista de cargos atribuíveis ausente"
        slugs = set(re.findall(r"'([a-z]+)'", m.group(1)))
        assert slugs == ALLOWED_ROLE_SLUGS, f"conjunto divergente: {slugs}"

    def test_nunca_adm_nem_coordinator(self, sql):
        m = re.search(r"p_role_slug NOT IN \(([^)]+)\)", sql).group(1)
        for slug in FORBIDDEN_ROLE_SLUGS:
            assert f"'{slug}'" not in m

    def test_nao_toca_profiles_role(self, sql):
        assert "UPDATE public.profiles" not in sql
        assert not re.search(r"profiles\s+SET\s+role", sql, re.IGNORECASE)

    def test_nao_apaga_usuario_ou_perfil(self, sql):
        assert "auth.users" not in sql
        assert "DELETE FROM public.profiles" not in sql

    def test_nao_toca_super_admin(self, sql):
        assert not re.search(r"is_super_admin\s*=", sql), "não pode alterar is_super_admin"


class TestCicloDeVidaEGestor:
    def test_suspensao_neutraliza_dependentes(self, sql):
        body = _function_body(sql, "coordinator_suspend_membership")
        assert re.search(r"SET managed_by = NULL.*WHERE managed_by = p_membership_id", body)
        assert "status = 'suspended'" in body

    def test_remocao_neutraliza_dependentes(self, sql):
        body = _function_body(sql, "coordinator_remove_membership")
        assert re.search(r"SET managed_by = NULL.*WHERE managed_by = p_membership_id", body)
        assert "status = 'removed'" in body

    def test_rejeicao_remove_fisicamente_sem_apagar_dados_globais(self, sql):
        body = _function_body(sql, "coordinator_reject_membership")
        assert "DELETE FROM public.memberships WHERE id = p_membership_id" in body

    def test_restauracao_nao_recria_managed_by(self, sql):
        body = _function_body(sql, "coordinator_restore_membership")
        assert "managed_by" not in body, "restauração não deve mexer em managed_by"
        assert "status = 'active'" in body

    def test_set_role_protege_coordenacao(self, sql):
        body = _function_body(sql, "coordinator_set_role")
        assert "v_target_slug = 'coordinator'" in body
        assert "role_id = v_role_id" in body


class TestACL:
    def test_revoga_anon_e_public(self, sql):
        for sig in ACL_SIGNATURES:
            esc = re.escape(sig)
            assert re.search(rf"REVOKE ALL ON FUNCTION public\.{esc} FROM PUBLIC", sql), sig
            assert re.search(rf"REVOKE ALL ON FUNCTION public\.{esc} FROM anon", sql), sig

    def test_concede_authenticated(self, sql):
        for sig in ACL_SIGNATURES:
            assert re.search(
                rf"GRANT EXECUTE ON FUNCTION public\.{re.escape(sig)} TO authenticated", sql
            ), sig

    def test_security_definer_com_search_path(self, sql):
        assert sql.count("SECURITY DEFINER") >= len(NEW_RPCS)
        assert sql.count("SET search_path = public") >= len(NEW_RPCS)


class TestAuditoria:
    def test_reusa_app_audit_logs_sem_terceira_tabela(self, sql):
        assert "public.app_audit_logs" in sql
        assert "CREATE TABLE" not in sql

    def test_meta_de_update_inclui_managed_by(self, sql):
        body = _function_body(sql, "audit_memberships_change")
        assert "'managed_by', NEW.managed_by" in body
        assert "'prev_managed_by'" in body

    def test_actions_inalteradas(self, sql):
        body = _function_body(sql, "audit_memberships_change")
        for action in ("membership_added", "membership_changed", "membership_removed"):
            assert f"'{action}'" in body
        assert "membership_approved" not in sql
        assert "membership_suspended" not in sql
