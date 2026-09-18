"""Revisão estática da migration 068 (Fase 5.2 - Trust Boundary do Coordenador).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL). Os invariantes que vivem DENTRO da transação SQL — approve/reject de
membership rejeitando alvos `adm`/`coordinator`, escopo por unidade fail-closed
(`is_coordinator_of`), `pending` como única origem, ausência de escrita em
`profiles`/`auth.users`/`managed_by`/auditoria, ACL (anon/PUBLIC revogado,
authenticated) e não-recriação das demais RPCs — são verificados aqui para que
qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (transação real + ROLLBACK, com `auth.uid()` via
`set_config('request.jwt.claim.sub', ...)`) vive em
scripts/validate_rbac2_coordinator_068_dev.py (roda contra o DEV).

Links:
  - Migration:      supabase/migrations/068_rbac2_coordinator_trust_boundary.sql
  - Base (065):     supabase/migrations/065_rbac2_coordinator_membership_management.sql
  - Hardening(066): supabase/migrations/066_rbac2_coordinator_inactive_members.sql
  - Escopo (047):   supabase/migrations/047_rbac2_coordinator_scope.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "068_rbac2_coordinator_trust_boundary.sql"

# RPCs REESCRITAS nesta fase.
HARDENED_FUNCTIONS = [
    "coordinator_approve_membership",
    "coordinator_reject_membership",
]

# Alvos que o Coordenador NAO pode aprovar/rejeitar.
FORBIDDEN_TARGET_SLUGS = ("'adm'", "'coordinator'")

ACL_SIGNATURES = [
    "coordinator_approve_membership(uuid)",
    "coordinator_reject_membership(uuid)",
]

# RPCs/objetos que NAO podem ser recriados/duplicados aqui.
REUSED_OBJECTS = [
    "coordinator_get_requests",
    "coordinator_suspend_membership",
    "coordinator_restore_membership",
    "coordinator_remove_membership",
    "coordinator_set_role",
    "coordinator_set_manager",
    "is_coordinator_of",
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


class TestArquivoEFuncoes:
    def test_migration_existe(self):
        assert MIGRATION.is_file(), f"migration ausente: {MIGRATION}"

    def test_funcoes_presentes(self, sql):
        for name in HARDENED_FUNCTIONS:
            assert re.search(
                rf"CREATE OR REPLACE FUNCTION public\.{name}\s*\(", sql
            ), f"função ausente: {name}"

    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql

    def test_nao_altera_rls(self, sql):
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql
        assert "ALTER TABLE" not in sql

    def test_reutiliza_is_coordinator_of(self, sql):
        assert "public.is_coordinator_of(" in sql, "escopo deve reutilizar o predicado 047"

    def test_nao_recria_objetos_existentes(self, sql):
        for name in REUSED_OBJECTS:
            assert not re.search(
                rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION|DROP FUNCTION IF EXISTS)\s+public\.{name}\s*\(",
                sql,
            ), f"não deveria recriar {name}"


class TestGuardaDeCargo:
    def test_approve_rejeita_adm_e_coordinator(self, sql):
        body = _function_body(sql, "coordinator_approve_membership")
        assert "JOIN public.roles" in body
        assert "v_target_slug IN ('adm', 'coordinator')" in body
        assert "administrative or coordination memberships cannot be approved" in body

    def test_reject_rejeita_adm_e_coordinator(self, sql):
        body = _function_body(sql, "coordinator_reject_membership")
        assert "JOIN public.roles" in body
        assert "v_target_slug IN ('adm', 'coordinator')" in body
        assert "administrative or coordination memberships cannot be rejected" in body

    def test_ambos_os_slugs_proibidos_presentes(self, sql):
        for slug in FORBIDDEN_TARGET_SLUGS:
            assert slug in sql

    def test_guarda_de_cargo_antes_do_status(self, sql):
        """Fail-closed: cargo proibido é checado antes do estado da membership."""
        for name in HARDENED_FUNCTIONS:
            body = _function_body(sql, name)
            i_role = body.find("v_target_slug IN ('adm', 'coordinator')")
            i_status = body.find("v_status <> 'pending'")
            assert i_role != -1 and i_status != -1
            assert i_role < i_status, f"{name}: guarda de cargo deve vir antes do status"


class TestEscopoEOrigem:
    def test_status_de_partida_verificado(self, sql):
        assert "only pending memberships can be approved" in sql
        assert "only pending memberships can be rejected" in sql

    def test_escopo_fail_closed_e_security_definer(self, sql):
        for name in HARDENED_FUNCTIONS:
            body = _function_body(sql, name)
            assert "public.is_coordinator_of(v_ws)" in body, f"{name} não valida escopo"
            assert "RAISE EXCEPTION" in body
            assert "SECURITY DEFINER" in body, f"{name} sem SECURITY DEFINER"
            assert "SET search_path = public" in body, f"{name} sem search_path"

    def test_approve_mantem_checks_de_perfil(self, sql):
        body = _function_body(sql, "coordinator_approve_membership")
        assert "is_super_admin" in body
        assert "target profile not found" in body
        assert "target profile must be active" in body

    def test_reject_remove_fisicamente_sem_apagar_dados_globais(self, sql):
        body = _function_body(sql, "coordinator_reject_membership")
        assert "DELETE FROM public.memberships WHERE id = p_membership_id" in body
        assert "auth.users" not in sql
        assert "DELETE FROM public.profiles" not in sql


class TestNaoEscala:
    def test_nao_toca_profiles_role(self, sql):
        assert "UPDATE public.profiles" not in sql
        assert not re.search(r"profiles\s+SET\s+role", sql, re.IGNORECASE)

    def test_nao_toca_super_admin_nem_managed_by_nem_auditoria(self, sql):
        assert not re.search(r"is_super_admin\s*=", sql), "não pode alterar is_super_admin"
        assert "managed_by" not in sql
        assert "app_audit_logs" not in sql


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
