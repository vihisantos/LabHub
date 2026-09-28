"""Revisão estática da migration 076 (#296 PR-4A — RLS de apps via RBAC 2.0).

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática):

  1. a migration 076 existe e é sequencial (imediatamente após a 075);
  2. a helper `can_manage_workspace_apps` continua existindo com a MESMA
     assinatura `(uuid)` — o contrato das 4 policies não muda;
  3. `SECURITY DEFINER` + `search_path` travado são preservados (contrato da
     031, exigido por `supabase/migrations/tests/031_rls_checks.sql`);
  4. `is_super_admin()` continua presente (bypass global, independente de
     membership);
  5. a Action `admin.app.purge` aparece na lógica, no escopo `workspace`;
  6. a estrutura RBAC 2.0 é a canônica (memberships JOIN role_permissions via
     `rp.role_id = m.role_id`, caller por `auth.uid()`);
  7. a membership é amarrada à unidade avaliada (`m.workspace_id = p_ws`) e
     exigida ativa (`m.status = 'active'`) — é isso que impede a permissão de
     outra unidade conceder acesso;
  8. `profiles.role` NÃO é mais consultado pela helper (o heart do PR);
  9. as 4 policies consumidoras continuam apontando para a helper — nenhuma
     policy foi reescrita para contorná-la;
 10. a migration NÃO cria Action, NÃO altera schema/tabelas/colunas, NÃO mexe
     em memberships/roles/role_permissions e NÃO faz backfill.

LIMITAÇÃO (comportamental): provar os 6 cenários de autorização
(super admin / membership+Action / outra unidade / sem Action /
`role='admin'` sem Action / membership inativa) exige PostgreSQL com `auth.uid()`
resolvível. Feito em `supabase/migrations/tests/076_rbac2_can_manage_workspace_apps.sql`
(Migrations CI, PostgreSQL efêmero) e complementado aqui por análise estática
do corpo executado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "076_rbac2_can_manage_workspace_apps.sql"
LEGACY_031 = MIGRATIONS_DIR / "031_workspace_app_settings_and_backups.sql"
API_APP = ROOT / "api" / "app.py"

HELPER = "can_manage_workspace_apps"
ACTION = "admin.app.purge"

# As 4 policies que consomem a helper (2 tabelas).
CONSUMER_POLICIES = [
    ("workspace_app_settings", "workspace_app_settings_insert"),
    ("workspace_app_settings", "workspace_app_settings_update"),
    ("workspace_app_settings", "workspace_app_settings_delete"),
    ("app_data_backups", "app_data_backups_insert"),
]

# Nada disto pode aparecer no corpo executado da migration.
FORBIDDEN_IN_MIGRATION = [
    "CREATE TABLE",
    "ALTER TABLE",
    "DROP TABLE",
    "DROP COLUMN",
    "ADD COLUMN",
    "CREATE INDEX",
    "CREATE TRIGGER",
    "CREATE POLICY",
    "DROP POLICY",
    "CREATE VIEW",
    "INSERT INTO",
    "UPDATE public",
    "DELETE FROM",
    "GRANT ",
    "CREATE OR REPLACE FUNCTION public.admin_",
    "RBAC_2_ENABLED",
]


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
    """Migration completa (inclui o cabeçalho, que cita o legado)."""
    return _read(MIGRATION)


@pytest.fixture(scope="module")
def body() -> str:
    """Só o que é executado — sem comentários."""
    return _strip_sql_comments(_read(MIGRATION))


@pytest.fixture(scope="module")
def helper() -> str:
    """Corpo da função recriada, extraído da migration."""
    match = re.search(
        r"CREATE OR REPLACE FUNCTION public\.can_manage_workspace_apps.*?\$\$;",
        _strip_sql_comments(_read(MIGRATION)),
        re.S,
    )
    assert match, "a migration 076 deve recriar a helper can_manage_workspace_apps"
    return match.group(0)


class TestExistenciaEOrdenacao:
    def test_migration_076_existe(self):
        assert MIGRATION.is_file(), "a migration 076 deve existir"

    def test_076_esta_sequenciada_apos_a_075(self):
        """A 076 precisa vir depois da 075, mas NÃO precisa ser a última: a 077
        (#296 PR-4B) já a segue. O que trava é o sequenciamento, não o topo."""
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 75 in nums, f"a 075 deveria existir na sequência (numeros: {nums})"
        assert 76 in nums, f"a 076 deveria existir na sequência (numeros: {nums})"
        assert nums.index(76) > nums.index(75), "a 076 precisa vir depois da 075"
        assert nums.count(76) == 1, f"a 076 aparece {nums.count(76)}x na sequência"

    def test_076_vem_apos_a_075(self):
        assert (MIGRATIONS_DIR / "075_drop_admin_set_user_memberships.sql").is_file()


class TestContratoDaHelperPreservado:
    def test_helper_e_recriada_com_a_mesma_assinatura(self, helper):
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.can_manage_workspace_apps\s*\(\s*p_ws uuid\s*\)",
            helper,
        ), "a assinatura (p_ws uuid) precisa ser preservada — as policies dependem dela"

    def test_mesma_funcao_da_031(self):
        legacy = _read(LEGACY_031)
        assert re.search(
            r"CREATE OR REPLACE FUNCTION public\.can_manage_workspace_apps\s*\(\s*p_ws uuid\s*\)",
            legacy,
        ), "a 031 deve continuar definindo a helper original (histórico preservado)"

    def test_seguranca_definer_preservado(self, helper):
        assert "SECURITY DEFINER" in helper

    def test_search_path_travado(self, helper):
        assert re.search(r"SET\s+search_path\s*=\s*public", helper)

    def test_acl_permanece_restritiva(self, sql):
        assert "REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM anon" in sql
        assert "REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM PUBLIC" in sql

    def test_nao_concede_privilegio_novo(self, body):
        assert "GRANT " not in body.upper(), "a 076 não pode conceder EXECUTE novo"


class TestSuperAdminPreservado:
    def test_is_super_admin_presente(self, helper):
        assert "is_super_admin()" in helper

    def test_bypass_e_independente_de_membership(self, helper):
        """O bypass global não pode depender de membership na unidade."""
        or_block = re.search(r"is_super_admin\(\)\s*\n\s*OR EXISTS", helper)
        assert or_block, "is_super_admin() deve ser um OR independente do EXISTS de membership"

    def test_bypass_ocorre_antes_da_exigencia_de_membership(self, helper):
        assert helper.index("is_super_admin()") < helper.index("FROM public.memberships")


class TestActionNoEscopoWorkspace:
    def test_action_presente(self, helper):
        assert ACTION in helper, f"a helper deve resolver a Action {ACTION}"

    def test_escopo_workspace(self, helper):
        assert re.search(r"scope\s*=\s*'workspace'", helper)

    def test_action_nao_criada_nesta_migration(self, body):
        assert "INSERT INTO public.role_permissions" not in body
        assert f"'{ACTION}'" in body and "INSERT INTO" not in body


class TestEstruturaRbac2Consistente:
    def test_le_memberships(self, helper):
        assert "public.memberships" in helper

    def test_le_role_permissions(self, helper):
        assert "public.role_permissions" in helper

    def test_join_pelo_role_id_da_membership(self, helper):
        assert re.search(r"rp\.role_id\s*=\s*m\.role_id", helper)

    def test_membership_do_caller_via_auth_uid(self, helper):
        assert re.search(r"m\.profile_id\s*=\s*auth\.uid\(\)", helper)

    def test_mesmo_formato_da_050(self, helper):
        """O formato é o canônico de `user_can_cancel_tablet_reservation` (050)."""
        legacy = _read(MIGRATIONS_DIR / "050_tablet_reservations_cancel_rls.sql")
        for fragment in (
            r"FROM public\.memberships m",
            r"JOIN public\.role_permissions rp ON rp\.role_id = m\.role_id",
            r"m\.profile_id = auth\.uid\(\)",
            r"m\.status = 'active'",
            r"rp\.scope = 'workspace'",
        ):
            assert re.search(fragment, legacy), f"050 deveria conter {fragment} (padrão canônico)"
            assert fragment in helper.replace("p_ws", "ws_id") or re.search(fragment, helper), (
                f"076 deveria seguir o padrão da 050: {fragment}"
            )

    def test_nao_consulta_membership_overrides(self, helper):
        """A 050 também não considera overrides; não criar um caminho paralelo."""
        assert "membership_overrides" not in helper


class TestVinculoComAUnidade:
    def test_membership_preso_a_unidade_avaliada(self, helper):
        assert re.search(r"m\.workspace_id\s*=\s*p_ws", helper)

    def test_exige_membership_ativa(self, helper):
        assert re.search(r"m\.status\s*=\s*'active'", helper)

    def test_unidade_nula_nega(self, helper):
        assert re.search(r"p_ws IS NOT NULL", helper)

    def test_nao_usa_user_belongs_to_workspace(self, helper):
        """A 050 não usa; o binding já vem de m.workspace_id = p_ws."""
        assert "user_belongs_to_workspace" not in helper


class TestProfilesRoleDeixouDeAutorizar:
    def test_helper_nao_consulta_role(self, helper):
        assert not re.search(r"\bp\.role\b", helper)
        assert not re.search(r"\bpr\.role\b", helper)
        assert "profiles.role" not in helper

    def test_sem_comparacao_com_admin(self, helper):
        assert not re.search(r"role\s*=\s*'admin'", helper)

    def test_sem_funcao_legada_de_role(self, helper):
        assert "user_belongs_to_workspace" not in helper


class TestPoliciesPreservadas:
    def test_076_nao_toca_policy(self, body):
        assert "CREATE POLICY" not in body
        assert "DROP POLICY" not in body

    def test_as_4_policies_ainda_apontam_para_a_helper(self):
        legacy = _read(LEGACY_031)
        for table, policy in CONSUMER_POLICIES:
            block = re.search(
                rf"CREATE POLICY \"{policy}\"(.*?);",
                legacy,
                re.S,
            )
            assert block, f"policy {policy} não encontrada na 031"
            assert HELPER in block.group(1), (
                f"{policy} em {table} deve continuar chamando {HELPER}()"
            )

    def test_contrato_mantido_policy_helper_rbac2(self):
        """policy -> can_manage_workspace_apps(workspace_id) -> RBAC 2.0"""
        legacy = _read(LEGACY_031)
        calls = re.findall(rf"{HELPER}\(workspace_id\)", legacy)
        assert len(calls) == 5, (
            f"a 031 tem 5 chamadas (I, U USING+WITH CHECK, D, backups I); achou {len(calls)}"
        )


class TestEscopoNaoAlterado:
    @pytest.mark.parametrize("token", FORBIDDEN_IN_MIGRATION)
    def test_token_proibido_ausente(self, body, token):
        assert token not in body, f"a 076 não deveria conter {token!r}"

    def test_nao_altera_profiles(self, body):
        assert "ALTER TABLE public.profiles" not in body
        assert "DROP COLUMN" not in body

    def test_nao_faz_backfill_de_role(self, body):
        """A migração muda a AUTORIDADE; converter role -> role_permissions é
        decisão separada e não pode ser silenciosa."""
        assert "unnest" not in body
        # \b evita colidir com `rp.role_id` (join do RBAC 2.0, não é profiles.role).
        assert not re.search(r"\bp\.role\b", body)
        assert not re.search(r"\bpr\.role\b", body)

    def test_nao_altera_a_api(self):
        """F2-C removeu o fallback legacy `role == 'admin'` da API: o gateway
        `_require_workspace_app_manager` responde apenas a `admin.app.purge`."""
        app = _read(API_APP)
        assert "role != 'admin'" not in app
        assert "return str(user.get('role') or '') == 'admin'" not in app
        assert f"'{ACTION}'" in app

    def test_nao_toca_tv_nem_reservalab(self, body):
        for other in (
            "user_can_manage_tv",
            "user_can_cancel_tablet_reservation",
            "tv_can_manage_workspace",
            "app_access",
        ):
            assert other not in body

    def test_076_e_a_unica_que_muda_a_helper(self):
        changers = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(
                rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(",
                _read(p),
                re.I,
            )
        ]
        # 031 (original, histórica) e 076 (novo estado final).
        assert sorted(changers) == ["031_workspace_app_settings_and_backups.sql", MIGRATION.name], (
            f"apenas a 031 e a 076 devem definir a helper; achou: {changers}"
        )


class TestTravaDeRegressaoSql:
    def test_existe_teste_estrutural_da_076(self):
        assert (MIGRATIONS_DIR / "tests" / "076_rbac2_can_manage_workspace_apps.sql").is_file()

    def test_teste_076_cobre_os_cenarios_chave(self):
        test = _read(MIGRATIONS_DIR / "tests" / "076_rbac2_can_manage_workspace_apps.sql")
        assert "must not authorize via profiles.role" in test
        assert ACTION in test
        assert "is_super_admin() bypass must be preserved" in test
        assert "m.workspace_id = p_ws" in test
        assert "ACTIVE membership may grant access" in test
