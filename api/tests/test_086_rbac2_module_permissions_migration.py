"""Revisão estática da migration 086 (tarefa RBAC 2.0 — permissões de módulo).

A 077 concedeu `tv.manage` a `opv`/`adm` e ABORTAVA se `tec` a recebesse
(`077:130-137`, decisão da 059:19-26). A tarefa de produto é: técnico tem
`full` nos cinco módulos do workspace — inclusive TV. `full` sem autoridade de
escrita seria uma tela que abre e não opera nada, então a 086 semeia
`tv.manage` também em `tec` e trava todo o resto.

O que é verificado aqui (leitura estática; o comportamento com `auth.uid()` real
roda em `supabase/migrations/tests/086_rbac2_module_permissions.sql`, no
Migrations CI):

  1. a migration 086 existe e é sequencial (imediatamente após a 085);
  2. ela concede EXATAMENTE `tv.manage@workspace` a `tec` — e nada mais;
  3. o seed é idempotente (`ON CONFLICT ... DO NOTHING`) e faz NENHUM `DELETE`;
  4. as cinco travas anti-escalada existem: `tec` com 1 `tv.manage@workspace`,
     nenhum cargo fora de opv/adm/tec, escopo só `workspace`, `vis` sem
     mutação e `coordinator` com as linhas vermelhas da 040;
  5. ela NÃO toca policy, helper, trigger, tabela, `profiles.*`,
     `MODULE_VISIBILITY_BY_SLUG` nem o bypass de super admin — ou seja, a
     correção de visibilidade não vira uma reescrita do esquema;
  6. a matriz de visibilidade e a 086 contam a mesma história: quem ganhou
     `full` ganhou a Action, quem ganhou `read` não ganhou escrita.

LIMITAÇÃO (comportamental): este arquivo NÃO abre conexão com banco. A prova de
ALLOW/DENY por membership (incluindo isolamento entre unidades, membership
inativa e o DENY de `vis`/`coordinator`) é do harness SQL da 086.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "086_rbac2_module_permissions.sql"
PREV = MIGRATIONS_DIR / "085_grant_execute_policy_helpers.sql"
TEST_086 = MIGRATIONS_DIR / "tests" / "086_rbac2_module_permissions.sql"
MATRIX_TS = ROOT / "src" / "core" / "permissions" / "moduleVisibility.ts"
LEGACY_077 = MIGRATIONS_DIR / "077_rbac2_can_manage_tv.sql"

ACTION = "tv.manage"
GRANT_ROLES = {"opv", "adm", "tec"}

# Nada disto pode aparecer no corpo EXECUTADO da migration: a 086 ajusta
# `role_permissions` e só. Qualquer reescrita de esquema seria a 085 e a 077
# de novo, por outra razão, e abriria blast radius desnecessário.
FORBIDDEN_IN_MIGRATION = [
    "CREATE TABLE",
    "ALTER TABLE",
    "DROP TABLE",
    "DROP COLUMN",
    "CREATE TRIGGER",
    "CREATE POLICY",
    "DROP POLICY",
    "CREATE OR REPLACE FUNCTION",
    "CREATE VIEW",
    "DELETE FROM",
    "UPDATE public.profiles",
    "RBAC_2_ENABLED",
    "workspace_ids",
]


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


class TestExistenciaEOrdenacao:
    def test_migration_086_existe(self):
        assert MIGRATION.is_file(), "a migration 086 deve existir"

    def test_086_vem_apos_a_085(self):
        assert PREV.is_file(), "a 085 deve existir (baseline anterior)"
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 86 in nums, f"a 086 deveria existir na sequência (numeros: {nums})"
        assert nums.count(86) == 1, f"a 086 aparece {nums.count(86)}x na sequência"
        assert nums.index(86) > nums.index(85), "a 086 precisa vir depois da 085"

    def test_086_vem_apos_a_077(self):
        """`tv.manage` precisa existir antes: a 086 só semeia, não cria."""
        assert LEGACY_077.is_file(), "a 077 deve existir"
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert nums.index(86) > nums.index(77), "a 086 precisa vir depois da 077"


class TestGrant:
    def test_concede_exatamente_tv_manage_a_tec(self, body):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        assert block, "deve existir o INSERT de role_permissions"
        linhas = [
            linha
            for linha in block.group(0).split("\n")
            if "role_permissions" not in linha and "v_tec" in linha
        ]
        assert linhas, "o INSERT deve semear em v_tec"
        for linha in linhas:
            assert re.search(r"'tv\.manage',\s*'workspace'", linha), (
                f"a 086 so pode semear tv.manage@workspace; achou: {linha.strip()}"
            )

    def test_seed_e_idempotente(self, body):
        assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in body

    def test_nao_faz_delete_de_nenhuma_permission(self, body):
        """Revogar capacidade existente é decisão de produto separada."""
        assert not re.search(r"DELETE\s+FROM\s+public\.role_permissions", body, re.I), (
            "a 086 nao deve DELETE em role_permissions"
        )

    def test_nao_concede_nada_a_vis_ou_coordinator(self, body):
        """`read` ≠ escrita: o grant da 086 é só do `tec`."""
        for proibida in ("v_vis", "v_coord"):
            block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
            assert proibida not in block.group(0), (
                f"{proibida} nao pode receber grant nesta migration"
            )

    def test_tec_e_o_unico_tecnico_recebido(self, body):
        block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", body, re.S)
        slugs = re.findall(r"\b(v_opv|v_adm|v_tec|v_vis|v_coord|v_est)\b", block.group(0))
        assert slugs == ["v_tec"], f"apenas tec deve ser semeado; achou: {slugs}"


class TestTravasAntiEscalada:
    def test_trava_tec_tem_exatamente_uma_tv_manage(self, body):
        assert re.search(
            r"role_id\s*=\s*v_tec\s+AND\s+action\s*=\s*'tv\.manage'", body
        ), "a 086 deve contar a tv.manage do tec"
        assert re.search(r"IF v_count <> 1 THEN\s+RAISE EXCEPTION", body), (
            "a contagem do tec deve ABORTAR quando != 1"
        )

    def test_trava_tv_manage_nao_vaza_para_fora_de_opv_adm_tec(self, body):
        assert re.search(r"r\.slug\s+NOT\s+IN\s*\(\s*'opv'\s*,\s*'adm'\s*,\s*'tec'\s*\)", body), (
            "a 086 deve abortar se tv.manage existir fora de opv/adm/tec"
        )

    def test_trava_de_escopo(self, body):
        assert re.search(
            r"action\s*=\s*'tv\.manage'\s+AND\s+scope\s*<>\s*'workspace'", body
        ), "a 086 deve abortar se tv.manage existir fora do escopo workspace"
        assert re.search(
            r"NOT\s+IN\s*\(\s*'vis'\s*,\s*'est'\s*,\s*'coordinator'\s*,\s*'lider'\s*\)", body
        ) is None, "o guard de escopo nao deve usar outra lista de cargos"

    def test_trava_vis_sem_mutacao(self, body):
        """O invariante central do papel visualizador: nenhuma escrita pode vir de `read`."""
        guard = re.search(r"r\.slug\s*=\s*'vis'(.*?)IF v_offended > 0 THEN", body, re.S)
        assert guard, "a 086 deve ter um guard fail-closed sobre o cargo vis"
        bloco = guard.group(1)
        for acao in (
            "ticket.create",
            "ticket.edit",
            "ticket.status",
            "ticket.assign",
            "ticket.close",
            "ticket.reopen",
            "ticket.delete",
            "chamados.settings.manage",
            "reservelab.tablet.reserve",
            "reservelab.tablet.cancel",
            "tv.manage",
        ):
            assert acao in bloco, f"o guard de vis deve cobrir {acao}"
        assert re.search(r"RAISE EXCEPTION\s+'FAIL: cargo vis e somente-leitura", body), (
            "o guard de vis deve ABORTAR a migration"
        )

    def test_trava_linhas_vermelhas_do_coordenador(self, body):
        guard = re.search(r"r\.slug\s*=\s*'coordinator'(.*?)IF v_offended > 0 THEN", body, re.S)
        assert guard, "a 086 deve preservar as linhas vermelhas da 040"
        bloco = guard.group(1)
        assert re.search(r"rp\.action\s+=\s*'tv\.manage'", bloco)
        assert re.search(r"rp\.action\s+LIKE\s+'tv\.%'", bloco)
        assert re.search(r"rp\.action\s+LIKE\s+'reservelab\.%'", bloco)
        assert re.search(r"rp\.action\s+LIKE\s+'admin\.%'", bloco)
        assert "'ticket.delete'" in bloco
        assert "'ticket.weeklyEmail'" in bloco
        assert re.search(r"RAISE EXCEPTION\s+'FAIL: coordinator mantem as linhas vermelhas", body), (
            "o guard do coordenador deve ABORTAR a migration"
        )

    def test_todas_as_travas_abortam(self, body):
        """Nenhuma trava pode ser só um SELECT: as 5 sobem para RAISE EXCEPTION."""
        # 1 (contagem do tec) + 4 (escopo, vis, coordinator e o gate de roles ausentes).
        assert len(re.findall(r"RAISE EXCEPTION\s+'FAIL:", body)) == 6, (
            "a 086 precisa abortar em cada divergencia (5 travas + roles ausentes), "
            "nao apenas reportar"
        )


class TestForaDeEscopo:
    def test_nao_reescreve_esquema_nem_policies(self, body):
        for proibida in FORBIDDEN_IN_MIGRATION:
            assert proibida not in body, f"a 086 nao pode conter {proibida}"

    def test_nao_toca_profiles_nem_app_access(self, body):
        assert "app_access" not in body, "a 086 nao toca profiles.app_access"
        assert not re.search(r"UPDATE\s+public\.profiles", body, re.I)

    def test_nao_mexe_na_matriz_de_visibilidade(self, body):
        """A matriz vive em `moduleVisibility.ts`; a migration so ajusta Actions."""
        assert "MODULE_VISIBILITY_BY_SLUG" not in body
        assert "moduleVisibility" not in body

    def test_nao_redefine_helpers_de_autorizacao(self, body):
        assert "CREATE OR REPLACE FUNCTION" not in body, (
            "a 086 nao pode recriar user_can_manage_tv nem qualquer outra helper"
        )

    def test_nao_cria_action(self, body):
        """Nenhuma Action nova: `tv.manage` já existe desde a 077."""
        acoes = set(re.findall(r"'([a-z]+\.[A-Za-z.]+)'", body))
        novas = {a for a in acoes if a not in _KNOWN_ACTIONS}
        # `tv.manage` é a única string de Action esperada fora dos guards.
        assert acoes <= _KNOWN_ACTIONS, f"Action desconhecida na migration: {novas - _KNOWN_ACTIONS}"


# Catálogo mínimo: as Actions que a 086 pode CITAR (o grant e os guards).
# Não é uma lista de "Actions permitidas para conceder" — é uma trava contra
# inventar nome de Action por engano ao editar a migration.
_KNOWN_ACTIONS = {
    "tv.manage",
    "tv.content.manage",
    "tv.urgentAnnouncement",
    "tv.device.manage",
    "tv.settings.manage",
    "tv.purge",
    "music.moderate",
    "admin.app.purge",
    "ticket.create",
    "ticket.view",
    "ticket.edit",
    "ticket.status",
    "ticket.assign",
    "ticket.comment",
    "ticket.close",
    "ticket.reopen",
    "ticket.delete",
    "ticket.claim",
    "ticket.qr",
    "ticket.report",
    "ticket.weeklyEmail",
    "chamados.settings.manage",
    "stock.item.create",
    "stock.item.edit",
    "stock.item.delete",
    "stock.movement.create",
    "stock.movement.manage",
    "stock.kit.audit",
    "stock.inventory.run",
    "stock.maintenance.manage",
    "stock.export",
    "pcare.asset.create",
    "pcare.asset.edit",
    "pcare.asset.manage",
    "pcare.part.create",
    "pcare.part.edit",
    "pcare.part.delete",
    "pcare.maintenance.manage",
    "pcare.import",
    "pcare.export",
    "pcare.checklist.create",
    "pcare.checklist.edit",
    "pcare.checklist.delete",
    "reservelab.tablet.reserve",
    "reservelab.tablet.cancel",
    "reservelab.push.manage",
}


class TestMatrizEActionCoerentes:
    """A regra de produto: `full` na matriz ⇒ Action de escrita correspondente."""

    def test_matriz_declare_tv_full_para_tec(self):
        matriz = _read(MATRIX_TS)
        bloco = re.search(r"\btec:\s*\{(.*?)\}", matriz, re.S)
        assert bloco, "a matriz deve ter uma linha para tec"
        assert re.search(r"tv:\s*'full'", bloco.group(1)), (
            "a 086 concede tv.manage ao tec; a matriz precisa declarar tv: 'full'"
        )
        assert re.search(r"reservalab:\s*'full'", bloco.group(1)), (
            "o tecnico tem reservalab.tablet.reserve/cancel; a matriz precisa de 'full'"
        )

    def test_matriz_declara_read_para_vis_e_coordinator(self):
        matriz = _read(MATRIX_TS)
        for slug in ("vis", "coordinator"):
            bloco = re.search(rf"\b{slug}:\s*\{{(.*?)\n  \}}", matriz, re.S)
            assert bloco, f"a matriz deve ter uma linha para {slug}"
            conteudo = bloco.group(1)
            assert "tv: 'read'" in conteudo, f"{slug} entra na TV com 'read'"
            assert "chamados: 'read'" in conteudo, f"{slug} fica com 'read' em chamados"
            assert "'full'" not in conteudo, (
                f"{slug} nao pode ter 'full': a 086 nao concede nenhuma escrita a ele"
            )

    def test_matriz_mantem_lider_e_unmapped_fora_da_regra(self):
        matriz = _read(MATRIX_TS)
        bloco = re.search(r"\blider:\s*\{(.*?)\}", matriz, re.S)
        assert bloco, "lider deve continuar declarado"
        conteudo = bloco.group(1)
        assert "tv" not in conteudo and "reservalab" not in conteudo, (
            "lider segue sem TV e sem ReservaLab (escopo de unidade, nao alvo desta tarefa)"
        )
        assert "UNMAPPED_SLUGS" in matriz and "'opv', 'est', 'adm'" in matriz, (
            "opv/est/adm seguem sem linha na matriz (divida tecnica registrada)"
        )


class TestHarnessSql:
    def test_existe_harness_da_086(self):
        assert TEST_086.is_file(), "a 086 precisa de harness em migrations/tests/"

    def test_harness_cobre_os_cenarios_de_autorizacao(self):
        harness = _read(TEST_086)
        for cenario in (
            "user without membership must be DENIED TV management",
            "active tec membership must be ALLOWED to manage TV (the 086 grant)",
            "active tec membership must NOT grant access to workspace B",
            "viewer membership must be DENIED TV management (read != write)",
            "coordinator membership must be DENIED TV management",
            "suspended membership must be DENIED TV management",
            "an unrelated authenticated user must be DENIED TV management",
            "NULL workspace must be DENIED",
        ):
            assert cenario in harness, f"o harness da 086 precisa cobrir: {cenario}"

    def test_harness_usa_o_guc_do_stub(self):
        """auth.uid() no stub do CI le request.jwt.claim.sub."""
        assert "request.jwt.claim.sub" in _read(TEST_086)

    def test_harness_preserva_o_bypass_fora_da_helper(self):
        """A 086 dá a Action ao tec; o bypass de super admin continua na policy."""
        harness = _read(TEST_086)
        assert "super admin bypass must live in the policy, not in user_can_manage_tv" in harness
        assert "tv_can_manage_workspace must keep the is_super_admin bypass" in harness

    def test_harness_trava_vis_coordinator_e_reservalab(self):
        harness = _read(TEST_086)
        assert "cargo vis must stay read-only" in harness
        assert "coordinator must keep the 040 red lines" in harness
        assert "reservelab.tablet.* must exist ONLY on tec" in harness


class TestHarness077Acompanhado:
    """A 077 é histórico, mas seu harness roda contra o banco DEPOIS da 086."""

    def test_harness_077_aceita_tec_sem_perder_o_bloqueio_dos_outros(self):
        harness = _read(MIGRATIONS_DIR / "tests" / "077_rbac2_can_manage_tv.sql")
        assert "tv.manage granted to roles outside opv/adm/tec" in harness
        assert "tec must NOT hold tv.manage" not in harness, (
            "a 077 nao pode mais proibir tec: a 086 concede a Action por decisao de produto"
        )

    def test_077_permanece_sem_a_concessao_ao_tec(self):
        """A migration 077 em si NAO foi reescrita: a concessão vive na 086."""
        corpo = _strip_sql_comments(_read(LEGACY_077))
        bloco = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT", corpo, re.S)
        assert "v_tec" not in bloco.group(0), (
            "a 077 nao deve semear tv.manage em tec — quem concede e a 086"
        )

    def test_077_ainda_aborta_se_tec_tiver_tv_manage(self):
        """Invariante da 077 preservado: se a semeação voltasse para a 077, aborta."""
        corpo = _strip_sql_comments(_read(LEGACY_077))
        assert re.search(r"role_id\s*=\s*v_tec\s+AND\s+action\s*=\s*'tv\.manage'", corpo)


class TestContratoCompartilhadoComOCliente:
    """A migration e o espelho do `role_permissions` no cliente não podem divergir."""

    MIRROR = ROOT / "src" / "core" / "permissions" / "__tests__" / "modulePermissions.test.ts"

    def test_existe_o_espelho_no_cliente(self):
        assert self.MIRROR.is_file(), (
            "o contrato de role_permissions precisa estar espelhado em src/ (o cliente "
            "nao tem como consultar o banco)"
        )

    def test_espelho_declara_tv_manage_para_tec(self):
        espelho = _read(self.MIRROR)
        bloco = re.search(r"\btec:\s*new Set\(\[(.*?)\]\)", espelho, re.S)
        assert bloco, "o espelho precisa declarar os grants do cargo tec"
        assert "'tv.manage'" in bloco.group(1), (
            "a 086 concede tv.manage ao tec; o espelho precisa refletir isso"
        )

    def test_espelho_declara_zero_mutacao_para_vis(self):
        espelho = _read(self.MIRROR)
        bloco = re.search(r"\bvis:\s*new Set\(\[(.*?)\]\)", espelho, re.S)
        assert bloco, "o espelho precisa declarar os grants do cargo vis"
        assert "'tv.manage'" not in bloco.group(1)
        assert "'reservelab.tablet.reserve'" not in bloco.group(1)
        assert "'chamados.settings.manage'" not in bloco.group(1)

    def test_espelho_declara_coordenador_sem_tv_nem_reservalab(self):
        espelho = _read(self.MIRROR)
        bloco = re.search(r"\bcoordinator:\s*new Set\(\[(.*?)\]\)", espelho, re.S)
        assert bloco, "o espelho precisa declarar os grants do cargo coordinator"
        conteudo = bloco.group(1)
        assert "'tv." not in conteudo, "coordinator nao pode ter tv.*"
        assert "'reservelab." not in conteudo, "coordinator nao pode ter reservelab.*"

    def test_espelho_e_o_mesmo_arquivo_que_testa_visibilidade_versus_autorizacao(self):
        espelho = _read(self.MIRROR)
        assert "VISIBILIDADE" in espelho and "AUTORIZAÇÃO" in espelho, (
            "o espelho precisa documentar que sao dois eixos independentes"
        )


def test_grant_roles_documentado():
    """Constante compartilhada com o teste da 077: o conjunto final é opv/adm/tec."""
    assert GRANT_ROLES == {"opv", "adm", "tec"}