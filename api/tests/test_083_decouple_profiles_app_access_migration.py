"""Revisão estática da migration 083 (F2-D-I — desacoplar `profiles.app_access`).

Contexto: a auditoria read-only F2-D-H comprovou que `profiles.app_access` não
possui mais autoridade funcional (0 policy, 0 RPC, 0 função viva, 0 rota Python,
0 targeting de push). Restavam 2 triggers vivos que liam `NEW/OLD.app_access` em
corpos plpgsql — e o Postgres NÃO valida corpo plpgsql no DDL, então um
`DROP COLUMN app_access` passaria e passaria a estourar em TODO `UPDATE` de
`profiles`. A 080 recria as duas funções sem essa dependência, preservando todo
o resto.

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática do DDL):

  1. a migration 083 existe e é sequencial (imediatamente após a 082);
  2. `audit_profiles_change()` (054) é recriada SEM `app_access` e preservando
     `role_changed`/`status_changed`/`super_admin_toggled` (com os `meta`), a
     resolução do workspace por membership ativa, o INSERT em `app_audit_logs`,
     `RETURN NEW`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`;
  3. a trigger `trg_app_audit_profiles` mantém nome, `AFTER UPDATE`,
     `FOR EACH ROW`, a função chamada e o `WHEN` com os 3 campos sensíveis —
     sem `app_access`;
  4. `guard_profile_privileged_columns()` (067) é recriada SEM `app_access` e
     preservando: contexto confiável, `id` imutável, `workspace_ids` imutável,
     `ERRCODE 42501`, a mensagem original, o atalho do Super Admin e o bloqueio
     de `is_super_admin`/`role`/`status`;
  5. a trigger `trg_profiles_guard_privileged` mantém nome, `BEFORE UPDATE` e
     `FOR EACH ROW`;
  6. a migration NÃO altera policies, Actions, seeds, memberships, `role`,
     `app_access` (a COLUNA), `membership_overrides`, Push ou AppGuard;
  7. ANTI-REGRESSÃO: a ÚLTIMA definição de cada uma das duas funções, em toda a
     sequência de migrations, não pode conter `app_access` — é isto que
     impede uma migration futura de reintroduzir a dependência;
  8. o harness SQL da 083 existe e cobre auditoria + guard.

LIMITAÇÃO (comportamental): a prova de ALLOW/DENY com `auth.uid()` real roda em
`supabase/migrations/tests/083_*.sql` (Migrations CI, PostgreSQL efêmero). Aqui
fica a verificação estrutural do que é executado.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "083_decouple_profiles_app_access_from_triggers.sql"
TEST_083 = MIGRATIONS_DIR / "tests" / "083_decouple_profiles_app_access_from_triggers.sql"

ORIG_054 = MIGRATIONS_DIR / "054_app_audit_logs.sql"
ORIG_067 = MIGRATIONS_DIR / "067_rbac2_trust_boundary_profiles.sql"

AUDIT_FN = "audit_profiles_change"
GUARD_FN = "guard_profile_privileged_columns"
AUDIT_TRIGGER = "trg_app_audit_profiles"
GUARD_TRIGGER = "trg_profiles_guard_privileged"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)


def _numbered_migrations() -> list[tuple[int, str]]:
    """(número, texto) de todas as migrations, em ordem de aplicação."""
    out = []
    for p in MIGRATIONS_DIR.glob("*.sql"):
        m = re.match(r"^(\d+)_", p.name)
        if m:
            out.append((int(m.group(1)), _read(p)))
    return sorted(out)


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
    """Só o que é executado, sem comentários (o código real da migration)."""
    return _strip_sql_comments(_read(MIGRATION))


def _function_block(fn: str) -> str:
    corpo = _extract_function(fn, _read(MIGRATION))
    assert corpo, f"a migration 083 deve recriar a função {fn}"
    return corpo


def _extract_function(fn: str, texto: str) -> str | None:
    """Corpo da função no texto, ou None se ela não estiver definida aí.

    Atenção ao terminador: o repo usa DUAS formas —
      · `$$ LANGUAGE plpgsql SECURITY DEFINER ...;`  (054)
      · `$$;`                                        (067)
    — então `\\$\\$;` sozinho casaria a função errada (o `.*?` non-greedy
    atravessaria a função seguinte). Retorna None (e não levanta) para que o
    chamador possa varrer vários arquivos.
    """
    match = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{fn}\(\).*?"
        r"(?:\$\$\s*LANGUAGE[^;]*;|\$\$;)",
        _strip_sql_comments(texto),
        re.S,
    )
    return match.group(0) if match else None


@pytest.fixture(scope="module")
def audit() -> str:
    return _function_block(AUDIT_FN)


@pytest.fixture(scope="module")
def guard() -> str:
    return _function_block(GUARD_FN)


class TestExistenciaEOrdenacao:
    def test_migration_083_existe(self):
        assert MIGRATION.is_file(), "a migration 083 deve existir"

    def test_083_esta_sequenciada_apos_a_082(self):
        nums = sorted(n for n, _ in _numbered_migrations())
        assert 82 in nums, f"a 082 deveria existir na sequência (numeros: {nums})"
        assert 83 in nums, f"a 083 deveria existir na sequência (numeros: {nums})"
        assert nums.index(83) > nums.index(82), "a 083 precisa vir depois da 082"
        assert nums.count(83) == 1, f"a 083 aparece {nums.count(83)}x na sequência"

    def test_origem_das_duas_funcoes_existe(self):
        assert ORIG_054.is_file()
        assert ORIG_067.is_file()

    def test_083_recria_as_duas_funcoes(self, body):
        assert f"CREATE OR REPLACE FUNCTION public.{AUDIT_FN}()" in body
        assert f"CREATE OR REPLACE FUNCTION public.{GUARD_FN}()" in body

    def test_083_recria_as_duas_triggers(self, body):
        # Nomes sem aspas, como em 054/067.
        assert f"DROP TRIGGER IF EXISTS {AUDIT_TRIGGER} ON public.profiles" in body
        assert f"CREATE TRIGGER {AUDIT_TRIGGER}" in body
        assert f"DROP TRIGGER IF EXISTS {GUARD_TRIGGER} ON public.profiles" in body
        assert f"CREATE TRIGGER {GUARD_TRIGGER}" in body


class TestTrigger054Auditoria:
    def test_nao_referencia_app_access(self, audit):
        assert "app_access" not in audit, (
            "audit_profiles_change() nao pode mais referenciar app_access (F2-D-I)"
        )

    def test_preserva_seguranca_definer_e_search_path(self, audit):
        assert "SECURITY DEFINER" in audit
        assert re.search(r"SET\s+search_path\s*=\s*public", audit)
        assert "LANGUAGE plpgsql" in audit

    @pytest.mark.parametrize(
        "evento,chaves",
        [
            ("role_changed", ("prev_role", "new_role")),
            ("status_changed", ("prev_status", "new_status")),
            ("super_admin_toggled", ("prev", "new_val")),
        ],
    )
    def test_preserva_eventos_e_meta(self, audit, evento, chaves):
        assert evento in audit, f"a auditoria de {evento} foi perdida"
        for chave in chaves:
            assert chave in audit, f"o meta {chave} de {evento} foi perdido"

    def test_preserva_resolucao_de_workspace_e_insert(self, audit):
        assert "public.memberships" in audit, (
            "a resolucao do workspace do alvo por membership ativa foi perdida"
        )
        assert "public.app_audit_logs" in audit
        assert "INSERT INTO public.app_audit_logs" in audit
        assert "RETURN NEW" in audit

    def test_comment_registra_o_contrato(self, sql):
        assert f"COMMENT ON FUNCTION public.{AUDIT_FN}()" in sql
        assert "app_access_changed" in sql, (
            "o COMMENT deve registrar que o evento app_access_changed foi removido"
        )

    def test_trigger_preserva_timing_nome_e_when(self, body):
        match = re.search(
            rf"CREATE TRIGGER {AUDIT_TRIGGER}.*?EXECUTE FUNCTION public\.\w+\(\)", body, re.S
        )
        assert match, f"a trigger {AUDIT_TRIGGER} deve ser recriada"
        bloco = match.group(0)
        assert "AFTER UPDATE ON public.profiles" in bloco
        assert "FOR EACH ROW" in bloco
        assert f"EXECUTE FUNCTION public.{AUDIT_FN}()" in bloco
        assert "WHEN" in bloco
        # WHEN com exatamente os 3 campos sensíveis remanescentes.
        for campo in ("role", "status", "is_super_admin"):
            assert re.search(
                rf"NEW\.{campo} IS DISTINCT FROM OLD\.{campo}", bloco
            ), f"o WHEN perdeu NEW.{campo}"
        assert "app_access" not in bloco


class TestTrigger067Guarda:
    def test_nao_referencia_app_access(self, guard):
        assert "app_access" not in guard, (
            "guard_profile_privileged_columns() nao pode mais referenciar app_access (F2-D-I)"
        )

    def test_preserva_seguranca_definer_e_search_path(self, guard):
        assert "SECURITY DEFINER" in guard
        assert re.search(r"SET\s+search_path\s*=\s*public", guard)
        assert "LANGUAGE plpgsql" in guard

    def test_preserva_contexto_confiavel(self, guard):
        assert re.search(r"auth\.uid\(\)\s+IS\s+NULL", guard), (
            "o atalho de contexto confiavel (auth.uid() nulo) foi perdido"
        )

    @pytest.mark.parametrize("campo", ["id", "workspace_ids"])
    def test_preserva_imutabilidade(self, guard, campo):
        assert re.search(
            rf"NEW\.{campo} IS DISTINCT FROM OLD\.{campo}", guard
        ), f"a imutabilidade de profiles.{campo} foi perdida"
        assert f"profiles.{campo} is immutable in normal UPDATE" in guard

    def test_preserva_atalho_do_super_admin(self, guard):
        assert "public.is_super_admin()" in guard

    def test_preserva_bloqueio_dos_campos_privilegiados(self, guard):
        for campo in ("is_super_admin", "role", "status"):
            assert re.search(
                rf"NEW\.{campo}\s+IS DISTINCT FROM OLD\.{campo}", guard
            ), f"a guarda perdeu a protecao de {campo}"
        assert "42501" in guard
        assert (
            "alteracao de campo privilegiado do proprio perfil nao e permitida" in guard
        ), "a mensagem de bloqueio mudou (contrato de erro alterado)"

    def test_comment_registra_o_contrato(self, sql):
        assert f"COMMENT ON FUNCTION public.{GUARD_FN}()" in sql

    def test_trigger_preserva_nome_timing_e_granularidade(self, body):
        match = re.search(
            rf"CREATE TRIGGER {GUARD_TRIGGER}.*?EXECUTE FUNCTION public\.\w+\(\)", body, re.S
        )
        assert match, f"a trigger {GUARD_TRIGGER} deve ser recriada"
        bloco = match.group(0)
        assert "BEFORE UPDATE ON public.profiles" in bloco
        assert "FOR EACH ROW" in bloco
        assert f"EXECUTE FUNCTION public.{GUARD_FN}()" in bloco
        assert "app_access" not in bloco


class TestEquivalenciaComAsOriginais:
    """A recriação não pode perder nenhum campo auditado nem nenhuma proteção."""

    def _originais(self, fn: str) -> str:
        for nome in (ORIG_054, ORIG_067):
            corpo = _extract_function(fn, _read(nome))
            if corpo:
                return corpo
        raise AssertionError(f"nao encontrei a definicao original de {fn}")

    def test_auditoria_perde_exatamente_um_ramo(self, audit):
        """A 054 tem 4 ramos; a 083 deve ter os mesmos 3, menos o de app_access."""
        original = self._originais(AUDIT_FN)
        orig_eventos = set(re.findall(r"v_action\s*:=\s*'([a-z_]+)'", original))
        novos_eventos = set(re.findall(r"v_action\s*:=\s*'([a-z_]+)'", audit))
        assert orig_eventos == {"role_changed", "status_changed", "super_admin_toggled", "app_access_changed"}
        assert novos_eventos == orig_eventos - {"app_access_changed"}, (
            f"a 083 deveria remover SOMENTE app_access_changed; restou {novos_eventos}"
        )

    def test_guarda_perde_exatamente_um_item(self, guard):
        """A 067 compara 6 colunas (id, workspace_ids e a lista de 4 privilegiados);
        a 083 deve comparar as mesmas 6 MENOS `app_access`."""
        original = self._originais(GUARD_FN)
        padrao = r"NEW\.([a-z_]+)\s+IS DISTINCT FROM OLD\.\1"
        orig_campos = set(re.findall(padrao, original))
        novos_campos = set(re.findall(padrao, guard))
        esperados = {"id", "workspace_ids", "is_super_admin", "role", "status", "app_access"}
        assert orig_campos == esperados, (
            f"a 067 original protege {sorted(orig_campos)}; o teste precisa refletir isso"
        )
        assert novos_campos == esperados - {"app_access"}, (
            f"a 083 deveria remover SOMENTE app_access; restou {sorted(novos_campos)}"
        )

    def test_lista_de_privilegiados_perde_somente_app_access(self, guard):
        """Foco no bloco da LISTA de campos privilegiados, separado das duas
        cláusulas de imutabilidade (`id`, `workspace_ids`) que vêm antes."""
        bloco = re.search(
            r"IF\s+NEW\.is_super_admin\s+IS DISTINCT FROM OLD\.is_super_admin.*?END IF;",
            guard,
            re.S,
        )
        assert bloco, "a lista de campos privilegiados nao foi encontrada na guarda"
        protegidos = set(
            re.findall(r"NEW\.([a-z_]+)\s+IS DISTINCT FROM OLD\.\1", bloco.group(0))
        )
        assert protegidos == {"is_super_admin", "role", "status"}, (
            f"a lista de privilegiados deve ter exatamente 3 campos; tem {sorted(protegidos)}"
        )
        assert "app_access" not in bloco.group(0)

    def test_nenhuma_outra_ausencia_de_termo(self, audit, guard):
        """Nenhum outro termo da 054/067 pode sumir (guard contra refactor parcial)."""
        for original, novo in (
            (self._originais(AUDIT_FN), audit),
            (self._originais(GUARD_FN), guard),
        ):
            for termo in (
                "v_ws", "v_meta", "auth.uid()", "ORDER BY created_at",
                "LIMIT 1", "COALESCE",
            ):
                if termo in original:
                    assert termo in novo, f"o termo {termo!r} foi perdido na recriacao"


class TestAntiRegressao:
    """Impede que uma migration futura reintroduza a dependencia de app_access."""

    def _ultima_definicao(self, fn: str) -> str:
        corpo = None
        for _, texto in _numbered_migrations():
            encontrado = _extract_function(fn, texto)
            if encontrado:
                corpo = encontrado
        assert corpo is not None, f"nenhuma migration define public.{fn}()"
        return corpo

    def test_ultima_definicao_da_auditoria_nao_tem_app_access(self):
        assert "app_access" not in self._ultima_definicao(AUDIT_FN), (
            "a ÚLTIMA definicao de audit_profiles_change() voltou a ler app_access"
        )

    def test_ultima_definicao_da_guarda_nao_tem_app_access(self):
        assert "app_access" not in self._ultima_definicao(GUARD_FN), (
            "a ÚLTIMA definicao de guard_profile_privileged_columns() voltou a ler app_access"
        )

    def test_ultima_trigger_de_auditoria_nao_tem_app_access(self):
        defs = [
            re.search(
                rf"CREATE TRIGGER {AUDIT_TRIGGER}.*?EXECUTE FUNCTION[^;]*;",
                _strip_sql_comments(texto),
                re.S,
            )
            for _, texto in _numbered_migrations()
        ]
        defs = [m.group(0) for m in defs if m]
        assert defs, f"nenhuma migration cria {AUDIT_TRIGGER}"
        assert "app_access" not in defs[-1], (
            "a ÚLTIMA definicao da trigger de auditoria voltou a mencionar app_access"
        )

    def test_nenhuma_trigger_viva_de_profiles_usa_app_access(self):
        """Das triggers de `profiles` ligadas a estas funções, a ÚLTIMA definição
        de cada uma não pode mencionar `app_access`.

        Só o último `CREATE TRIGGER` conta: as definições históricas (054/067)
        mentionam a coluna por desenho — foram exatamente elas que a 083
        substituiu. A trigger de sync de memberships (041) foi DROPada na 053.
        """
        ultima: dict[str, str] = {}
        for nome, texto in _numbered_migrations():
            corpo = _strip_sql_comments(texto)
            for m in re.finditer(
                rf"CREATE TRIGGER (\w+)\s+.*?EXECUTE FUNCTION public\.(\w+)\(\)", corpo, re.S
            ):
                trigger, fn = m.group(1), m.group(2)
                if fn in (AUDIT_FN, GUARD_FN):
                    ultima[trigger] = m.group(0)

        assert set(ultima) == {AUDIT_TRIGGER, GUARD_TRIGGER}, (
            f"esperava as duas triggers de profiles, achei {sorted(ultima)}"
        )
        for trigger, bloco in ultima.items():
            assert "app_access" not in bloco, (
                f"a definição vigente de {trigger} voltou a mencionar app_access"
            )


class TestEscopoNaoAlterado:
    """A 080 é estritamente o desacoplamento dos 2 triggers."""

    @pytest.mark.parametrize(
        "token",
        [
            # schema / coluna: esta migration NAO remove a coluna
            "DROP COLUMN",
            "ALTER TABLE public.profiles",
            # RLS de autorizacao
            "CREATE POLICY",
            "DROP POLICY",
            # RBAC2
            "INSERT INTO public.role_permissions",
            "role_permissions",
            "membership_overrides",
            "INSERT INTO public.memberships",
            "UPDATE public.memberships",
            "UPDATE public.roles",
            # fora de escopo
            "CREATE TABLE",
            "DROP TABLE",
            "CREATE TRIGGER trg_profiles_sync_memberships",
            "RBAC_2_ENABLED",
        ],
    )
    def test_token_proibido_ausente(self, body, token):
        assert token not in body, f"a 083 nao deveria conter {token!r}"

    def test_nao_altera_app_audit_logs_schema(self, body):
        """A tabela de auditoria e a policy dela (append-only) ficam como estao."""
        assert "CREATE TABLE" not in body
        assert "app_audit_logs" not in body or "INSERT INTO public.app_audit_logs" in body

    def test_nao_toca_o_evento_legacy_por_outro_caminho(self, body, audit):
        """`app_access_changed` não pode sobreviver como evento GRAVADO.

        A palavra aparece legitimamente no `COMMENT ON FUNCTION` (que registra a
        remoção) — o que não pode é uma atribuição que a escreva no log.
        """
        assert "v_action := 'app_access_changed'" not in body
        assert "app_access_changed" not in audit

    def test_nao_cria_backend_nem_rpc(self, body):
        assert "CREATE FUNCTION" not in body
        assert "RETURNS jsonb" not in body

    def test_idempotencia_padrao_do_repo(self, body):
        assert "CREATE OR REPLACE FUNCTION" in body
        assert body.count("DROP TRIGGER IF EXISTS") == 2, (
            "as duas triggers devem ser recriadas de forma idempotente"
        )

    def test_comentario_de_consciencia_de_seguranca_presente(self, sql):
        """A consequência de remover app_access da guarda precisa estar escrita."""
        assert "CONSCI" in sql.upper() and "SEGURAN" in sql.upper()
        assert "VISIBILIDADE" in sql.upper()
        # A nota tem que explicar por que não é elevação de privilégio.
        for termo in ("autoelevacao", "BLAST RADIUS", "42501"):
            assert termo in sql or termo.upper() in sql, (
                f"a nota de seguranca deve mencionar {termo!r}"
            )


class TestTravaDeRegressaoSql:
    def test_existe_teste_estrutural_da_080(self):
        assert TEST_083.is_file()

    def test_harness_cobre_auditoria(self):
        test = _read(TEST_083)
        for cenario in (
            "auditoria de role não foi gravada com o meta esperado",
            "auditoria de status não foi gravada com o meta esperado",
            "auditoria de is_super_admin não foi gravada com o meta esperado",
            "UPDATE neutro não deveria gerar auditoria",
        ):
            assert cenario in test, f"o harness da 083 deveria cobrir: {cenario}"

    def test_harness_cobre_guarda(self):
        test = _read(TEST_083)
        for cenario in (
            "usuario comum nao deveria trocar o proprio role",
            "usuario comum nao deveria trocar o proprio status",
            "usuario comum nao deveria se tornar super admin",
            "profiles.id deve continuar imutavel",
            "profiles.workspace_ids deve continuar imutavel",
        ):
            assert cenario in test, f"o harness da 083 deveria cobrir: {cenario}"

    def test_harness_cobre_a_decouplagem(self):
        test = _read(TEST_083)
        assert "ainda referencia app_access" in test
        assert "o WHEN de trg_app_audit_profiles ainda menciona app_access" in test
        assert "o DROP futuro seria inseguro" in test

    def test_harness_usa_o_harness_do_ci(self):
        test = _read(TEST_083)
        assert "request.jwt.claim.sub" in test
