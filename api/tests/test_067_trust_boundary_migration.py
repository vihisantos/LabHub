"""Revisão estática da migration 067 (Fase 5.1 - Trust Boundary).

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática do
DDL). Os invariantes que vivem DENTRO da transação SQL — UPDATE autoelevando
`is_super_admin`/`role`/`status`/`app_access` sendo rejeitado, edição legítima de
perfil passando, super admin preservado, funções legadas de sync ausentes do
catálogo — são verificados aqui para que qualquer regressão quebre o build.

A cobertura COMPORTAMENTAL (transação real + ROLLBACK, com `auth.uid()` via
`set_config('request.jwt.claim.sub', ...)`) vive em
scripts/validate_rbac2_trust_boundary_067_dev.py (roda contra o DEV).

Links:
  - Migration:      supabase/migrations/067_rbac2_trust_boundary_profiles.sql
  - Policy base:    supabase/migrations/028_authorization_consolidation.sql
  - Sync legado:    supabase/migrations/041_rbac2_sync_memberships.sql
  - Desligamento:   supabase/migrations/053_rbac2_disable_legacy_sync.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "067_rbac2_trust_boundary_profiles.sql"

# Imutaveis em UPDATE normal para QUALQUER ator autenticado (inclusive Super
# Admin); so contexto confiavel (auth.uid() IS NULL) altera.
IMMUTABLE_FOR_EVERYONE = ["id", "workspace_ids"]

# Editaveis por Super Admin via /admin; bloqueados para usuario comum.
ADMIN_EDITABLE_BY_SUPER = ["is_super_admin", "role", "status", "app_access"]

# O que o usuario comum NAO pode alterar na propria linha.
COMMON_BLOCKED = ADMIN_EDITABLE_BY_SUPER

LEGACY_SYNC = [
    "sync_user_memberships(uuid)",
    "trg_sync_user_memberships()",
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

    def test_guarda_presente(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.guard_profile_privileged_columns\s*\(", sql
        )

    def test_guarda_security_definer_e_search_path_fixo(self, sql):
        body = _function_body(sql, "guard_profile_privileged_columns")
        assert "SECURITY DEFINER" in body
        assert "SET search_path = public" in body

    def test_trigger_before_update_em_profiles(self, sql):
        assert "DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles" in sql
        assert re.search(
            r"CREATE TRIGGER trg_profiles_guard_privileged\s+BEFORE UPDATE ON public\.profiles",
            sql,
        )

    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql

    def test_nao_toca_auditoria(self, sql):
        assert "app_audit_logs" not in sql

    def test_nao_toca_managed_by(self, sql):
        assert "managed_by" not in sql

    def test_nao_recria_rpcs_de_coordenacao(self, sql):
        for name in (
            "coordinator_approve_membership",
            "coordinator_reject_membership",
            "coordinator_suspend_membership",
            "coordinator_restore_membership",
            "coordinator_remove_membership",
            "admin_set_user_memberships",
        ):
            assert not re.search(
                rf"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION)\s+public\.{name}\s*\(", sql
            ), f"não deveria recriar {name}"


class TestGuardaDeColunas:
    @staticmethod
    def _body(sql: str) -> str:
        return _function_body(sql, "guard_profile_privileged_columns")

    def test_contexto_confiavel_e_permitido(self, sql):
        body = self._body(sql)
        assert "auth.uid() IS NULL" in body
        assert "RETURN NEW" in body

    def test_super_admin_e_permitido_apos_imutaveis(self, sql):
        body = self._body(sql)
        assert "public.is_super_admin()" in body
        # O bypass de Super Admin vem DEPOIS das guardas de id/workspace_ids.
        assert body.index("auth.uid() IS NULL") < body.index("public.is_super_admin()")

    def test_id_e_workspace_ids_imutaveis_antes_do_bypass(self, sql):
        body = self._body(sql)
        idx_super = body.index("public.is_super_admin()")
        for col in IMMUTABLE_FOR_EVERYONE:
            assert re.search(
                rf"NEW\.{col}\s+IS DISTINCT FROM OLD\.{col}", body
            ), f"coluna imutável sem guarda: {col}"
            idx_col = body.index(f"NEW.{col} IS DISTINCT FROM OLD.{col}")
            assert idx_col < idx_super, (
                f"{col} precisa ser validado ANTES do bypass de Super Admin"
            )

    def test_campos_administrativos_apos_o_bypass(self, sql):
        body = self._body(sql)
        idx_super = body.index("public.is_super_admin()")
        for col in ADMIN_EDITABLE_BY_SUPER:
            assert re.search(
                rf"NEW\.{col}\s+IS DISTINCT FROM OLD\.{col}", body
            ), f"campo administrativo sem guarda para comum: {col}"
            idx_col = body.index(f"NEW.{col} IS DISTINCT FROM OLD.{col}")
            assert idx_col > idx_super, (
                f"{col} deve ficar após o bypass de Super Admin (só comum bloqueado)"
            )

    def test_comum_bloqueado_para_campos_administrativos(self, sql):
        body = self._body(sql)
        block = body[body.index("public.is_super_admin()"):]
        for col in COMMON_BLOCKED:
            assert f"NEW.{col} IS DISTINCT FROM OLD.{col}" in block, (
                f"usuário comum não está bloqueado em {col}"
            )

    def test_bloqueio_e_excecao_42501(self, sql):
        body = self._body(sql)
        assert "RAISE EXCEPTION" in body
        assert "ERRCODE = '42501'" in body
        assert "profiles.id is immutable in normal UPDATE" in body
        assert "profiles.workspace_ids is immutable in normal UPDATE" in body

    def test_nao_permite_bypass_por_new_valor(self, sql):
        body = self._body(sql)
        # Nenhum caminho "RETURN NEW" condicionado ao próprio valor privilegiado.
        assert "NEW.is_super_admin = true" not in body
        assert "NEW.role =" not in body


class TestPolicyUpdate:
    def test_recria_policy(self, sql):
        assert 'DROP POLICY IF EXISTS "profiles_update" ON public.profiles' in sql
        assert re.search(r'CREATE POLICY "profiles_update"', sql)

    def test_preserva_using(self, sql):
        assert "USING ( auth.uid() = id OR public.is_super_admin() )" in sql

    def test_adiciona_with_check(self, sql):
        assert "WITH CHECK ( auth.uid() = id OR public.is_super_admin() )" in sql

    def test_nao_altera_outras_policies(self, sql):
        for name in ("profiles_insert", "profiles_delete", "profiles_select"):
            assert f'DROP POLICY IF EXISTS "{name}"' not in sql
            assert f'CREATE POLICY "{name}"' not in sql


class TestRemocaoDoSyncLegado:
    def test_dropa_funcao_e_wrapper(self, sql):
        for sig in LEGACY_SYNC:
            assert re.search(
                rf"DROP FUNCTION IF EXISTS public\.{re.escape(sig)}", sql
            ), f"não remove {sig}"

    def test_nao_recria_sync(self, sql):
        assert not re.search(
            r"(?:CREATE OR REPLACE FUNCTION|CREATE FUNCTION)\s+public\.(?:sync_user_memberships|trg_sync_user_memberships)\s*\(",
            sql,
        )

    def test_nao_concede_execute_ao_sync(self, sql):
        assert not re.search(
            r"GRANT EXECUTE ON FUNCTION public\.(?:sync_user_memberships|trg_sync_user_memberships)",
            sql,
        )

    def test_nao_recria_trigger_legado(self, sql):
        assert "trg_profiles_sync_memberships" not in sql
