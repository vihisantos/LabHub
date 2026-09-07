"""Revisão estática da migration 044_rls_hardening_profiles_workspaces.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática
do DDL). Esta migration endurece o RLS de `profiles` e `workspaces`
(Issue #158): remove os dois USING(true) e consolida as policies de escrita de
workspaces para `is_super_admin()`.

Garantias verificadas aqui (estruturais, dentro do corpo da migration):
  - Helper nova `profile_visible_to_me(uuid)`: SECURITY DEFINER, STABLE,
    SET search_path = public, fail-closed (target_user IS NOT NULL ...), usa a
    coluna REAL `profile_id` de public.memberships, com status='active' nos
    dois lados do overlap.
  - Grants da helper: REVOKE de anon/PUBLIC + GRANT a authenticated e
    service_role (lição da 028 — sem REVOKE órfão sem GRANT a authenticated).
  - profiles_select: `id = auth.uid() OR is_super_admin() OR
    profile_visible_to_me(id)` — sem USING(true).
  - workspaces_select: `is_super_admin() OR user_belongs_to_workspace(id)` —
    sem USING(true).
  - workspaces_insert/update/delete: `is_super_admin()` (consolidação
    009 role='admin' → 028-era).
  - NÃO mexe em profiles_insert/update/delete próprias, admin_abs_*,
    memberships/RBAC2, nem em esquema/colunas.

Links:
  - Migration:     supabase/migrations/044_rls_hardening_profiles_workspaces.sql
  - Discovery:     docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md
  - Design:        docs/audits/architecture/rbac2.0-rls-hardening-044-design.md
"""

import pytest
import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "044_rls_hardening_profiles_workspaces.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _no_using_true(sql: str) -> None:
    # Garante que nenhuma policy de SELECT em profiles/workspaces repõe
    # USING (true): procurar por "USING (true)" ou "USING ( true )".
    assert "using (true" not in sql.lower()
    assert "using true" not in sql.lower()


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("044_")


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


class TestHelper:
    def test_cria_funcao(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.profile_visible_to_me\(target_user uuid\)",
            sql,
        )

    def test_secdef_stable_search_path(self, sql):
        assert "SECURITY DEFINER" in sql
        assert "STABLE" in sql
        assert "SET search_path = public" in sql

    def test_fail_closed_null(self, sql):
        assert "target_user IS NOT NULL" in sql

    def test_regra_do_proprio_perfil(self, sql):
        assert "target_user = auth.uid()" in sql

    def test_super_admin_coalesce(self, sql):
        assert "COALESCE" in sql
        assert "is_super_admin" in sql

    def test_overlap_usa_coluna_real_profile_id(self, sql):
        # A coluna da 036 é profile_id (não user_id).
        assert "m_mine.profile_id = auth.uid()" in sql
        assert "m_other.profile_id = target_user" in sql
        assert "m_mine.user_id" not in sql
        assert "m_other.user_id" not in sql

    def test_overlap_exige_active_nos_dois_lados(self, sql):
        assert "m_mine.status = 'active'" in sql
        assert "m_other.status = 'active'" in sql

    def test_overlap_faz_join_por_workspace_id(self, sql):
        assert "m_other.workspace_id = m_mine.workspace_id" in sql

    def test_sem_sql_dinamico_ou_exception(self, sql):
        # Função LANGUAGE sql não pode conter dynamic SQL nem RAISE.
        assert "EXECUTE format(" not in sql
        assert "EXECUTE '" not in sql
        assert "RAISE" not in sql


class TestGrants:
    def test_revoke_anon_public(self, sql):
        assert re.search(
            r"REVOKE EXECUTE ON FUNCTION public\.profile_visible_to_me\(uuid\) FROM anon;", sql
        )
        assert re.search(
            r"REVOKE EXECUTE ON FUNCTION public\.profile_visible_to_me\(uuid\) FROM PUBLIC;", sql
        )

    def test_grant_authenticated_e_service_role(self, sql):
        assert re.search(
            r"GRANT\s+EXECUTE ON FUNCTION public\.profile_visible_to_me\(uuid\) TO authenticated;", sql
        )
        assert re.search(
            r"GRANT\s+EXECUTE ON FUNCTION public\.profile_visible_to_me\(uuid\) TO service_role;", sql
        )


class TestPoliciesProfiles:
    def test_profiles_select_restringe_leitura(self, sql):
        assert re.search(
            r"DROP POLICY IF EXISTS \"profiles_select\" ON public\.profiles;", sql
        )
        assert "id = auth.uid()" in sql
        assert "public.is_super_admin()" in sql
        assert "public.profile_visible_to_me(id)" in sql
        _no_using_true(sql)

    def test_nao_altera_policies_proprias_de_perfil(self, sql):
        # Insert/update/delete próprias permanecem como estão (não recriadas).
        assert "CREATE POLICY \"profiles_insert\"" not in sql
        assert "CREATE POLICY \"profiles_update\"" not in sql
        assert "CREATE POLICY \"profiles_delete\"" not in sql
        assert "CREATE POLICY \"admin_abs_edit_profiles\"" not in sql
        assert "CREATE POLICY \"admin_abs_delete_profiles\"" not in sql


class TestPoliciesWorkspaces:
    def test_workspaces_select_restringe_leitura(self, sql):
        assert re.search(
            r"DROP POLICY IF EXISTS \"workspaces_select\" ON public\.workspaces;", sql
        )
        assert "public.is_super_admin()" in sql
        assert "public.user_belongs_to_workspace(id)" in sql
        _no_using_true(sql)

    def test_workspaces_insert_is_super_admin(self, sql):
        assert re.search(
            r"CREATE POLICY \"workspaces_insert\".*WITH CHECK \(public\.is_super_admin\(\)\)", sql
        )

    def test_workspaces_update_is_super_admin(self, sql):
        assert re.search(
            r"CREATE POLICY \"workspaces_update\".*USING \(public\.is_super_admin\(\)\)", sql
        )

    def test_workspaces_delete_is_super_admin(self, sql):
        assert re.search(
            r"CREATE POLICY \"workspaces_delete\".*USING \(public\.is_super_admin\(\)\)", sql
        )

    def test_nao_tem_policy_legacy_role_admin(self, sql):
        # Nenhuma policy nova de workspaces usa a emergência 009
        # (role='admin'); todas usam is_super_admin() (verificado acima).
        assert "USING (EXISTS" not in sql
        assert "WITH CHECK (EXISTS" not in sql


class TestEscopoMinimo:
    def test_nao_altera_schema(self, sql):
        assert "CREATE TABLE" not in sql
        assert "ALTER TABLE" not in sql
        assert "CREATE INDEX" not in sql
        assert "DROP TABLE" not in sql
        assert "TRUNCATE" not in sql

    def test_apenas_as_quatro_policies_esperadas(self, sql):
        expected = {
            "CREATE POLICY \"profiles_select\"",
            "CREATE POLICY \"workspaces_select\"",
            "CREATE POLICY \"workspaces_insert\"",
            "CREATE POLICY \"workspaces_update\"",
            "CREATE POLICY \"workspaces_delete\"",
        }
        created = re.findall(r'CREATE POLICY "[a-z_]+"', sql)
        assert set(created) == expected, f"policies recriadas inesperadas: {created}"

    def test_nao_to_em_tabelas_legado(self, sql):
        assert "INSERT INTO public.workspaces" not in sql
        assert "UPDATE public.workspaces SET" not in sql
        assert "DELETE FROM public.workspaces" not in sql


# Fixture acessível a todos os testes (mesmo padrão do 041):
def test_fixture_sql_disponivel(sql):
    assert len(sql) > 200