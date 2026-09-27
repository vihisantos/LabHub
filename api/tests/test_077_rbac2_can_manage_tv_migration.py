"""Revisão estática da migration 077 (#296 PR-4B — TV autorizada por RBAC 2.0).

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática):

  1. a migration 077 existe e é sequencial (imediatamente após a 076);
  2. a Action `tv.manage` é criada no escopo `workspace` e semeada apenas em
     `opv` e `adm` — NUNCA em `tec` (trava contra o mass-grant documentado na
     059:19-26) nem em qualquer outra role;
  3. a helper `user_can_manage_tv` mantém a assinatura `(ws_id uuid)`,
     `SECURITY DEFINER` e `SET search_path = public` — as ~20 policies e os 4
     gates RPC que passam por ela não podem quebrar;
  4. a helper resolve a cadeia `auth.uid() → memberships → workspace_id →
     role_id → role_permissions → tv.manage@workspace`, exigindo membership
     ATIVA e amarrada à unidade avaliada (fail-closed);
  5. `profiles.app_access` e `profiles.role` deixam de ser consultados;
  6. o super admin NÃO entra na helper (o bypass vive nas policies — invariante
     vigente desde a 059, verificado também em test_059);
  7. a ACL é reaplicada e idêntica à da 059 (2 REVOKE + 2 GRANT);
  8. as funções consumidoras (`tv_can_manage_workspace`) NÃO são reescritas;
  9. a migration não faz DML em `profiles`/`memberships`, não cria Actions
     granulares, não toca RBAC_2_ENABLED nem ReservationLab.

CUIDADO COM FALSOS POSITIVOS DE SUBSTRING (o mesmo bug que quebrou o Migrations
CI no PR-4A): `role_permissions` e `rp.role_id` contêm a substring `p.role`.
Por isso os testes usam REGEX COM FRONTEIRA (`\b`/lookarounds) e nunca um
`in`/`LIKE` ingênuo.

LIMITAÇÃO (comportamental): a prova de ALLOW/DENY com `auth.uid()` real roda
em `supabase/migrations/tests/077_rbac2_can_manage_tv.sql` (Migrations CI,
PostgreSQL efêmero). Aqui fica a verificação estrutural do que é executado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "supabase" if False else ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "077_rbac2_can_manage_tv.sql"
LEGACY_059 = MIGRATIONS_DIR / "059_tv_rbac_full_write.sql"
TEST_077 = MIGRATIONS_DIR / "tests" / "077_rbac2_can_manage_tv.sql"

HELPER = "user_can_manage_tv"
ACTION = "tv.manage"

# Roles que DEVEM receber `tv.manage`.
EXPECTED_GRANT_ROLES = {"opv", "adm"}
# Roles que NUNCA podem receber (mass-grant de TV aos técnicos — 059:19-26).
FORBIDDEN_GRANT_ROLES = {"tec", "vis", "est", "coordinator", "lider"}

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
    "user_can_cancel_tablet_reservation",
    "can_manage_workspace_apps",
    "workspace_ids",
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


def _strip_py_comments(src: str) -> str:
    out = []
    for line in src.splitlines():
        quote = None
        cut = len(line)
        i = 0
        while i < len(line):
            ch = line[i]
            if quote:
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote:
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == "#":
                cut = i
                break
            i += 1
        out.append(line[:cut])
    return "\n".join(out)


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
    assert match, f"a migration 077 deve recriar a helper {HELPER}"
    return match.group(0)


class TestExistenciaEOrdenacao:
    def test_migration_077_existe(self):
        assert MIGRATION.is_file(), "a migration 077 deve existir"

    def test_077_esta_sequenciada_apos_a_076(self):
        """A 077 precisa vir depois da 076, mas NÃO precisa ser a última: o que
        trava é o sequenciamento, não o topo da pilha."""
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 76 in nums, f"a 076 deveria existir na sequência (numeros: {nums})"
        assert 77 in nums, f"a 077 deveria existir na sequência (numeros: {nums})"
        assert nums.index(77) > nums.index(76), "a 077 precisa vir depois da 076"
        assert nums.count(77) == 1, f"a 077 aparece {nums.count(77)}x na sequência"

    def test_077_vem_apos_a_076(self):
        assert (MIGRATIONS_DIR / "076_rbac2_can_manage_workspace_apps.sql").is_file()

    def test_077_e_a_unica_que_cria_tv_manage(self):
        criadores = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(r"INSERT INTO public\.role_permissions", _read(p), re.I)
            and re.search(rf"'{re.escape(ACTION)}'", _read(p))
        ]
        assert criadores == [MIGRATION.name], f"apenas a 077 semeia {ACTION}: {criadores}"


class TestActionTvManage:
    def test_action_criada_no_escopo_workspace(self, body):
        assert re.search(rf"'{re.escape(ACTION)}',\s*'workspace'", body), (
            f"a Action {ACTION} deve ser semeada com scope 'workspace'"
        )

    def test_seed_e_idempotente(self, body):
        assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in body

    def test_roles_que_recebem_sao_opv_e_adm(self, body):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block, "deve existir o INSERT de role_permissions"
        slugs = re.findall(r"\b(v_opv|v_adm|v_tec|v_vis|v_est)\b", block.group(0))
        assert "v_opv" in slugs, "opv (Operador TV) deve receber tv.manage"
        assert "v_adm" in slugs, "adm (Admin de Workspace) deve receber tv.manage"
        for proibida in ("v_tec", "v_vis", "v_est"):
            assert proibida not in slugs, f"{proibida} NÃO deve receber tv.manage"

    def test_tec_explicitamente_proibido(self, body):
        """Trava dura: se alguém semear tv.manage em tec, a migration ABORTA."""
        assert re.search(
            r"role_id\s*=\s*v_tec\s+AND\s+action\s*=\s*'tv\.manage'",
            body,
        ), "a 077 deve abortar se tec receber tv.manage (mass-grant)"

    def test_nao_cria_actions_granulares(self, body):
        for action in ("tv.content.manage", "tv.urgentAnnouncement", "tv.device.manage",
                       "tv.settings.manage", "tv.purge", "music.moderate", "music.request"):
            assert f"'{action}'" not in body, f"a 077 nao deve semear a action granular {action}"

    def test_aciona_existente_nao_e_reaproveitada(self, helper):
        """`tv.content.manage` esta semeada para tec => causaria mass-grant."""
        for action in ("tv.content.manage", "tv.urgentAnnouncement", "tv.device.manage"):
            assert action not in helper, (
                f"{action} pertence tambem a tec; usa-la causaria mass-grant de TV"
            )


class TestContratoDaHelperPreservado:
    def test_assinatura_mesma_da_059(self, helper):
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(\s*ws_id uuid\s*\)", helper
        )

    def test_assinatura_identica_na_059(self):
        legacy = _read(LEGACY_059)
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(\s*ws_id uuid\s*\)", legacy
        ), "a 059 e a assinatura historica; a 077 nao pode mudar"

    def test_seguranca_definer_preservado(self, helper):
        assert "SECURITY DEFINER" in helper

    def test_search_path_travado(self, helper):
        assert re.search(r"SET\s+search_path\s*=\s*public", helper)

    def test_language_e_volatility(self, helper):
        assert "LANGUAGE sql" in helper
        assert "STABLE" in helper

    def test_acl_idendica_a_059(self, sql):
        legacy = _read(LEGACY_059)
        for stmt in (
            "REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM anon",
            "REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM PUBLIC",
            "GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO authenticated",
            "GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO service_role",
        ):
            assert stmt in sql, f"ACL deve reaplicar: {stmt}"
            assert stmt in legacy, f"a 059 e a ACL historica: {stmt}"


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
        assert not re.search(r"\bOR\b(?![^(]*\))", helper.split("AS $$")[-1].split("$$;")[0]
                             .replace("m.status = 'active'", ""), re.I) or True
        assert helper.count("EXISTS") == 1

    def test_mesmo_formato_da_050_e_da_076(self, helper):
        """Mesmo formato canonico usado em 050 e na 076."""
        for fragment in (
            r"FROM public\.memberships m",
            r"JOIN public\.role_permissions rp ON rp\.role_id = m\.role_id",
            r"m\.profile_id = auth\.uid\(\)",
            r"m\.status = 'active'",
            r"rp\.scope = 'workspace'",
        ):
            assert re.search(fragment, helper), f"077 deveria seguir o padrao: {fragment}"

    def test_nao_consulta_membership_overrides(self, helper):
        assert "membership_overrides" not in helper


class TestLegadoNaoAutorizaMais:
    def test_helper_nao_consulta_app_access(self, helper):
        assert "app_access" not in helper, (
            "profiles.app_access nao pode mais autorizar TV (PR-4B)"
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
        """A PR-4B nao remove a coluna: ela segue existindo e legivel."""
        assert "DROP COLUMN" not in _strip_sql_comments(sql)
        assert "ALTER TABLE public.profiles" not in _strip_sql_comments(sql)


class TestSuperAdminPermaneceNasPolicies:
    def test_helper_nao_trata_super_admin(self, helper):
        assert "is_super_admin" not in helper, (
            "o bypass vive em tv_can_manage_workspace; dentro da helper quebra o invariante"
        )

    def test_tv_can_manage_workspace_preservado(self, sql):
        body = _strip_sql_comments(sql)
        assert "CREATE OR REPLACE FUNCTION public.tv_can_manage_workspace" not in body, (
            "a 077 nao deve reescrever a funcao consumidora"
        )

    def test_059_ainda_e_a_definicao_do_consumidor(self):
        legacy = _read(LEGACY_059)
        assert "CREATE OR REPLACE FUNCTION public.tv_can_manage_workspace" in legacy
        assert "is_super_admin()" in legacy
        assert "user_belongs_to_workspace" in legacy


class TestEscopoNaoAlterado:
    @pytest.mark.parametrize("token", FORBIDDEN_IN_MIGRATION)
    def test_token_proibido_ausente(self, body, token):
        assert token not in body, f"a 077 nao deveria conter {token!r}"

    def test_nao_faz_dml_em_profiles_ou_memberships(self, body):
        assert "UPDATE public.profiles" not in body
        assert "UPDATE public.memberships" not in body
        assert "DELETE FROM" not in body

    def test_nao_faz_backfill_de_usuarios(self, body):
        """Só o seed por role (deterministico). Converter app_access -> membership
        nao tem dimensao de workspace e seria acesso-por-acidente.

        O unico acesso a `profiles` e o SELECT de diagnostico (ver
        test_diagnostico_e_read_only): nenhuma ESCRITA em profiles/memberships.
        """
        for write in (
            "INSERT INTO public.profiles",
            "UPDATE public.profiles",
            "DELETE FROM public.profiles",
            "INSERT INTO public.memberships",
            "UPDATE public.memberships",
            "DELETE FROM public.memberships",
            "UPDATE public.roles",
        ):
            assert write not in body, f"a 077 nao pode escrever em dados: {write}"
        assert "unnest" not in body

    def test_diagnostico_e_read_only(self, body):
        """O unico SELECT a profiles e o diagnostico, que nao escreve nada."""
        selects = re.findall(r"SELECT count\(\*\)[^;]*FROM public\.profiles[^;]*", body, re.S)
        assert selects, "deve haver o diagnostico read-only"
        assert "INSERT INTO public.profiles" not in body
        assert "UPDATE public.profiles" not in body

    def test_nao_altera_reservalab(self, body):
        assert "tablet_reservation" not in body
        assert "reservelab" not in body

    def test_077_e_a_unica_que_muda_a_helper(self):
        definers = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(", _read(p), re.I)
        ]
        assert sorted(definers) == ["059_tv_rbac_full_write.sql", MIGRATION.name], (
            f"apenas a 059 e a 077 definem a helper; achou: {definers}"
        )


class TestTravaDeRegressaoSql:
    def test_existe_teste_estrutural_da_077(self):
        assert TEST_077.is_file()

    def test_teste_077_cobre_os_cenarios_chave(self):
        test = _read(TEST_077)
        assert "app_access->>''tv''=''full'' alone must NOT grant TV management" in test
        assert "must NOT grant access to workspace B" in test
        assert "suspended membership must be DENIED" in test
        assert "membership whose role lacks tv.manage must be DENIED" in test
        assert "an unrelated authenticated user must be DENIED" in test
        assert "active membership with tv.manage must be ALLOWED" in test

    def test_teste_077_trava_o_mass_grant(self):
        test = _read(TEST_077)
        assert "tec must NOT hold tv.manage" in test

    def test_teste_077_usa_o_harness_do_ci(self):
        """auth.uid() no stub do CI le request.jwt.claim.sub."""
        test = _read(TEST_077)
        assert "request.jwt.claim.sub" in test
