"""Revisão estática da migration 040_rbac2_coordinator_role.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: fakes de
requests / leitura estática do DDL). As garantias que vivem DENTRO da
transação SQL — seed idempotente do cargo, permissions limitadas a Actions
literais do catálogo, ausência total de Actions administrativas/destrutivas,
sem wildcards, backfill idempotente e sem tocar o legado — são verificadas
aqui, para que qualquer regressão futura quebre o build.

Links:
  - Migration:       supabase/migrations/040_rbac2_coordinator_role.sql
  - Catálogo Actions: docs/architecture/rbac2.0-actions-catalog.md
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "040_rbac2_coordinator_role.sql"
CATALOG = Path(__file__).resolve().parents[2] / "docs" / "architecture" / "rbac2.0-actions-catalog.md"

# Conjunto EXATO de Actions que o coordenador pode ter (espelho do seed):
COORD_ACTIONS = sorted(
    [
        "ticket.view",
        "ticket.edit",
        "ticket.status",
        "ticket.assign",
        "ticket.comment",
        "ticket.close",
        "ticket.reopen",
        "ticket.report",
        "ticket.qr",
        "stock.export",
        "pcare.export",
    ]
)

# Actions que o coordenador NUNCA pode ter (linhas vermelhas):
PROHIBITED = {
    "ticket.delete",
    "ticket.feedback",
    "ticket.weeklyEmail",
    "tv.content.manage",
    "tv.urgentAnnouncement",
    "tv.device.manage",
    "tv.purge",
    "tv.settings.manage",
    "stock.item.create",
    "stock.item.edit",
    "stock.item.delete",
    "stock.movement.create",
    "stock.movement.manage",
    "stock.kit.audit",
    "stock.inventory.run",
    "stock.maintenance.manage",
    "pcare.asset.create",
    "pcare.asset.edit",
    "pcare.asset.manage",
    "pcare.part.create",
    "pcare.part.edit",
    "pcare.part.delete",
    "pcare.maintenance.manage",
    "pcare.import",
    "reservelab.tablet.reserve",
    "reservelab.tablet.cancel",
    "reservelab.push.manage",
    "music.request",
    "music.moderate",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def catalog() -> str:
    return CATALOG.read_text(encoding="utf-8")


def _seeded_permissions(sql: str):
    """Retorna {(action, scope)} semeado na 040 (formato do DO block da 036)."""
    out = set()
    for m in re.finditer(r"\(\s*(v_coord)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", sql):
        out.add((m.group(2), m.group(3)))
    return out


class TestSeedRole:
    def test_role_coordinator_seeded(self, sql):
        assert re.search(
            r"INSERT INTO public\.roles \(slug, workspace_id, name, description, is_system, is_default\).*"
            r"'coordinator', NULL, 'Coordenador Multiunidade'",
            sql,
            re.DOTALL,
        ), "seed do cargo coordinator ausente"

    def test_seed_idempotente_upsert(self, sql):
        assert re.search(r"INSERT INTO public\.roles .*ON CONFLICT \(slug\) DO UPDATE", sql, re.DOTALL)

    def test_super_admin_nao_vira_role(self, sql):
        # Super Admin é is_super_admin (capability), nunca um cargo/membership.
        assert not re.search(r"\(?'super[^']*'", sql, re.IGNORECASE)

    def test_is_system_marcado(self, sql):
        # O cargo é is_system: bloco de backfill depende do slug existir.
        assert re.search(r"'Coordenador Multiunidade'.*true, false", sql, re.DOTALL)


class TestPermissions:
    def test_permissoes_escopo_workspace_only(self, sql):
        actions = _seeded_permissions(sql)
        assert actions, "nenhuma permission semeada"
        for action, scope in actions:
            assert scope == "workspace", f"{action} com escopo inesperado {scope!r}"

    def test_permissoes_exatamente_o_esperado(self, sql):
        actions = sorted(a for a, _ in _seeded_permissions(sql))
        assert actions == COORD_ACTIONS, f"conjunto divergente: {set(actions) ^ set(COORD_ACTIONS)}"

    def test_permissoes_unicas(self, sql):
        perms = _seeded_permissions(sql)
        assert len(perms) == len(COORD_ACTIONS)

    def test_sem_wildcard(self, sql):
        assert not re.search(r"\(\s*v_coord\s*,\s*'[^']*[\*]", sql), "wildcard em action semeada"

    def test_actions_semeadas_existem_no_catalogo(self, sql, catalog):
        for action, _ in _seeded_permissions(sql):
            assert re.search(rf"\b{re.escape(action)}\b", catalog), (
                f"Action {action!r} semeada mas NÃO existe no catálogo (permission-by-accident)"
            )

    def test_nenhuma_action_proibida(self, sql):
        seeded = {a for a, _ in _seeded_permissions(sql)}
        assert not (seeded & PROHIBITED), f"Actions proibidas semeadas: {sorted(seeded & PROHIBITED)}"

    def test_nenhuma_action_admin(self, sql):
        seeded = {a for a, _ in _seeded_permissions(sql)}
        assert not [a for a in seeded if a.startswith("admin.")], "coordinator não pode ter admin.*"

    def test_upsert_permissions_idempotente(self, sql):
        assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in sql


class TestBackfill:
    def test_backfill_mapeia_coordinator_profiles(self, sql):
        assert "r.slug = 'coordinator'" in sql
        assert "p.role IN ('coordinator', 'role-coordinator')" in sql

    def test_backfill_usa_unnest_workspace_ids(self, sql):
        assert "unnest(p.workspace_ids)" in sql

    def test_backfill_idempotente(self, sql):
        assert "ON CONFLICT (profile_id, workspace_id) DO NOTHING" in sql

    def test_backfill_reporta_notice(self, sql):
        assert "RAISE NOTICE" in sql
        assert "coordinator backfill" in sql

    def test_nao_toca_legado_destrutivamente(self, sql):
        assert "DELETE FROM public.profiles" not in sql
        assert "UPDATE public.profiles" not in sql
        assert "DROP TABLE" not in sql
        assert "TRUNCATE" not in sql
        assert "DELETE FROM public.roles" not in sql


class TestSemNovaSuperficie:
    def test_nao_cria_tabelas(self, sql):
        assert "CREATE TABLE" not in sql

    def test_nao_cria_functions(self, sql):
        # Sem functions ⇒ sem novo default privilege de EXECUTE (aula da 039:
        # o template concede EXECUTE a anon/authenticated/service_role).
        assert "CREATE FUNCTION" not in sql
        assert "CREATE OR REPLACE FUNCTION" not in sql
        assert "SECURITY DEFINER" not in sql

    def test_nao_alterna_rls(self, sql):
        assert "ALTER TABLE" not in sql
        assert "CREATE POLICY" not in sql
        assert "DROP POLICY" not in sql