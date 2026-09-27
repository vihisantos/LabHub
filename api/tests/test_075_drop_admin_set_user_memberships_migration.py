"""Revisão estática da migration 075 (#296 PR-3 — remoção do caminho 052).

O que é verificado aqui (mesmo padrão de `api/tests`: leitura estática):

  1. a migration 075 existe e é sequencial (imediatamente após a 074);
  2. ela faz `DROP FUNCTION IF EXISTS` com a ASSINATURA EXPLÍCITA da 052
     (`uuid, uuid[], text`) — idempotente e segura se a função já não existir;
  3. NÃO usa `CASCADE` (nada depende da 052 por dependência de objeto);
  4. NÃO mexe em dados: sem INSERT/UPDATE/DELETE, sem `CREATE FUNCTION`, sem
     alteração de `profiles`, `memberships`, `roles`, `workspace_ids`,
     `profiles.role`, `app_access` nem das RPCs 072;
  5. a migration HISTÓRICA 052 continua no repositório e continua definindo a
     função — o PR-3 remove o caminho runtime, não reescreve o histórico;
  6. o teste estrutural da 052 foi invertido: passa a exigir AUSÊNCIA;
  7. nenhum consumidor runtime restou — endpoint legado, métodos do
     `adminService` e o `scripts/e2e_db.py` não mencionam mais a 052;
  8. as rotas 072/074 e o `_ROLE_ID_TO_SLUG` continuam no `api/app.py`.

LIMITAÇÃO (comportamental): provar que a função não existe no banco final
exige PostgreSQL. Feito em `supabase/migrations/tests/052_admin_set_memberships.sql`
e `supabase/migrations/tests/075_drop_admin_set_user_memberships.sql`, que rodam
no Migrations CI (PostgreSQL efêmero) — não executáveis localmente.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "075_drop_admin_set_user_memberships.sql"
LEGACY_052 = MIGRATIONS_DIR / "052_rbac2_admin_set_memberships.sql"
TEST_052 = MIGRATIONS_DIR / "tests" / "052_admin_set_memberships.sql"
TEST_053 = MIGRATIONS_DIR / "tests" / "053_disable_legacy_sync.sql"
API_APP = ROOT / "api" / "app.py"
ADMIN_SERVICE = ROOT / "src" / "core" / "auth" / "adminService.ts"
E2E_DB = ROOT / "scripts" / "e2e_db.py"

# O que a 075 NÃO pode conter (só remoção de função).
FORBIDDEN_IN_MIGRATION = [
    "CASCADE",
    "CREATE OR REPLACE FUNCTION",
    "CREATE FUNCTION",
    "CREATE TABLE",
    "CREATE TRIGGER",
    "INSERT INTO",
    "DELETE FROM",
    "UPDATE public.profiles",
    "UPDATE public.memberships",
    "DROP TABLE",
    "DROP COLUMN",
    "POLICY",
    "GRANT ",
    "REVOKE ",
    "workspace_ids",
    "app_access",
    "profiles.role",
    "admin_upsert_membership",
    "admin_remove_membership",
    "admin_set_manager",
    "user_belongs_to_workspace",
]

# Consumidores que NÃO podem mais citar a 052.
RUNTIME_CONSUMERS = [
    API_APP,
    ADMIN_SERVICE,
    E2E_DB,
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_py_comments(src: str) -> str:
    """Remove comentários `#` de Python respeitando strings (aspas simples/duplas)."""
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


def _strip_ts_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", " ", src)


def _strip_sql_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"--[^\n]*", " ", src)


def _strip_code(path: Path) -> str:
    """Devolve o código sem comentários, conforme a linguagem do arquivo.

    Necessário porque a remoção da 052 é *documentada* em comentários
    legítimos (cabeçalho da 075, nota de seção em `api/app.py`): o que
    interessa é que nenhum código EXECUTÁVEL a referencie.
    """
    src = _read(path)
    if path.suffix == ".py":
        return _strip_py_comments(src)
    if path.suffix in (".ts", ".tsx"):
        return _strip_ts_comments(src)
    return _strip_sql_comments(src)


@pytest.fixture(scope="module")
def sql() -> str:
    return _read(MIGRATION)


@pytest.fixture(scope="module")
def body() -> str:
    """Migration sem comentários — só o que é executado."""
    return _strip_code(MIGRATION)


class TestExistenciaEOrdenacao:
    def test_migration_075_existe(self):
        assert MIGRATION.is_file(), "a migration 075 deve existir"

    def test_075_esta_sequenciada_apos_a_074(self):
        """A 075 precisa vir depois da 074, mas NÃO precisa ser a última: a 076
        (#296 PR-4A) já a segue. O que trava é o sequenciamento, não o topo."""
        nums = sorted(
            int(m.group(1))
            for m in (re.match(r"^(\d+)_", p.name) for p in MIGRATIONS_DIR.glob("*.sql"))
            if m
        )
        assert 75 in nums, f"a 075 deveria existir na sequência (numeros: {nums})"
        assert 74 in nums, f"a 074 deveria existir na sequência (numeros: {nums})"
        assert nums.index(75) > nums.index(74), "a 075 precisa vir depois da 074"
        # 075 não pode reaparecer duplicada nem colidir com outra migration.
        assert nums.count(75) == 1, f"a 075 aparece {nums.count(75)}x na sequência"

    def test_075_vem_apos_a_074(self):
        assert (MIGRATIONS_DIR / "074_admin_rejection_state.sql").is_file()


class TestDropExplicitoEIdempotente:
    def test_drop_function_if_exists_com_assinatura_explicita(self, body):
        assert re.search(
            r"DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.admin_set_user_memberships\s*\(\s*"
            r"uuid\s*,\s*uuid\[\]\s*,\s*text\s*\)\s*;",
            body,
            re.I,
        ), "esperado: DROP FUNCTION IF EXISTS ... (uuid, uuid[], text)"

    def test_idempotente_quando_a_funcao_ja_nao_existe(self, body):
        # `IF EXISTS` é o que torna o replay seguro (no-op).
        assert re.search(r"DROP\s+FUNCTION\s+IF\s+EXISTS", body, re.I)

    def test_nao_recria_a_funcao(self, body):
        assert not re.search(r"CREATE\s+(OR\s+REPLACE\s+)?FUNCTION", body, re.I)

    def test_sem_cascade(self, body):
        assert "CASCADE" not in body.upper()


class TestNaoTocaDadosNemEscopo:
    @pytest.mark.parametrize("token", FORBIDDEN_IN_MIGRATION)
    def test_token_proibido_ausente(self, body, token):
        assert token.upper() not in body.upper(), f"a 075 não deveria conter {token!r}"

    def test_nao_altera_rpc_072(self, body):
        for fn in ("admin_upsert_membership", "admin_remove_membership", "admin_set_manager"):
            assert fn not in body

    def test_preserva_workspace_ids_e_app_access(self, body):
        assert "workspace_ids" not in body
        assert "app_access" not in body

    def test_preserva_user_belongs_to_workspace(self, body):
        assert "user_belongs_to_workspace" not in body


class TestHistoricoPreservado:
    def test_migration_052_continua_no_repositorio(self):
        assert LEGACY_052.is_file(), "a migration 052 é histórica e NÃO pode ser apagada"

    def test_052_continua_definindo_a_funcao(self):
        """O PR-3 não pode 'fingir' que a 052 nunca criou a função."""
        legacy = _read(LEGACY_052)
        assert re.search(
            r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_set_user_memberships",
            legacy,
            re.I,
        )

    def test_052_preserva_a_assinatura_que_a_075_derruba(self):
        legacy = _read(LEGACY_052)
        assert re.search(
            r"admin_set_user_memberships\(\s*uuid\s*,\s*uuid\[\]\s*,\s*text\s*\)",
            legacy,
            re.I,
        )

    def test_075_e_a_unica_que_remove_a_funcao(self):
        removers = [
            p.name
            for p in MIGRATIONS_DIR.glob("*.sql")
            if re.search(
                r"DROP\s+FUNCTION[^;]*admin_set_user_memberships", _read(p), re.I
            )
        ]
        assert removers == [MIGRATION.name], f"removedor(es) inesperado(s): {removers}"


class TestTestesDeMigrationInvertidos:
    def test_teste_052_exige_ausencia_da_funcao(self):
        test = _read(TEST_052)
        assert "must be REMOVED post-075" in test
        assert "IF v_count <> 0 THEN" in test

    def test_teste_053_exige_ausencia_da_funcao(self):
        test = _read(TEST_053)
        assert "must be REMOVED post-075" in test
        assert "IF v_count <> 0 THEN" in test

    def test_teste_053_preserva_as_garantias_independentes(self):
        """As checagens 1-4 da 053 (sync legada desligada) têm valor próprio."""
        test = _read(TEST_053)
        assert "trg_profiles_sync_memberships" in test
        assert "sync_user_memberships function must be REMOVED" in test
        assert "handle_new_user" in test
        assert "on_auth_user_created" in test

    def test_ha_trava_de_regressao_para_a_ausencia(self):
        assert (MIGRATIONS_DIR / "tests" / "075_drop_admin_set_user_memberships.sql").is_file()


class TestSemConsumidorRuntime:
    @pytest.mark.parametrize("path", RUNTIME_CONSUMERS, ids=lambda p: p.name)
    def test_consumidor_nao_chama_a_052(self, path):
        code = _strip_code(path)
        assert "admin_set_user_memberships" not in code, (
            f"{path.name} ainda referencia a RPC 052 fora de comentário"
        )

    def test_endpoint_legado_removido(self):
        assert not re.search(r"@app\.route\(\s*'/api/admin/users/<[^>]+>/memberships'", _read(API_APP))

    def test_set_user_memberships_removido_do_servico(self):
        service = _read(ADMIN_SERVICE)
        assert not re.search(r"\bsetUserMemberships\s*:", service)
        assert not re.search(r"\bupdateUserWorkspaces\s*:", service)

    def test_e2e_usa_o_modelo_072(self):
        script = _read(E2E_DB)
        assert "admin_upsert_membership" in script
        assert "admin_set_user_memberships" not in script


class TestRotasPreservadas:
    @pytest.mark.parametrize(
        "rota",
        [
            r"/api/admin/users/<user_id>/membership', methods=\['POST'\]",
            r"/api/admin/users/<user_id>/membership', methods=\['DELETE'\]",
            r"/api/admin/users/<user_id>/manager', methods=\['POST'\]",
            r"/api/admin/users/<user_id>/reject', methods=\['POST'\]",
        ],
    )
    def test_rota_preservada(self, rota):
        assert re.search(rota, _read(API_APP)), f"rota ausente: {rota}"

    def test_role_id_to_slug_preservado_e_usado(self):
        """`_ROLE_ID_TO_SLUG` é compartilhado com a rota 072 — não pode sair."""
        app = _read(API_APP)
        assert "_ROLE_ID_TO_SLUG = {" in app
        assert len(re.findall(r"_ROLE_ID_TO_SLUG\.get\(", app)) >= 1, (
            "a 072 (admin_upsert_membership) precisa continuar usando _ROLE_ID_TO_SLUG"
        )
