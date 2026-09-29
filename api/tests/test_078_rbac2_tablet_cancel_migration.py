"""Revisão estática da migration 078 (#296 PR-4D-A — cancelamento de reserva de
tablet autorizado por RBAC 2.0).

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática):

  1. a migration 078 existe e é sequencial (imediatamente após a 077);
  2. a Action `reservelab.tablet.cancel` é semeada no escopo `workspace` apenas
     em `tec` — jamais em qualquer outra role (trava contra mass-grant);
  3. o par operacional `reservelab.tablet.reserve` + `reservelab.tablet.cancel`
     em `tec` permanece coerente (a reserve foi seedada na 036; a 078 não duplica
     nem remove);
  4. a helper `user_can_cancel_tablet_reservation` mantém a assinatura
     `(ws_id uuid)`, `SECURITY DEFINER` e `SET search_path = public` — a policy
     `tablet_reservations_update` (050) usa a helper e não pode quebrar;
  5. a helper resolve a cadeia `auth.uid() → memberships → workspace_id →
     role_id → role_permissions → reservelab.tablet.cancel@workspace`, exigindo
     membership ATIVA e amarrada à unidade avaliada (fail-closed);
  6. `profiles.app_access` e `profiles.role` deixam de ser consultados (e o
     profile NÃO é lido); o ramo legado (a) da 050 foi removido;
  7. o super admin NÃO entra na helper (o bypass vive nas policies — invariante
     vigente desde a 050, verificado também em test_050);
  8. a ACL é reaplicada e idêntica à da 050 (2 REVOKE + 2 GRANT);
  9. a policy consumidora (`tablet_reservations_update`) NÃO é reescrita;
 10. a migration NÃO faz backfill/promoção/remoção em `profiles`, `memberships`
     ou `roles` nem toca colunas de `app_access` (escopo F2 deliberado);
 11. a migration não cria Actions, não cria tabelas/views, não toca
     RBAC_2_ENABLED nem os demais módulos (TV/Chamados não são citados).

CUIDADO COM FALSOS POSITIVOS DE SUBSTRING (o mesmo bug que quebrou o Migrations
CI no PR-4A): `role_permissions` e `rp.role_id` contêm a substring `p.role`.
Por isso os testes usam REGEX COM FRONTEIRA (`\b`/lookarounds) e nunca um
`in`/`LIKE` ingênuo.

LIMITAÇÃO (comportamental): a prova de ALLOW/DENY com `auth.uid()` real roda
em `supabase/migrations/tests/078_rbac2_tablet_cancel.sql` (Migrations CI,
PostgreSQL efêmero). Aqui fica a verificação estrutural do que é executado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "078_rbac2_tablet_cancel.sql"
LEGACY_050 = MIGRATIONS_DIR / "050_tablet_reservations_cancel_rls.sql"
TEST_078 = MIGRATIONS_DIR / "tests" / "078_rbac2_tablet_cancel.sql"

HELPER = "user_can_cancel_tablet_reservation"
ACTION = "reservelab.tablet.cancel"
PAIR_ACTION = "reservelab.tablet.reserve"

# Roles que DEVEM receber `reservelab.tablet.cancel`.
EXPECTED_GRANT_ROLES = {"tec"}
# Roles que NUNCA podem receber (mass-grant — só o técnico operacional).
FORBIDDEN_GRANT_ROLES = {"opv", "vis", "est", "coordinator", "lider", "adm"}

# Nada disto pode aparecer no corpo EXECUTADO da migration.
FORBIDDEN_IN_MIGRATION = [
    "CREATE TABLE",
    "ALTER TABLE",
    "DROP TABLE",
    "DROP COLUMN",
    "CREATE TRIGGER",
    "CREATE POLICY",
    "DROP POLICY",
    "CREATE VIEW",
    "RBAC_2_ENABLED",
    "user_can_manage_tv",
    "tv.manage",
    "can_manage_workspace_apps",
    "workspace_ids",
    "DELETE FROM public.profiles",
    "UPDATE public.profiles",
    "INSERT INTO public.profiles",
    "DELETE FROM public.memberships",
    "UPDATE public.memberships",
    "INSERT INTO public.memberships",
    "UPDATE public.roles",
]
# `is_super_admin` NÃO entra na lista global: ele é citado legitimamente no
# COMMENT ON FUNCTION (que registra o invariante "o bypass vive nas policies").
# O que não pode é aparecer no CORPO da helper — isso é verificado em
# TestSuperAdminPermaneceNasPolicies.test_helper_nao_trata_super_admin.


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)


@pytest.fixture(scope="module")
def sql() -> str:
    return _read(MIGRATION)


@pytest.fixture(scope="module")
def body() -> str:
    """Só o que é executado, sem comentários."""
    return _strip_sql_comments(_read(MIGRATION))


@pytest.fixture(scope="module")
def helper() -> str:
    """Corpo da função recriada, extraído da migration."""
    match = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{HELPER}.*?\$\$;",
        _strip_sql_comments(_read(MIGRATION)),
        re.S,
    )
    assert match, f"a migration 078 deve recriar a helper {HELPER}"
    return match.group(0)


class TestExistenciaEOrdenacao:
    def test_migration_078_existe(self):
        assert MIGRATION.is_file(), "a migration 078 deve existir"

    def test_078_esta_sequenciada_apos_a_077(self):
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 77 in nums, f"a 077 deveria existir na sequência (numeros: {nums})"
        assert 78 in nums, f"a 078 deveria existir na sequência (numeros: {nums})"
        assert nums.index(78) > nums.index(77), "a 078 precisa vir depois da 077"
        assert nums.count(78) == 1, f"a 078 aparece {nums.count(78)}x na sequência"

    def test_078_e_a_unica_que_seedeia_o_cancel(self):
        criadores = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(r"INSERT INTO public\.role_permissions", _read(p), re.I)
            and re.search(rf"'{re.escape(ACTION)}'", _read(p))
        ]
        assert criadores == [MIGRATION.name], f"apenas a 078 semeia {ACTION}: {criadores}"


class TestActionReservelabTabletCancel:
    def test_action_criada_no_escopo_workspace(self, body):
        assert re.search(rf"'{re.escape(ACTION)}',\s*'workspace'", body), (
            f"a Action {ACTION} deve ser semeada com scope 'workspace'"
        )

    def test_seed_e_idempotente(self, body):
        assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in body

    def test_roles_que_recebem_sao_somente_tec(self, body):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block, "deve existir o INSERT de role_permissions"
        slugs = re.findall(r"\b(v_tec|v_vis|v_est|v_opv|v_adm)\b", block.group(0))
        assert "v_tec" in slugs, "tec (Técnico) deve receber reservelab.tablet.cancel"
        for proibida in ("v_vis", "v_est", "v_opv", "v_adm"):
            assert proibida not in slugs, f"{proibida} NÃO deve receber reservelab.tablet.cancel"

    def test_tec_unicamente_guardado_contra_mass_grant(self, body):
        """Trava dura: se alguém semear cancel em outra role, a migration ABORTA."""
        assert re.search(
            r"WHERE\s+rp\.action\s*=\s*'reservelab\.tablet\.cancel'\s+AND\s+r\.slug\s*<>\s*'tec'",
            body,
        ), "a 078 deve abortar se uma role fora de tec receber a Action (mass-grant)"

    def test_nao_duplica_ou_remove_o_par_reserve(self, body):
        assert PAIR_ACTION not in body, (
            "a 078 não deve duplicar nem remover reservelab.tablet.reserve (seed da 036)"
        )

    def test_action_ja_existia_na_036_nao_criada_aqui(self, body):
        # A Action já é de catálogo desde a 036: a 078 não inventa nada novo.
        assert "INSERT INTO public.actions" not in body
        assert "CREATE TABLE public.actions" not in body


class TestContratoDaHelperPreservado:
    def test_assinatura_mesma_da_050(self, helper):
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(\s*ws_id uuid\s*\)", helper
        )

    def test_assinatura_identica_na_050(self):
        legacy = _read(LEGACY_050)
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(\s*ws_id uuid\s*\)", legacy
        ), "a 050 é a assinatura histórica; a 078 não pode mudar"

    def test_seguranca_definer_preservado(self, helper):
        assert "SECURITY DEFINER" in helper

    def test_search_path_travado(self, helper):
        assert re.search(r"SET\s+search_path\s*=\s*public", helper)

    def test_language_e_volatility(self, helper):
        assert "LANGUAGE sql" in helper
        assert "STABLE" in helper

    def test_acl_idendica_a_050(self, sql):
        legacy = _read(LEGACY_050)
        for stmt in (
            "REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM anon",
            "REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM PUBLIC",
            "GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO authenticated",
            "GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO service_role",
        ):
            assert stmt in sql, f"ACL deve reaplicar: {stmt}"
            assert stmt in legacy, f"a 050 é a ACL histórica: {stmt}"


class TestCadeiaRbac2:
    def test_le_memberships(self, helper):
        assert "public.memberships" in helper

    def test_le_role_permissions(self, helper):
        assert "public.role_permissions" in helper

    def test_join_pelo_role_id_da_membership(self, helper):
        assert re.search(r"rp\.role_id\s*=\s*m\.role_id", helper)

    def test_caller_via_auth_uid(self, helper):
        assert re.search(r"m\.profile_id\s*=\s*auth\.uid\(\)", helper)

    def test_membership_preso_a_unidade(self, helper):
        assert re.search(r"m\.workspace_id\s*=\s*ws_id", helper), (
            "a membership precisa estar presa a unidade avaliada (isolamento)"
        )

    def test_exige_membership_ativa(self, helper):
        assert re.search(r"m\.status\s*=\s*'active'", helper)

    def test_resolve_a_action(self, helper):
        assert ACTION in helper

    def test_exige_scope_workspace(self, helper):
        assert re.search(r"rp\.scope\s*=\s*'workspace'", helper)

    def test_fail_closed_workspace_nulo(self, helper):
        assert "ws_id IS NOT NULL" in helper

    def test_fail_closed_sem_ramo_permissivo(self, helper):
        """Um unico EXISTS: sem OR que abra caminho permissivo."""
        assert not re.search(r"\bOR\s+EXISTS\b", helper), (
            "a helper nao deve ter um segundo ramo permissivo (fail-closed)"
        )
        assert helper.count("EXISTS") == 1

    def test_mesmo_formato_da_050_e_da_077(self, helper):
        """Mesmo formato canonico do repositorio."""
        for fragment in (
            r"FROM public\.memberships m",
            r"JOIN public\.role_permissions rp ON rp\.role_id = m\.role_id",
            r"m\.profile_id = auth\.uid\(\)",
            r"m\.status = 'active'",
            r"rp\.scope = 'workspace'",
        ):
            assert re.search(fragment, helper), f"078 deveria seguir o padrao: {fragment}"

    def test_nao_consulta_membership_overrides(self, helper):
        assert "membership_overrides" not in helper


class TestLegadoNaoAutorizaMais:
    def test_helper_nao_consulta_app_access(self, helper):
        assert "app_access" not in helper, (
            "profiles.app_access nao pode mais autorizar cancelamento (PR-4D-A)"
        )

    def test_helper_nao_consulta_profiles(self, helper):
        assert "public.profiles" not in helper

    def test_helper_nao_consulta_role_de_profile(self, helper):
        # Regex com fronteira: 'rp.role_id' contem 'p.role' (falso positivo classico).
        assert not re.search(r"(^|[^A-Za-z0-9_])(p|pr)\.role([^A-Za-z0-9_]|$)", helper)
        assert "profiles.role" not in helper

    def test_sem_comparacao_com_admin(self, helper):
        assert not re.search(r"role\s*=\s*'admin'", helper)

    def test_regra_da_regex_anti_falso_positivo(self):
        """A regex acima NAO pode casar com o join legitimo rp.role_id."""
        legit = "JOIN public.role_permissions rp ON rp.role_id = m.role_id"
        assert not re.search(r"(^|[^A-Za-z0-9_])(p|pr)\.role([^A-Za-z0-9_]|$)", legit), (
            "a regex de deteccao estaqueando com rp.role_id"
        )

    def test_coluna_app_access_preservada(self, sql):
        """A PR-4D-A nao remove a coluna nem mexe em dados de usuarios."""
        assert "DROP COLUMN" not in _strip_sql_comments(sql)
        assert "ALTER TABLE public.profiles" not in _strip_sql_comments(sql)


class TestSuperAdminPermaneceNasPolicies:
    def test_helper_nao_trata_super_admin(self, helper):
        assert "is_super_admin" not in helper, (
            "o bypass vive em tablet_reservations_update; dentro da helper quebra o invariante"
        )

    def test_policy_update_nao_reescrita(self, body):
        assert "CREATE POLICY" not in body and "DROP POLICY" not in body, (
            "a 078 nao deve reescrever tablet_reservations_update"
        )

    def test_050_ainda_e_a_definicao_do_consumidor(self):
        legacy = _read(LEGACY_050)
        assert "CREATE POLICY \"tablet_reservations_update\"" in legacy
        assert "public.is_super_admin()" in legacy
        assert "user_belongs_to_workspace" in legacy
        assert f"public.{HELPER}" in legacy


class TestEscopoNaoAlterado:
    @pytest.mark.parametrize("token", FORBIDDEN_IN_MIGRATION)
    def test_token_proibido_ausente(self, body, token):
        assert token not in body, f"a 078 nao deveria conter {token!r}"

    def test_nao_faz_backfill_ou_promocao_de_usuarios(self, body):
        """A 078 NÃO converte app_access em membership/role/action nem toca
        dados de usuários (diferente da 077, que revogou a chave `tv`).
        Nenhum DML em profiles/memberships/roles; o único INSERT é em
        role_permissions."""
        assert "INSERT INTO public.role_permissions" in body
        assert "INSERT INTO public.profiles" not in body
        assert "UPDATE public.profiles" not in body
        assert "DELETE FROM public.profiles" not in body
        assert "INSERT INTO public.memberships" not in body
        assert "UPDATE public.memberships" not in body
        assert "DELETE FROM public.memberships" not in body
        assert "UPDATE public.roles" not in body
        assert "UPDATE public.role_permissions" not in body
        assert "DELETE FROM public.role_permissions" not in body

    def test_nao_altera_outros_modulos(self, body):
        assert "tv." not in body
        assert "chamado" not in body
        assert "stock" not in body
        assert "pcare" not in body


class TestTravaDeRegressaoSql:
    def test_existe_teste_estrutural_da_078(self):
        assert TEST_078.is_file()

    def test_teste_078_cobre_os_cenarios_chave(self):
        test = _read(TEST_078)
        assert "app_access->>''reservalab''=''full'' alone must NOT grant tablet cancellation" in test
        assert "membership in workspace A must NOT grant access to workspace B" in test
        assert "suspended membership must be DENIED tablet cancellation" in test
        assert "membership whose role lacks reservelab.tablet.cancel must be DENIED" in test
        assert "an unrelated authenticated user must be DENIED" in test
        assert "active membership with reservelab.tablet.cancel must be ALLOWED in its own workspace" in test

    def test_teste_078_so_tec_nao_mass_grant(self):
        test = _read(TEST_078)
        assert "tec must hold exactly one reservelab.tablet.cancel@workspace" in test
        assert "reservelab.tablet.cancel granted to roles outside tec" in test

    def test_teste_078_usa_o_harness_do_ci(self):
        """auth.uid() no stub do CI le request.jwt.claim.sub."""
        test = _read(TEST_078)
        assert "request.jwt.claim.sub" in test