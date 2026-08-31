"""Revisão estática do SQL da migration 036_rbac2_schema.sql (ETAPA 4).

A suíte backend roda sem Postgres ao vivo (padrão das demais em api/tests:
fakes de requests/leitura estática do DDL). As garantias que vivem DENTRO da
transação SQL do RBAC 2.0 — existência das 5 tabelas, constraint de
status/scope/effect/outcome, UNIQUEs, seeds idempotentes sem duplicatas,
backfill idempotente, RLS de isolamento, impossibilidade de self-grant de
override e de forjar audit log — são verificadas por análise estática do DDL,
para que qualquer regressão futura na migration quebre o build.

Links:
  - Migration:       supabase/migrations/036_rbac2_schema.sql
  - Catálogo Actions: docs/architecture/rbac2.0-actions-catalog.md
  - Spec:             docs/architecture/rbac2.0-specification.md (§3, §5, §11)
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "036_rbac2_schema.sql"
CATALOG = Path(__file__).resolve().parents[2] / "docs" / "architecture" / "rbac2.0-actions-catalog.md"

TABLES = {
    "roles",
    "role_permissions",
    "memberships",
    "membership_overrides",
    "rbac_audit_logs",
}


def _normalize(text: str) -> str:
    """Colapsa quebras de linha/whitespace para que asserts estáticos sejam
    robustos a quebra de linha do DDL (índices/policies multilinha)."""
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def catalog() -> str:
    return CATALOG.read_text(encoding="utf-8")


def _table_ddl(sql: str, name: str) -> str:
    m = re.search(rf"CREATE TABLE IF NOT EXISTS public\.{name}\s*\((.*?)\);", sql, re.DOTALL)
    assert m, f"CREATE TABLE public.{name} não encontrado"
    return m.group(1)


class TestTablesExist:
    def test_todas_as_5_tabelas_do_schema_rbac_criadas(self, sql):
        for t in TABLES:
            assert f"CREATE TABLE IF NOT EXISTS public.{t}" in sql, f"tabela {t} ausente"

    def test_schema_nao_cria_tabelas_fora_do_escopo(self, sql):
        created = set(re.findall(r"CREATE TABLE IF NOT EXISTS public\.([a-z_]+)", sql))
        assert created == TABLES, f"tabelas inesperadas criadas: {created - TABLES}"

    def test_rls_habilitado_em_todas(self, sql):
        for t in TABLES:
            assert f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;" in sql


class TestConstraints:
    def test_roles_unique_slug_e_fk_workspace_cascade(self, sql):
        ddl = _table_ddl(sql, "roles")
        assert "CONSTRAINT roles_slug_unique UNIQUE (slug)" in ddl
        assert re.search(r"workspace_id\s+uuid\s+REFERENCES\s+public\.workspaces\(id\)\s+ON DELETE CASCADE", ddl)

    def test_role_permissions_scope_check_e_unique(self, sql):
        ddl = _table_ddl(sql, "role_permissions")
        assert "CHECK (scope IN ('workspace', 'global', 'self'))" in ddl
        assert "UNIQUE (role_id, action, scope)" in ddl

    def test_memberships_status_check_fk_restrict_e_unique(self, sql):
        ddl = _table_ddl(sql, "memberships")
        assert "CHECK (status IN ('pending', 'active', 'suspended', 'removed'))" in ddl
        assert "REFERENCES public.roles(id) ON DELETE RESTRICT" in ddl
        assert "UNIQUE (profile_id, workspace_id)" in ddl
        assert "REFERENCES public.profiles(id) ON DELETE CASCADE" in ddl
        assert "REFERENCES public.workspaces(id) ON DELETE CASCADE" in ddl

    def test_membership_overrides_effect_check_e_unique(self, sql):
        ddl = _table_ddl(sql, "membership_overrides")
        assert "CHECK (effect IN ('allow', 'deny'))" in ddl
        assert "UNIQUE (membership_id, action)" in ddl

    def test_rbac_audit_logs_effect_outcome_check(self, sql):
        ddl = _table_ddl(sql, "rbac_audit_logs")
        assert "CHECK (effect IN ('allow', 'deny'))" in ddl
        assert "CHECK (outcome IN ('success', 'denied'))" in ddl

    def test_rbac_audit_logs_indices_solicitados(self, sql):
        # actor_id, workspace_id, action, ts, (workspace_id, ts), (actor_id, ts)
        required_ix = [
            "idx_rbac_audit_actor ON public.rbac_audit_logs (actor_id)",
            "idx_rbac_audit_workspace ON public.rbac_audit_logs (workspace_id)",
            "idx_rbac_audit_action ON public.rbac_audit_logs (action)",
            "idx_rbac_audit_ts ON public.rbac_audit_logs (\"timestamp\")",
            "idx_rbac_audit_workspace_ts ON public.rbac_audit_logs (workspace_id, \"timestamp\")",
            "idx_rbac_audit_actor_ts ON public.rbac_audit_logs (actor_id, \"timestamp\")",
        ]
        for ix in required_ix:
            assert ix in sql, f"índice ausente: {ix}"

    def test_rbac_audit_logs_meta_nao_guarda_segredos_documentado(self, sql):
        assert "meta" in _table_ddl(sql, "rbac_audit_logs")
        assert "NEVER contain secrets" in sql or "never store secrets" in sql.lower()


class TestSeeds:
    def test_super_admin_nao_vira_role(self, sql):
        # Super Admin não tem row em roles (é capability is_super_admin, spec §8).
        slugs = re.findall(r"INSERT INTO public\.roles \(slug[^)]*\)\s*VALUES\s*(.*?)\s*ON CONFLICT", sql, re.DOTALL)
        all_slugs = " ".join(slugs)
        assert re.search(r"'\w+', NULL, '", all_slugs)  # blueprints com workspace NULL
        # nenhuma menção a 'super' como slug de role
        assert not re.search(r"\(\s*'super[^']*'\s*,", all_slugs, re.IGNORECASE)

    def test_system_roles_semeados_e_marcados(self, sql):
        for slug in ("'tec'", "'vis'", "'est'", "'opv'", "'adm'"):
            assert slug in sql, f"role seed ausente: {slug}"
        assert "is_system" in _table_ddl(sql, "roles")
        # upsert idempotente (ON CONFLICT slug)
        assert re.search(r"INSERT INTO public\.roles .*ON CONFLICT \(slug\) DO UPDATE", sql, re.DOTALL)

    def test_permissions_nao_duplicadas(self, sql):
        """Cada (role, action, scope) aparece no máximo uma vez no INSERT."""
        seen = set()
        for m in re.finditer(r"\(\s*(v_\w+)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", sql):
            key = (m.group(1), m.group(2), m.group(3))
            assert key not in seen, f"permission duplicada: {key}"
            seen.add(key)

    def test_todas_as_actions_semeadas_existem_no_catalogo(self, sql, catalog):
        """Nenhuma Action inventada: cada ação semeada deve existir literalmente no catálogo."""
        seeded = set()
        for m in re.finditer(r"\(\s*v_\w+\s*,\s*'([^']+)'\s*,\s*'[^']+'\s*\)", sql):
            seeded.add(m.group(1))
        for action in seeded:
            assert re.search(rf"\b{re.escape(action)}\b", catalog), (
                f"Action {action!r} semeada mas NÃO existe no catálogo (permission-by-accident)"
            )

    def test_nenhum_wildcard_de_action_semeado(self, sql):
        """Regra do task: sem 'stock.*'/'ticket.*'/'*.read' — engine é exact-match."""
        assert not re.search(r"\(\s*v_\w+\s*,\s*'[^']*[\*]", sql), "wildcard em action semeada"

    def test_permissions_upsert_idempotente(self, sql):
        assert sql.count("ON CONFLICT (role_id, action, scope) DO NOTHING") >= 5


class TestBackfill:
    def test_backfill_mapeia_technician_viewer_admin(self, sql):
        assert re.search(r"r\.slug = 'tec'\s*WHERE p\.role = 'technician'", sql)
        assert re.search(r"r\.slug = 'vis'\s*WHERE p\.role = 'viewer'", sql)
        assert re.search(r"r\.slug = 'adm'\s*WHERE p\.role = 'admin'", sql)

    def test_backfill_usa_workspace_ids_unnest(self, sql):
        assert "unnest(p.workspace_ids)" in sql

    def test_backfill_idempotente_e_nao_toca_legado(self, sql):
        assert "ON CONFLICT (profile_id, workspace_id) DO NOTHING" in sql
        # Não remove nem reescreve profiles.workspace_ids / profiles.role
        assert "DELETE FROM public.profiles" not in sql
        assert "UPDATE public.profiles" not in sql

    def test_backfill_reporta_contagens(self, sql):
        assert "RAISE NOTICE" in sql
        assert "profiles without workspaces" in sql
        assert "unknown/null role" in sql


class TestRLSIsolation:
    def test_escrita_super_admin_only(self, sql):
        """Nenhum usuario comum pode escrever memberships/overrides/roles/permissions."""
        for table in ("roles", "role_permissions", "memberships", "membership_overrides"):
            for op in ("INSERT", "UPDATE", "DELETE"):
                assert re.search(
                    rf'CREATE POLICY "{table}_{op.lower()}"[\s\S]*?is_super_admin\(\)',
                    sql,
                ), f"{table} {op} deve ser gated em is_super_admin()"

    def test_usuario_nao_pode_auto_conceder_override(self, sql):
        """membership_overrides write é super-only: user não se dá override."""
        insert_policy = re.search(
            r'CREATE POLICY "membership_overrides_insert"[\s\S]*?WITH CHECK \(public\.is_super_admin\(\)\);',
            sql,
        )
        assert insert_policy, "override insert deve ser super-only"
        update_policy = re.search(
            r'CREATE POLICY "membership_overrides_update"[\s\S]*?WITH CHECK \(public\.is_super_admin\(\)\);',
            sql,
        )
        assert update_policy, "override update deve ser super-only"

    def test_isolamento_workspace_nos_select(self, sql):
        """Seleção de memberships/permissions é workspace-isolada."""
        assert "user_belongs_to_workspace(public.memberships.workspace_id)" in sql
        assert "user_belongs_to_workspace" in sql

    def test_audit_log_nao_forjavel(self, sql):
        """rbac_audit_logs: SELECT super-only, sem INSERT/UPDATE/DELETE p/ authenticated."""
        assert re.search(r'CREATE POLICY "rbac_audit_logs_select"[\s\S]*?is_super_admin\(\s*\)', sql)
        # nenhuma policy de INSERT/UPDATE/DELETE para rbac_audit_logs (append-only)
        for op in ("insert", "update", "delete"):
            assert not re.search(rf'CREATE POLICY "rbac_audit_logs_{op}"', sql), (
                f"rbac_audit_logs não deve ter policy de {op} p/ authenticated"
            )
        assert "FORCE ROW LEVEL SECURITY" in sql
        assert "REVOKE ALL ON public.rbac_audit_logs FROM anon;" in sql

    def test_toda_policy_usa_drop_if_exists(self, sql):
        """Convenção do repo: DROP POLICY IF EXISTS antes de cada CREATE POLICY."""
        bodies = re.findall(r"CREATE POLICY \"[^\"]+\"", sql)
        for b in bodies:
            policy_name = re.search(r"\"([^\"]+)\"", b).group(1)
            assert f'DROP POLICY IF EXISTS "{policy_name}" ON public.' in sql, (
                f"policy {policy_name} sem DROP IF EXISTS prévio"
            )
