"""Revisão estática da migration 107_profiles_access_optimization.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática
do DDL). Esta migration otimiza o acesso a `public.profiles` e as policies RLS
sem alterar a semântica de autorização.

Garantias verificadas (estruturais, dentro do corpo da migration):
  - Helpers recriados: is_super_admin, profile_visible_to_me,
    user_belongs_to_workspace(text/uuid).
  - Helpers SECURITY DEFINER, STABLE, SET search_path = public.
  - Helpers usam (SELECT auth.uid()) em vez de auth.uid() direto.
  - policies profiles_select/insert/update/delete e admin_abs_edit/delete_profiles
    recriadas com (SELECT auth.uid()) e (SELECT public.is_super_admin()).
  - Sem USING (true) / USING true.
  - Sem CREATE TABLE / ALTER TABLE / CREATE INDEX / DROP TABLE / TRUNCATE.
  - ROLLBACK documentado.
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "107_profiles_access_optimization.sql"
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("107_")


class TestHelpers:
    def test_is_super_admin_recriada(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.is_super_admin\(\)", sql
        )

    def test_profile_visible_to_me_recriada(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.profile_visible_to_me\(target_user uuid\)",
            sql,
        )

    def test_user_belongs_to_workspace_text_recriada(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.user_belongs_to_workspace\(ws_id text\)",
            sql,
        )

    def test_user_belongs_to_workspace_uuid_recriada(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.user_belongs_to_workspace\(ws_id uuid\)",
            sql,
        )

    def test_secdef_stable_search_path(self, sql):
        assert sql.count("SECURITY DEFINER") >= 4
        assert sql.count("STABLE") >= 4
        assert sql.count("SET search_path TO 'public'") >= 4

    def test_auth_uid_via_subselect(self, sql):
        # Helpers/policies devem usar (SELECT auth.uid()) para permitir initplan.
        # (Ocorrências textuais em comentários são toleradas.)
        assert sql.count("(SELECT auth.uid())") >= 4

    def test_is_super_admin_coalesce_preservado(self, sql):
        assert "COALESCE" in sql
        assert "is_super_admin" in sql

    def test_profile_visible_to_me_fail_closed(self, sql):
        assert "target_user IS NOT NULL" in sql

    def test_profile_visible_to_me_overlap_active(self, sql):
        assert "m_mine.status = 'active'" in sql
        assert "m_other.status = 'active'" in sql


class TestPolicies:
    def test_profiles_select_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "profiles_select" ON public\.profiles;', sql
        )
        assert re.search(
            r'CREATE POLICY "profiles_select"', sql
        )
        assert "(id = (SELECT auth.uid()))" in sql
        assert "(SELECT public.is_super_admin())" in sql
        assert "public.profile_visible_to_me(id)" in sql

    def test_profiles_insert_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "profiles_insert" ON public\.profiles;', sql
        )
        assert re.search(r'CREATE POLICY "profiles_insert"', sql)
        assert "((SELECT auth.uid()) = id)" in sql

    def test_profiles_update_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "profiles_update" ON public\.profiles;', sql
        )
        assert re.search(r'CREATE POLICY "profiles_update"', sql)

    def test_profiles_delete_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "profiles_delete" ON public\.profiles;', sql
        )
        assert re.search(r'CREATE POLICY "profiles_delete"', sql)

    def test_admin_abs_edit_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "admin_abs_edit_profiles" ON public\.profiles;',
            sql,
        )
        assert re.search(r'CREATE POLICY "admin_abs_edit_profiles"', sql)

    def test_admin_abs_delete_recriada(self, sql):
        assert re.search(
            r'DROP POLICY IF EXISTS "admin_abs_delete_profiles" ON public\.profiles;',
            sql,
        )
        assert re.search(r'CREATE POLICY "admin_abs_delete_profiles"', sql)

    def test_sem_using_true(self, sql):
        assert "using (true" not in sql.lower()
        assert "using true" not in sql.lower()


class TestEscopoMinimo:
    def test_nao_altera_schema(self, sql):
        assert "CREATE TABLE" not in sql
        assert "ALTER TABLE" not in sql
        assert "CREATE INDEX" not in sql
        assert "DROP TABLE" not in sql
        assert "TRUNCATE" not in sql

    def test_rollback_documentado(self, sql):
        assert "ROLLBACK" in sql

    def test_fixture_sql_disponivel(self, sql):
        assert len(sql) > 200
