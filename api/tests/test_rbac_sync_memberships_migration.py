"""Revisão estática da migration 041_rbac2_sync_memberships.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: fakes de
requests / leitura estática do DDL). Esta migration garante que a APROVAÇÃO
de usuário (que grava SÓ `profiles` — via adminService ou /api/push/action)
também cria/atualiza/remove `memberships`, sem o que o motor RBAC negaria
tudo para usuários novos aprovados (fail-closed que trava o fluxo real).

Garantias verificadas aqui (todas DENTRO da transação/DDL):
  - Função de sincronização SECURITY DEFINER com search_path fixo.
  - Trigger AFTER INSERT OR UPDATE OF (status, role, workspace_ids,
    is_super_admin), FOR EACH ROW, via wrapper trg_sync_user_memberships()
    (CREATE TRIGGER não aceita expressões como NEW.id como argumento).
  - Mapeamento determinístico role→slug (mesmo da 036/040), nos dois
    formatos (legado e roleId).
  - Fail-closed: active ∧ NOT super ∧ role conhecida ∧ workspace atribuído.
  - Idempotente (ON CONFLICT) e non-destrutivo ao legado (profiles/roles).
  - EXECUTE revogado de anon/PUBLIC e liberado apenas a authenticated.
  - Nenhuma tabela nova, nenhum RLS novo, nenhum seed novo.

Links:
  - Migration:       supabase/migrations/041_rbac2_sync_memberships.sql
  - Spec RBAC 2.0:    docs/architecture/rbac2.0-specification.md
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "041_rbac2_sync_memberships.sql"

# Mapeamento determinístico esperado (legado | roleId → slug):
ROLE_MAPPING = {
    "technician": "tec",
    "role-technician": "tec",
    "viewer": "vis",
    "role-viewer": "vis",
    "admin": "adm",
    "role-admin": "adm",
    "coordinator": "coordinator",
    "role-coordinator": "coordinator",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


class TestFunctionEProtecao:
    def test_cria_funcao_secdef_com_search_path(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.sync_user_memberships\(p_profile_id uuid\)",
            sql,
        )
        assert "SECURITY DEFINER" in sql
        assert "SET search_path = public" in sql


class TestTrigger:
    def test_trigger_apos_insert_update_das_colunas_centrais(self, sql):
        assert re.search(
            r"CREATE TRIGGER trg_profiles_sync_memberships\s+AFTER INSERT OR UPDATE OF "
            r"status, role, workspace_ids, is_super_admin\s+ON public\.profiles\s+"
            r"FOR EACH ROW\s+EXECUTE FUNCTION public\.trg_sync_user_memberships\(\)",
            sql,
        )

    def test_wrapper_delega_para_funcao_parametrizada_com_new_id(self, sql):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.trg_sync_user_memberships\(\)\s+RETURNS trigger",
            sql,
        )
        assert "PERFORM public.sync_user_memberships(NEW.id)" in sql

    def test_trigger_idempotente(self, sql):
        assert re.search(r"DROP TRIGGER IF EXISTS trg_profiles_sync_memberships ON public\.profiles", sql)


class TestMapeamentoDeterministico:
    def test_mapeia_os_dois_formatos_para_os_quatro_slugs(self, sql):
        # Cada forma (legado e roleId) precisa aparecer no CASE da função.
        for legado, slug in ROLE_MAPPING.items():
            assert legado in sql, f"forma legado/roleId {legado!r} ausente no mapeamento"
        for slug in sorted(set(ROLE_MAPPING.values())):
            assert f"THEN '{slug}'" in sql, f"slug {slug!r} ausente no mapeamento"


class TestFailClosed:
    def test_condicao_de_membership_exige_active_nao_super_role_e_workspace(self, sql):
        assert "v_status = 'active' AND NOT v_is_super AND v_role_slug IS NOT NULL" in sql
        # No DELETE, o workspace precisa estar em workspace_ids (via ANY).
        assert "m.workspace_id = ANY (v_ws)" in sql

    def test_insert_tambem_exige_mesma_condicao(self, sql):
        assert re.search(
            r"IF v_status = 'active' AND NOT v_is_super AND v_role_slug IS NOT NULL",
            sql,
        )

    def test_workspace_nao_existente_e_ignorado_sem_abortar(self, sql):
        assert "WHERE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = ws)" in sql


class TestIdempotenciaENaoDestrutivo:
    def test_upsert_idempotente(self, sql):
        assert "ON CONFLICT (profile_id, workspace_id) DO UPDATE SET" in sql

    def test_reconcile_inicial_roda_o_mesmo_algoritmo(self, sql):
        assert "FOR r IN SELECT id FROM public.profiles" in sql
        assert re.search(r"PERFORM public\.sync_user_memberships\(r\.id\)", sql)
        assert "RAISE NOTICE" in sql

    def test_nao_toca_profiles_roles_workspaces_legado(self, sql):
        assert "DELETE FROM public.profiles" not in sql
        assert "UPDATE public.profiles" not in sql
        assert "DELETE FROM public.roles" not in sql
        assert "DELETE FROM public.workspaces" not in sql
        assert "DROP TABLE" not in sql
        assert "TRUNCATE" not in sql
        assert "CREATE TABLE" not in sql
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql
        assert "ALTER TABLE" not in sql

    def test_nao_seed_novos_roles_ou_permissions(self, sql):
        assert "INSERT INTO public.roles" not in sql
        assert "INSERT INTO public.role_permissions" not in sql


class TestPermissoesDeExecucao:
    def test_execute_revogado_de_anon_e_public(self, sql):
        assert re.search(
            r"REVOKE ALL ON FUNCTION public\.sync_user_memberships\(uuid\) FROM PUBLIC;",
            sql,
        )
        assert re.search(
            r"REVOKE ALL ON FUNCTION public\.sync_user_memberships\(uuid\) FROM anon;",
            sql,
        )
        assert re.search(
            r"REVOKE ALL ON FUNCTION public\.trg_sync_user_memberships\(\) FROM PUBLIC;",
            sql,
        )
        assert re.search(
            r"REVOKE ALL ON FUNCTION public\.trg_sync_user_memberships\(\) FROM anon;",
            sql,
        )

    def test_execute_liberado_a_authenticated(self, sql):
        assert re.search(
            r"GRANT EXECUTE ON FUNCTION public\.sync_user_memberships\(uuid\) TO authenticated;",
            sql,
        )
        assert re.search(
            r"GRANT EXECUTE ON FUNCTION public\.trg_sync_user_memberships\(\) TO authenticated;",
            sql,
        )