"""Revisão estática da migration 082 (F2-D-G — checklist/SLA por Action RBAC 2.0).

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática do DDL —
a suíte backend roda sem Postgres ao vivo):

  1. a migration 082 existe e é sequencial (imediatamente após a 078);
  2. as 4 Actions são criadas no escopo `workspace` e semeadas APENAS nos
     cargos que tinham o nível legado correspondente — `pcare.checklist.*`
     só em `tec` (único com `pc-care: full`), `chamados.settings.manage` em
     `tec`/`lider`/`coordinator` (os três com `chamados: full`). Nenhum grant
     novo: `vis`/`est`/`opv`/`adm` ficam de fora;
  3. a seed é idempotente e tem travas anti-mass-grant que ABORTAM a migration;
  4. a helper `user_has_action(uuid, text)` segue o formato canônico das helpers
     por domínio (050/076/077): SECURITY DEFINER, `SET search_path = public`,
     STABLE, cadeia `auth.uid() → memberships(ativa) → role_id →
     role_permissions@workspace`, fail-closed, UM único EXISTS;
  5. `profiles.app_access`, `profiles.role` e `membership_overrides` NÃO são
     consultados — encerra a dependência funcional do modelo legado;
  6. o super admin NÃO entra na helper (o bypass vive nas policies — invariante
     vigente desde a 059);
  7. a ACL é reaplicada no padrão do repo (2 REVOKE + 2 GRANT);
  8. as policies de ESCRITA de `pcare.checklist_templates` e
     `pcare.pc_checklists` exigem a Action DA OPERAÇÃO, e as de SELECT não são
     tocadas (leitura segue implícita pelo App Access);
  9. a migration NÃO cria backend para SLA (coleção local), NÃO cria Action de
     leitura, NÃO cria Action de fluxo morto (`pcare.part.usage`,
     `chamados.room.manage`) e NÃO mexe em `profiles.app_access`/`profiles.role`.

CUIDADO COM FALSOS POSITIVOS DE SUBSTRING (o mesmo bug que quebrou o Migrations
CI no PR-4A): `role_permissions` e `rp.role_id` contêm a substring `p.role`.
Por isso os testes usam REGEX COM FRONTEIRA e nunca um `in`/`LIKE` ingênuo.

LIMITAÇÃO (comportamental): a prova de INSERT/UPDATE/DELETE DIRETO no banco
com `auth.uid()` real roda em `supabase/migrations/tests/082_*.sql` (Migrations
CI, PostgreSQL efêmero). Aqui fica a verificação estrutural do que é executado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "082_rbac2_checklist_sla_actions.sql"
TEST_082 = MIGRATIONS_DIR / "tests" / "082_rbac2_checklist_sla_actions.sql"

HELPER = "user_has_action"

CHECKLIST_ACTIONS = (
    "pcare.checklist.create",
    "pcare.checklist.edit",
    "pcare.checklist.delete",
)
SLA_ACTION = "chamados.settings.manage"
ALL_ACTIONS = (*CHECKLIST_ACTIONS, SLA_ACTION)

# Quem DEVE receber cada Action (semântica de `DEFAULT_ROLES`, types.ts:60-123).
EXPECTED_GRANTS = {
    "pcare.checklist.create": {"tec"},
    "pcare.checklist.edit": {"tec"},
    "pcare.checklist.delete": {"tec"},
    SLA_ACTION: {"tec", "lider", "coordinator"},
}

# Actions de fluxo MORTO/fora de escopo — a 082 não pode semeá-las.
FORBIDDEN_ACTIONS = (
    "pcare.part.usage",
    "chamados.room.manage",
    "pcare.view",
    "chamados.view",
    "chamados.sla.manage",
    "chamados.sla.view",
    "chamados.settings.view",
)

# Nada disto pode aparecer no corpo EXECUTADO da migration.
# `user_can_manage_tv` / `user_can_cancel_tablet_reservation` /
# `can_manage_workspace_apps` NÃO entram nesta lista: elas são citadas
# legitimamente no COMMENT ON FUNCTION da nova helper, que registra o formato
# canônico que ela generaliza. O que não pode é REDEFINI-LAS — isso é verificado
# em TestEscopoNaoAlterado::test_082_e_a_unica_que_cria_a_helper e abaixo.
FORBIDDEN_IN_MIGRATION = [
    "CREATE TABLE",
    "DROP TABLE",
    "DROP COLUMN",
    "CREATE TRIGGER",
    "CREATE VIEW",
    "CREATE FUNCTION",
    "RBAC_2_ENABLED",
    "sla_config",
    "roomService",
    # Não há backfill nem promoção de perfis/memberships (a 077 é a referência
    # do que NÃO fazer quando a Action é criada do zero).
    "INSERT INTO public.memberships",
    "UPDATE public.memberships",
    "DELETE FROM public.memberships",
    "UPDATE public.roles",
    "INSERT INTO public.profiles",
    "UPDATE public.profiles",
    "DELETE FROM public.profiles",
    "unnest",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)


def _semeadas(path: Path) -> set[str]:
    """Actions REALMENTE semeadas por uma migration.

    Lê apenas dentro de `INSERT INTO public.role_permissions ... ON CONFLICT`
    (comentários fora). Sem isso, uma migration que CITA a Action num guard de
    segurança — como a 086 faz com `pcare.checklist.*` e
    `chamados.settings.manage` — seria contada como semeadora, e a trava "só a
    082 semeia" passaria a ser um teste de substring em vez de um teste de
    autorização.
    """
    acoes: set[str] = set()
    for bloco in re.findall(
        r"INSERT\s+INTO\s+public\.role_permissions.*?(?:ON\s+CONFLICT[^;]*;|\$\$;)",
        _strip_sql_comments(_read(path)),
        re.S | re.I,
    ):
        acoes.update(
            re.findall(r"'([a-z]+\.[A-Za-z.]+)'\s*,\s*'(?:workspace|global|self)'", bloco)
        )
    return acoes


@pytest.fixture(scope="module")
def sql() -> str:
    return _read(MIGRATION)


@pytest.fixture(scope="module")
def body() -> str:
    """Só o que é executado, sem comentários."""
    return _strip_sql_comments(_read(MIGRATION))


@pytest.fixture(scope="module")
def helper() -> str:
    """Corpo da função criada, extraído da migration."""
    match = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{HELPER}.*?\$\$;",
        _strip_sql_comments(_read(MIGRATION)),
        re.S,
    )
    assert match, f"a migration 082 deve criar a helper {HELPER}"
    return match.group(0)


class TestExistenciaEOrdenacao:
    def test_migration_082_existe(self):
        assert MIGRATION.is_file(), "a migration 082 deve existir"

    def test_082_esta_sequenciada_apos_a_079(self):
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 79 in nums, f"a 079 deveria existir na sequência (numeros: {nums})"
        assert 82 in nums, f"a 082 deveria existir na sequência (numeros: {nums})"
        assert nums.index(82) > nums.index(79), "a 082 precisa vir depois da 079"
        assert nums.count(82) == 1, f"a 082 aparece {nums.count(82)}x na sequência"

    def test_078_presente(self):
        assert (MIGRATIONS_DIR / "078_rbac2_tablet_cancel.sql").is_file()

    def test_082_e_a_unica_que_cria_estas_actions(self):
        for action in ALL_ACTIONS:
            # Detecta o que é REALMENTE semeado (dentro de um INSERT em
            # role_permissions), e não o que é apenas citado. A 086 lista
            # `pcare.checklist.*` nas travas anti-escalada sem semeá-los.
            criadores = [p.name for p in MIGRATIONS_DIR.glob("*.sql") if action in _semeadas(p)]
            assert criadores == [MIGRATION.name], (
                f"apenas a 082 semeia {action}: {criadores}"
            )


class TestActionsCriadas:
    @pytest.mark.parametrize("action", ALL_ACTIONS)
    def test_action_criada_no_escopo_workspace(self, body, action):
        assert re.search(rf"'{re.escape(action)}',\s*'workspace'", body), (
            f"a Action {action} deve ser semeada com scope 'workspace'"
        )

    def test_seed_e_idempotente(self, body):
        assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in body

    def test_nao_cria_actions_de_fluxo_morto(self, body):
        for action in FORBIDDEN_ACTIONS:
            assert f"'{action}'" not in body, (
                f"a 082 nao deve semear {action} (fluxo morto / acao de leitura)"
            )

    def test_exatamente_quatro_actions_novas(self, body):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block, "deve existir o INSERT de role_permissions"
        encontradas = sorted(set(re.findall(r"'([a-z]+\.[A-Za-z.]+)'", block.group(0))))
        assert encontradas == sorted(ALL_ACTIONS), (
            f"a 082 deve semear exatamente {sorted(ALL_ACTIONS)}; achou {encontradas}"
        )

    @pytest.mark.parametrize("action", ALL_ACTIONS)
    def test_roles_que_recebem(self, body, action):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block
        esperados = EXPECTED_GRANTS[action]
        for slug in sorted(esperados):
            var = f"v_{slug}"
            linha = re.search(
                rf"\(\s*{var}\s*,\s*'{re.escape(action)}'\s*,\s*'workspace'\s*\)", body
            )
            assert linha, f"{slug} deve receber {action}"

    @pytest.mark.parametrize("action", ALL_ACTIONS)
    def test_nenhuma_role_inedida_recebe_a_seed(self, body, action):
        """A lista de slugs dentro do INSERT é a fonte de verdade do grant."""
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block
        no_Grant = {
            m.group(1)
            for m in re.finditer(r"\(\s*(v_[a-z_]+)\s*,\s*'([^']+)'", block.group(0))
            if m.group(2) == action
        }
        esperados = {f"v_{s}" for s in EXPECTED_GRANTS[action]}
        assert no_Grant == esperados, (
            f"{action}: seeds esperadas {esperados}, achadas {no_Grant}"
        )


class TestTravasAntiMassGrant:
    def test_checklist_so_na_role_tec(self, body):
        assert re.search(
            r"r\.slug\s*<>\s*'tec'",
            body,
        ), "a 082 deve abortar se pcare.checklist.* existir fora da role tec"

    def test_sla_limitado_as_tres_roles(self, body):
        assert re.search(
            r"r\.slug\s+NOT\s+IN\s*\(\s*'tec'\s*,\s*'lider'\s*,\s*'coordinator'\s*\)",
            body,
        ), "a 082 deve abortar se chamados.settings.manage vazar para outra role"

    def test_trava_de_escopo(self, body):
        assert re.search(r"scope\s*<>\s*'workspace'", body), (
            "a 082 deve abortar se alguma Action nova aparecer fora do escopo workspace"
        )

    def test_travas_sao_raise_exception(self, body):
        """As travas abortam de verdade (RAISE EXCEPTION), não só avisam."""
        abortos = re.findall(
            r"RAISE EXCEPTION 'FAIL: [^']*(?:checklist|chamados\.settings|workspace)[^']*'",
            body,
        )
        assert len(abortos) >= 3, (
            f"esperadas >=3 travas com RAISE EXCEPTION; achou {len(abortos)}"
        )

    def test_roles_obrigatorias_validadas(self, body):
        assert "RAISE EXCEPTION 'FAIL: roles tec/lider/coordinator ausentes" in body, (
            "sem os cargos base a semantica legada nao e reproduzivel"
        )


class TestContratoDaHelper:
    def test_assinatura(self, helper):
        assert re.search(
            rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(\s*ws_id uuid\s*,\s*p_action text\s*\)",
            helper,
        )

    def test_seguranca_definer(self, helper):
        assert "SECURITY DEFINER" in helper

    def test_search_path_travado(self, helper):
        assert re.search(r"SET\s+search_path\s*=\s*public", helper)

    def test_language_e_volatility(self, helper):
        assert "LANGUAGE sql" in helper
        assert "STABLE" in helper

    def test_comment_registra_o_contrato(self, sql):
        assert f"COMMENT ON FUNCTION public.{HELPER}(uuid, text)" in sql

    def test_acl_no_padrao_do_repo(self, sql):
        for stmt in (
            f"REVOKE EXECUTE ON FUNCTION public.{HELPER}(uuid, text) FROM anon",
            f"REVOKE EXECUTE ON FUNCTION public.{HELPER}(uuid, text) FROM PUBLIC",
            f"GRANT  EXECUTE ON FUNCTION public.{HELPER}(uuid, text) TO authenticated",
            f"GRANT  EXECUTE ON FUNCTION public.{HELPER}(uuid, text) TO service_role",
        ):
            assert stmt in sql, f"ACL deve reaplicar: {stmt}"


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

    def test_resolve_a_action_recebida(self, helper):
        assert re.search(r"rp\.action\s*=\s*p_action", helper)

    def test_exige_scope_workspace(self, helper):
        assert re.search(r"rp\.scope\s*=\s*'workspace'", helper)

    def test_fail_closed_workspace_nulo(self, helper):
        assert "ws_id IS NOT NULL" in helper

    def test_fail_closed_action_vazia(self, helper):
        assert "p_action IS NOT NULL" in helper
        assert re.search(r"btrim\(p_action\)\s*<>\s*''", helper)

    def test_fail_closed_sem_ramo_permissivo(self, helper):
        """Um unico EXISTS: sem OR que abra caminho permissivo."""
        assert helper.count("EXISTS") == 1
        assert not re.search(r"\bOR\s+EXISTS\b", helper, re.I)

    def test_mesmo_formato_das_helpers_por_dominio(self, helper):
        """Mesmo formato canonico usado em 050/076/077."""
        for fragment in (
            r"FROM public\.memberships m",
            r"JOIN public\.role_permissions rp ON rp\.role_id = m\.role_id",
            r"m\.profile_id = auth\.uid\(\)",
            r"m\.status = 'active'",
            r"rp\.scope = 'workspace'",
        ):
            assert re.search(fragment, helper), f"079 deveria seguir o padrao: {fragment}"

    def test_nao_consulta_membership_overrides(self, helper):
        assert "membership_overrides" not in helper


class TestLegadoNaoAutorizaMais:
    def test_helper_nao_consulta_app_access(self, helper):
        assert "app_access" not in helper, (
            "profiles.app_access nao pode autorizar mais o checklist"
        )

    def test_helper_nao_consulta_profiles(self, helper):
        assert "public.profiles" not in helper

    def test_helper_nao_consulta_role_de_profile(self, helper):
        # Regex com fronteira: 'rp.role_id' contem 'p.role' (falso positivo classico).
        assert not re.search(r"(^|[^A-Za-z0-9_])(p|pr)\.role([^A-Za-z0-9_]|$)", helper)
        assert "profiles.role" not in helper

    def test_regra_da_regex_anti_falso_positivo(self):
        legit = "JOIN public.role_permissions rp ON rp.role_id = m.role_id"
        assert not re.search(r"(^|[^A-Za-z0-9_])(p|pr)\.role([^A-Za-z0-9_]|$)", legit), (
            "a regex de deteccao estaqueando com rp.role_id"
        )

    def test_coluna_app_access_preservada(self, sql):
        """A 079 nao remove nem altera a coluna legada (os fluxos nao migrados
        ainda dependem dela)."""
        body = _strip_sql_comments(sql)
        assert "DROP COLUMN" not in body
        assert "ALTER TABLE public.profiles" not in body
        # `app_access` aparece legitimamente no COMMENT ON FUNCTION (registra
        # que a coluna NAO concede nada). O que nao pode existir e DML nela —
        # diferente da 077, aqui nao ha revogacao de legado.
        assert "UPDATE public.profiles" not in body
        assert "INSERT INTO public.profiles" not in body
        assert "DELETE FROM public.profiles" not in body
        assert "app_access =" not in body
        assert "app_access->>" not in body


class TestSuperAdminPermaneceNasPolicies:
    def test_helper_nao_trata_super_admin(self, helper):
        assert "is_super_admin" not in helper, (
            "o bypass vive na policy; dentro da helper quebra o invariante da 059"
        )

    @pytest.mark.parametrize(
        "policy,action",
        [
            ("checklist_templates_insert", "pcare.checklist.create"),
            ("checklist_templates_update", "pcare.checklist.edit"),
            ("checklist_templates_delete", "pcare.checklist.delete"),
            ("pc_checklists_insert", "pcare.checklist.create"),
            ("pc_checklists_update", "pcare.checklist.edit"),
            ("pc_checklists_delete", "pcare.checklist.delete"),
        ],
    )
    def test_policy_exige_action_da_operacao_e_preserva_bypass(
        self, body, policy, action
    ):
        match = re.search(
            rf'CREATE POLICY "{policy}".*?;', body, re.S
        )
        assert match, f"a policy {policy} deve ser criada pela 082"
        bloco = match.group(0)
        assert "is_super_admin()" in bloco, f"{policy} precisa preservar o bypass do super admin"
        assert f"public.{HELPER}(workspace_id, '{action}')" in bloco, (
            f"{policy} deve exigir a Action {action}"
        )
        assert "user_belongs_to_workspace" not in bloco, (
            f"{policy} nao pode decidir escrita so por membership (foi o gap do F2-D-F)"
        )

    def test_update_tem_using_e_with_check(self, body):
        for policy in ("checklist_templates_update", "pc_checklists_update"):
            bloco = re.search(rf'CREATE POLICY "{policy}".*?;', body, re.S).group(0)
            assert "USING (" in bloco and "WITH CHECK (" in bloco, (
                f"{policy} precisa de USING e WITH CHECK (impede mover linha para outra unidade)"
            )


class TestLeituraNaoVirouAction:
    def test_select_policies_nao_sao_recriadas(self, body):
        for policy in (
            "checklist_templates_select",
            "pc_checklists_select",
        ):
            assert f'CREATE POLICY "{policy}"' not in body, (
                f"{policy} nao deve ser recriada: leitura segue implicita pelo App Access"
            )
            assert f'DROP POLICY IF EXISTS "{policy}"' not in body, (
                f"{policy} nao deve ser derrubada pela 082"
            )

    def test_nenhuma_policy_usa_action_de_checklist_no_select(self, body):
        for match in re.finditer(r'CREATE POLICY "([^"]+_select)".*?;', body, re.S):
            assert HELPER not in match.group(0), (
                f"a policy de SELECT {match.group(1)} nao deve depender de Action"
            )


class TestEscopoNaoAlterado:
    @pytest.mark.parametrize("token", FORBIDDEN_IN_MIGRATION)
    def test_token_proibido_ausente(self, body, token):
        assert token not in body, f"a 082 nao deveria conter {token!r}"

    def test_nao_cria_backend_de_sla(self, body):
        """SLA e colecao LOCAL: nao ha tabela/rota/RLS para inventar."""
        assert "sla_configs" not in body
        assert "sla_config" not in body

    def test_nao_altera_tabelas_pcare(self, body):
        assert "ALTER TABLE" not in body
        assert "TRUNCATE" not in body
        assert "DELETE FROM pcare" not in body

    def test_so_reescreve_policies_de_checklist(self, body):
        drops = re.findall(r'DROP POLICY IF EXISTS "([^"]+)" ON ([a-z_.]+)', body)
        esperados = {
            ("checklist_templates_insert", "pcare.checklist_templates"),
            ("checklist_templates_update", "pcare.checklist_templates"),
            ("checklist_templates_delete", "pcare.checklist_templates"),
            ("pc_checklists_insert", "pcare.pc_checklists"),
            ("pc_checklists_update", "pcare.pc_checklists"),
            ("pc_checklists_delete", "pcare.pc_checklists"),
        }
        assert set(drops) == esperados, (
            f"a 082 deve recriar apenas as 6 policies de escrita de checklist; achou {set(drops)}"
        )

    def test_nao_toca_outras_actions(self, body):
        for action in (
            "ticket.create",
            "ticket.edit",
            "stock.item.create",
            "pcare.asset.create",
            "pcare.part.create",
            "pcare.maintenance.manage",
            "pcare.import",
            "tv.manage",
            "reservelab.tablet.reserve",
            "reservelab.tablet.cancel",
        ):
            assert f"'{action}'" not in body, (
                f"a 082 nao deve mexer na Action existente {action}"
            )

    def test_sem_sql_dinamico(self, body):
        # EXECUTE aqui e' so da ACL (GRANT/REVOKE EXECUTE).
        assert "EXECUTE FORMAT" not in body.upper()
        assert "EXECUTE IMMEDIATE" not in body.upper()

    def test_082_e_a_unica_que_cria_a_helper(self):
        definers = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(rf"CREATE OR REPLACE FUNCTION public\.{HELPER}\s*\(", _read(p), re.I)
        ]
        assert definers == [MIGRATION.name], (
            f"apenas a 082 define {HELPER}; achou {definers}"
        )

    def test_082_nao_redefine_as_helpers_por_dominio(self):
        """As helpers por dominio do repo seguem intactas — a nova helper é
        acréscimo, não substituição."""
        body = _strip_sql_comments(_read(MIGRATION))
        for helper in (
            "user_can_manage_tv",
            "user_can_cancel_tablet_reservation",
            "can_manage_workspace_apps",
        ):
            assert (
                f"CREATE OR REPLACE FUNCTION public.{helper}" not in body
            ), f"a 082 nao deve recriar {helper}"
            assert f"CREATE OR REPLACE FUNCTION public.{helper}(" not in body


class TestTravaDeRegressaoSql:
    def test_existe_teste_estrutural_da_079(self):
        assert TEST_082.is_file()

    def test_teste_082_cobre_os_cenarios_chave(self):
        test = _read(TEST_082)
        for cenario in (
            "INSERT direto sem Action gravou a linha",
            "UPDATE direto sem Action foi aplicado",
            "DELETE direto sem Action foi aplicado",
            "membership na unidade A nao pode autorizar a unidade B",
            "membership suspensa deve ser NEGADA",
            "role sem a Action deve ser NEGADA",
            "app_access legado pc-care=full NAO pode autorizar checklist",
            "usuario sem membership deve ser NEGADO",
            "NULL workspace deve ser NEGADO",
        ):
            assert cenario in test, f"o harness da 082 deveria cobrir: {cenario}"

    def test_teste_082_trava_o_mass_grant(self):
        test = _read(TEST_082)
        assert "must exist ONLY on tec" in test
        assert "must not leak to other roles" in test
        assert "must only exist at scope workspace" in test

    def test_teste_082_usa_o_harness_do_ci(self):
        """auth.uid() no stub do CI le request.jwt.claim.sub."""
        test = _read(TEST_082)
        assert "request.jwt.claim.sub" in test

    def test_teste_082_checa_a_acl(self):
        test = _read(TEST_082)
        assert "anon must NOT execute user_has_action" in test
        assert "authenticated must hold EXECUTE on user_has_action" in test
