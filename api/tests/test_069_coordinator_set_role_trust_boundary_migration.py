"""Revisão estática da migration 069 (Fase 5.3 - Trust Boundary do Coordenador).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL). Os invariantes que vivem DENTRO da transação SQL — `coordinator_set_role`
rejeitando ALVO `adm` (novo na 069) e ALVO `coordinator` (preservado da 065),
whitelist fechada tec|vis|est|opv|lider, escopo fail-closed
(`is_coordinator_of`), `active` como único estado de partida, ausência de
escrita em `profiles`/`auth.users`/`is_super_admin`, UPDATE apenas de
`role_id`, neutralização de dependentes ao sair de liderança, ACL
(anon/PUBLIC revogado, authenticated) e não-recriação das demais RPCs — são
verificados aqui para que qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (transação real + ROLLBACK, com `auth.uid()` via
`set_config('request.jwt.claim.sub', ...)`) vive em
scripts/validate_rbac2_coordinator_069_dev.py (roda contra o DEV).

Links:
  - Migration:      supabase/migrations/069_rbac2_coordinator_set_role_trust_boundary.sql
  - Base (065):     supabase/migrations/065_rbac2_coordinator_membership_management.sql
  - Hardening(066): supabase/migrations/066_rbac2_coordinator_inactive_members.sql
  - 068:            supabase/migrations/068_rbac2_coordinator_trust_boundary.sql
  - Escopo (047):   supabase/migrations/047_rbac2_coordinator_scope.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "069_rbac2_coordinator_set_role_trust_boundary.sql"

# Whitelist de cargos que o Coordenador PODE atribuir.
ALLOWED_ROLE_SLUGS = ("'tec'", "'vis'", "'est'", "'opv'", "'lider'")

# Alvos que o Coordenador NAO pode trocar.
FORBIDDEN_TARGET_SLUGS = ("'adm'", "'coordinator'")

# Assinatura (argumentos) da função reescrita nesta fase.
FUNCTION = ("public.coordinator_set_role(uuid, text)", "(p_membership_id uuid, p_role_slug text)")

# RPCs/objetos que NAO podem ser recriados/duplicados aqui.
REUSED_OBJECTS = [
    "is_coordinator_of",
    "coordinator_get_requests",
    "coordinator_approve_membership",
    "coordinator_reject_membership",
    "coordinator_suspend_membership",
    "coordinator_restore_membership",
    "coordinator_remove_membership",
    "coordinator_set_manager",
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
    return _function_body(sql, "coordinator_set_role")


class TestArquivoEFuncoes:
    def test_migration_existe(self):
        assert MIGRATION.is_file(), f"migration ausente: {MIGRATION}"

    def test_apenas_uma_funcao_reescrita(self, sql):
        match = re.findall(r"CREATE OR REPLACE FUNCTION public\.[a-z_0-9]+\s*\(", sql)
        assert match == ["CREATE OR REPLACE FUNCTION public.coordinator_set_role("], (
            f"deve reescrever SOMENTE coordinator_set_role: {match}"
        )

    def test_funcao_presente(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.coordinator_set_role\s*\(", sql
        )

    def test_assinatura_inalterada(self, sql):
        assert "p_membership_id uuid" in sql
        assert "p_role_slug text" in sql
        assert "RETURNS void" in sql
        assert "LANGUAGE plpgsql" in sql

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


class TestLinhaVermelha:
    def test_uninga_preservado_whitelist_fechada(self, body):
        assert "NOT IN ('tec', 'vis', 'est', 'opv', 'lider')" in body
        for slug in ALLOWED_ROLE_SLUGS:
            assert slug in body, f"cargo permitido ausente: {slug}"

    def test_alvo_adm_rejeitado(self, body):
        assert "v_target_slug = 'adm'" in body
        assert "administrative memberships cannot have their role changed by the RPC" in body

    def test_alvo_coordinator_rejeitado_mensagem_preservada(self, body):
        assert "v_target_slug = 'coordinator'" in body
        assert "a coordination membership role cannot be changed by the RPC" in body

    def test_guarda_de_alvo_depois_do_escopo_e_status(self, body):
        """Fail-closed ordenado: escopo -> status -> linha vermelha -> UPDATE."""
        i_scope = body.find("public.is_coordinator_of(v_ws)")
        i_status = body.find("v_status <> 'active'")
        i_adm = body.find("v_target_slug = 'adm'")
        i_update = body.find("UPDATE public.memberships")
        assert i_scope != -1 and i_status != -1 and i_adm != -1 and i_update != -1
        assert i_scope < i_status < i_adm < i_update, (
            "ordem: escopo, depois status ativo, depois linha vermelha (adm/coordinator), depois UPDATE"
        )


class TestEscopoEEstado:
    def test_estado_de_partida_ativo(self, body):
        assert "v_status <> 'active'" in body
        assert "only active memberships can have their role changed" in body

    def test_escopo_fail_closed_e_security_definer(self, body):
        assert "public.is_coordinator_of(v_ws)" in body
        assert "only an active coordinator of this unit can change membership roles" in body
        assert "RAISE EXCEPTION" in body
        assert "SECURITY DEFINER" in body
        assert "SET search_path = public" in body

    def test_membership_inexistente_rejeitada(self, body):
        assert "membership not found" in body

    def test_cargo_alvo_inexistente_rejeitado(self, body):
        assert "target role" in body
        assert "not found" in body


class TestNaoEscala:
    def test_update_apenas_role_id(self, body):
        update = re.search(
            r"UPDATE public\.memberships\s+SET\s+role_id\s*=\s*v_role_id,.*?WHERE id = p_membership_id;",
            body,
            re.DOTALL,
        )
        assert update, "UPDATE da membership ausente"
        stmt = update.group(0)
        assert "role_id" in stmt and "updated_at" in stmt
        assert "managed_by" not in stmt, "managed_by não pode mudar no UPDATE principal"

    def test_neutralizacao_de_dependentes_preservada(self, body):
        neut = re.search(
            r"UPDATE public\.memberships\s+SET\s+managed_by = NULL,.*?WHERE managed_by = p_membership_id;",
            body,
            re.DOTALL,
        )
        assert neut, "neutralização de dependentes (065) ausente"
        assert "p_role_slug <> 'lider'" in body, "neutralização deve ocorrer ao sair de liderança"

    def test_nao_toca_profiles_role(self, sql):
        assert "UPDATE public.profiles" not in sql
        assert not re.search(r"profiles\s+SET\s+role", sql, re.IGNORECASE)
        assert "auth.users" not in sql
        assert "DELETE FROM public.profiles" not in sql

    def test_nao_toca_super_admin(self, sql):
        assert not re.search(r"is_super_admin", sql), "não pode mencionar is_super_admin"

    def test_nao_toca_auditoria_direta(self, sql):
        assert "app_audit_logs" not in sql, "auditoria é responsabilidade do trigger 054"


class TestACL:
    def test_revoga_anon_e_public(self, sql):
        for sig in ("coordinator_set_role(uuid, text)",):
            esc = re.escape(sig)
            assert re.search(rf"REVOKE ALL ON FUNCTION public\.{esc} FROM PUBLIC", sql), sig
            assert re.search(rf"REVOKE ALL ON FUNCTION public\.{esc} FROM anon", sql), sig

    def test_concede_authenticated(self, sql):
        assert re.search(
            r"GRANT EXECUTE ON FUNCTION public\.coordinator_set_role\(uuid, text\) TO authenticated",
            sql,
        )