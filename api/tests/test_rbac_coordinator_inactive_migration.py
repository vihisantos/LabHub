"""Revisão estática da migration 066 (membros inativos na Área do Coordenador).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL). Os invariantes que vivem DENTRO da transação SQL — leitura escopada de
memberships `suspended`/`removed`, projeção de perfil dentro do SECURITY DEFINER
(a RLS de `profiles` esconde perfis não-ativos), restauração apenas de
`suspended`, hardening de cargo (adm/coordinator rejeitados em
suspend/restore/remove), ausência de escrita em `profiles.role`/`auth.users`,
reuso da auditoria (sem terceira trilha) e ACL — são verificados aqui para que
qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (permissões, escopo, transições, gestor, auditoria)
vive em scripts/validate_rbac2_coordinator_066_dev.py (roda contra o DEV, uma
transação + ROLLBACK).

Links:
  - Migration:      supabase/migrations/066_rbac2_coordinator_inactive_members.sql
  - Fase anterior:  supabase/migrations/065_rbac2_coordinator_membership_management.sql
  - Escopo (047):   supabase/migrations/047_rbac2_coordinator_scope.sql
  - RLS profiles:   supabase/migrations/044_rls_hardening_profiles_workspaces.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "066_rbac2_coordinator_inactive_members.sql"

# Funções REESCRITAS/CRIADAS nesta fase.
PROJECTION_FUNCTIONS = [
    "coordinator_get_inactive_members",
    "coordinator_get_requests",
]
HARDENED_FUNCTIONS = [
    "coordinator_suspend_membership",
    "coordinator_restore_membership",
    "coordinator_remove_membership",
]
ALL_FUNCTIONS = PROJECTION_FUNCTIONS + HARDENED_FUNCTIONS

ACL_SIGNATURES = [
    "coordinator_get_inactive_members(uuid)",
    "coordinator_get_requests(uuid)",
    "coordinator_suspend_membership(uuid)",
    "coordinator_restore_membership(uuid)",
    "coordinator_remove_membership(uuid)",
]

FORBIDDEN_ROLE_SLUGS = ("'adm'", "'coordinator'")


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


class TestArquivoEFuncoes:
    def test_migration_existe(self):
        assert MIGRATION.is_file(), f"migration ausente: {MIGRATION}"

    def test_funcoes_presentes(self, sql):
        for name in ALL_FUNCTIONS:
            assert re.search(
                rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION) public\.{name}\s*\(", sql
            ), f"função ausente: {name}"

    def test_get_requests_recriada_por_mudanca_de_retorno(self, sql):
        assert "DROP FUNCTION IF EXISTS public.coordinator_get_requests(uuid)" in sql

    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql

    def test_nao_altera_rls(self, sql):
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql
        assert "ALTER TABLE" not in sql

    def test_reutiliza_is_coordinator_of(self, sql):
        assert "public.is_coordinator_of(" in sql

    def test_nao_recria_auditoria_nem_helper_de_escrita(self, sql):
        # Não REDEFINE esses objetos (podem até ser citados em mensagens de erro).
        for name in ("audit_memberships_change", "coordinator_set_manager", "coordinator_set_role"):
            assert not re.search(
                rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION)\s+public\.{name}\s*\(", sql
            ), f"não deveria recriar {name}"


class TestLeituraEscopada:
    def test_inativos_fail_closed_e_status(self, sql):
        body = _function_body(sql, "coordinator_get_inactive_members")
        assert "public.is_coordinator_of(p_workspace_id)" in body
        assert "m.status IN ('suspended', 'removed')" in body

    def test_inativos_projetam_perfil_dentro_do_definer(self, sql):
        body = _function_body(sql, "coordinator_get_inactive_members")
        assert "LEFT JOIN public.profiles p ON p.id = m.profile_id" in body
        for col in ("profile_name", "profile_email", "profile_status", "profile_role"):
            assert col in body, f"projeção sem {col}"

    def test_requisicoes_pending_com_projecao(self, sql):
        body = _function_body(sql, "coordinator_get_requests")
        assert "public.is_coordinator_of(p_workspace_id)" in body
        assert "m.status = 'pending'" in body
        assert "LEFT JOIN public.profiles p ON p.id = m.profile_id" in body

    def test_projecoes_sao_security_definer(self, sql):
        for name in PROJECTION_FUNCTIONS:
            body = _function_body(sql, name)
            assert "SECURITY DEFINER" in body, f"{name} sem SECURITY DEFINER"
            assert "SET search_path = public" in body, f"{name} sem search_path"


class TestHardeningDeCargo:
    def test_transicoes_bloqueiam_adm_e_coordinator(self, sql):
        for fn in HARDENED_FUNCTIONS:
            body = _function_body(sql, fn)
            assert "v_target_slug IN ('adm', 'coordinator')" in body, f"{fn} sem guarda de cargo"
            assert "administrative or coordination memberships cannot be" in body

    def test_transicoes_validam_escopo_e_status(self, sql):
        assert "only active memberships can be suspended" in sql
        assert "only suspended memberships can be restored" in sql
        assert "only active memberships can be removed" in sql
        for fn in HARDENED_FUNCTIONS:
            body = _function_body(sql, fn)
            assert "public.is_coordinator_of(v_ws)" in body, f"{fn} não valida escopo"
            assert "RAISE EXCEPTION" in body


class TestRestauracaoSegura:
    def test_restauracao_nao_recria_managed_by(self, sql):
        body = _function_body(sql, "coordinator_restore_membership")
        assert "managed_by" not in body, "restauração não deve mexer em managed_by"
        assert "status = 'active'" in body

    def test_suspensao_e_remocao_neutralizam_dependentes(self, sql):
        for fn in ("coordinator_suspend_membership", "coordinator_remove_membership"):
            body = _function_body(sql, fn)
            assert re.search(
                r"SET managed_by = NULL.*WHERE managed_by = p_membership_id", body
            ), f"{fn} não neutraliza dependentes"


class TestNaoEscala:
    def test_nao_toca_profiles_role(self, sql):
        assert "UPDATE public.profiles" not in sql
        assert not re.search(r"profiles\s+SET\s+role", sql, re.IGNORECASE)

    def test_nao_apaga_usuario_ou_perfil(self, sql):
        assert "auth.users" not in sql
        assert "DELETE FROM public.profiles" not in sql

    def test_nao_toca_super_admin(self, sql):
        assert not re.search(r"is_super_admin\s*=", sql), "não pode alterar is_super_admin"


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


class TestAuditoria:
    def test_sem_trilha_nova(self, sql):
        # A auditoria é a da 054+065 (trigger de memberships); esta fase não cria
        # tabela/ação/insert manual — restaurar já vira 'membership_changed'.
        assert "app_audit_logs" not in sql
        for action in ("membership_approved", "membership_suspended", "membership_restored"):
            assert action not in sql
