"""Revisão estática da migration 043_fix_describe_tv_app_data_alias.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: fakes de
requests / leitura estática do DDL). A migration 032 introduziu um bug de
referência em `describe_tv_app_data`: a soma do total usava
`SUM(v::numeric) FROM jsonb_each_text(v_result)`, mas `jsonb_each_text`
retorna as colunas (key, value) — `v` não existe e o Postgres falha em
tempo de execução com `column "v" does not exist` (42703). A rota
autenticada `POST /api/admin/app-data/describe` (api/app.py) passa pela
autorização RBAC e falha DEPOIS, no RPC, com 502 (validado contra o
STAGING real na Etapa 8).

Garantias verificadas aqui (todas estáticas, sobre o DDL):
  - A 043 recria a função com `SUM(value::numeric)` — alias correto.
  - O corpo é idêntico à 032 exceto o alias (nenhuma mudança de escopo,
    tabelas, contrato de retorno ou NULL-guard).
  - A 032 original permanece intacta (append-only; nada reescrito).
  - Privilégios reafirmados: EXECUTE somente service_role.
  - Regressão travada: nenhuma função nova/anterior pode somar
    `jsonb_each_text` com alias inexistente.

Links:
  - Migration original: supabase/migrations/032_tv_app_data_purge.sql
  - Migration fix:       supabase/migrations/043_fix_describe_tv_app_data_alias.sql
  - Revisão original:    api/tests/test_purge_sql_review.py
"""

import re
from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
M032 = MIGRATIONS / "032_tv_app_data_purge.sql"
M043 = MIGRATIONS / "043_fix_describe_tv_app_data_alias.sql"


def _describe_body(sql: str) -> str:
    m = re.search(
        r"FUNCTION\s+public\.describe_tv_app_data\(.*?AS\s*\$\$(.*?)\$\$;",
        sql, re.DOTALL | re.IGNORECASE,
    )
    assert m, "função describe_tv_app_data não encontrada"
    return m.group(1)


@pytest.fixture(scope="module")
def sql032() -> str:
    return M032.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def sql043() -> str:
    return M043.read_text(encoding="utf-8")


class TestFixConteudo:
    def test_043_usa_o_alias_correto_value(self, sql043):
        body = _describe_body(sql043)
        assert "SUM(value::numeric)" in body, "soma deve usar a coluna `value` de jsonb_each_text"

    def test_043_nao_tem_mais_o_alias_quebrado(self, sql043):
        body = _describe_body(sql043)
        # `SUM(v::` com word boundary exato não pode existir (nem v::numeric
        # referenciando jsonb_each_text de qualquer forma).
        assert not re.search(r"SUM\(\s*v\s*::", body, re.IGNORECASE), (
            "alias quebrado `v` ainda presente na soma"
        )

    def test_032_permanece_intacta_append_only(self, sql032):
        # A 032 NÃO foi reescrita: o repositório é append-only (padrão 042→036).
        assert "SUM(v::numeric)" in sql032, (
            "032 foi editada — correções devem ser append-only (nova migration)"
        )

    @staticmethod
    def _strip_comments(sql: str) -> str:
        # Remove comentários `--` para que trechos CITADOS em comentários
        # (como o header da 043/044 documentando o bug) não gerem falso positivo.
        return re.sub(r"--[^\n]*", "", sql)

    # Forma EXATA da linha de total nas funções do purge:
    #   COALESCE(SUM(<alias>::numeric), 0) FROM jsonb_each_text(...)
    BAD_TOTAL = re.compile(
        r"COALESCE\(\s*SUM\(\s*(\w+)\s*::numeric\s*\)\s*,\s*0\s*\)\s*FROM\s+jsonb_each_text",
        re.IGNORECASE,
    )

    def test_nenhuma_soma_de_jsonb_each_text_com_alias_invalido(self):
        """Regressão: nenhuma migration (exceto a 032 original, mantida por
        ser append-only e corrigida pela 043) calcula o total sobre
        jsonb_each_text com alias diferente de `value`."""
        bad = []
        for f in sorted(MIGRATIONS.glob("*.sql")):
            if f.name.startswith("032_"):
                continue  # bug conhecido e documentado; supersedida pela 043
            sql = self._strip_comments(f.read_text(encoding="utf-8"))
            for m in self.BAD_TOTAL.finditer(sql):
                if m.group(1).lower() != "value":
                    bad.append(f"{f.name}: SUM({m.group(1)}::numeric)")
        assert not bad, f"alias inválido sobre jsonb_each_text: {bad}"

    def test_043_e_a_ultima_definicao_da_funcao_e_esta_correta(self):
        """A definição EFETIVA em produção é a da última migration que recria
        a função — precisa ser a 043, com o alias correto."""
        defs = [
            f for f in sorted(MIGRATIONS.glob("*.sql"))
            if re.search(
                r"CREATE OR REPLACE FUNCTION public\.describe_tv_app_data",
                self._strip_comments(f.read_text(encoding="utf-8")),
                re.IGNORECASE,
            )
        ]
        assert defs, "nenhuma definição de describe_tv_app_data encontrada"
        assert defs[-1].name.startswith("043_"), (
            f"última definição efetiva é {defs[-1].name}; 043 deve prevalecer"
        )
        body = _describe_body(self._strip_comments(defs[-1].read_text(encoding="utf-8")))
        assert "SUM(value::numeric)" in body


class TestCorpoEquivalente:
    def test_unica_diferenca_e_o_alias_da_soma(self, sql032, sql043):
        """O corpo da 043 é idêntico ao da 032, exceto `v::numeric` →
        `value::numeric` (comparação whitespace-normalizada)."""
        def norm(s: str) -> str:
            s = _describe_body(s)
            s = re.sub(r"SUM\(\s*v\s*::numeric", "SUM(ALIAS)", s, flags=re.IGNORECASE)
            s = re.sub(r"SUM\(\s*value\s*::numeric", "SUM(ALIAS)", s, flags=re.IGNORECASE)
            return re.sub(r"\s+", " ", s).strip()

        assert norm(sql032) == norm(sql043), (
            "corpo da 043 divergiu da 032 além do alias da soma"
        )

    def test_contrato_de_retorno_preservado(self, sql043):
        body = _describe_body(sql043)
        assert "jsonb_build_object('tables', v_result, 'total'," in re.sub(r"\s+", " ", body)
        counted = set(re.findall(r"'(tv_[a-z_]+)'", body))
        assert counted == {
            "tv_events", "tv_playlists", "tv_announcements", "tv_galleries",
            "tv_gallery_photos", "tv_music_queues", "tv_music_tracks",
            "tv_urgent_announcements", "tv_calendar_cache",
        }

    def test_null_guard_preservado(self, sql043):
        assert "IF p_workspace IS NULL THEN" in _describe_body(sql043)

    def test_atributos_de_seguranca_preservados(self, sql043):
        head, _, _ = sql043.partition("AS $$")
        assert "SECURITY DEFINER" in head
        assert "SET search_path = public" in head


class TestPrivilegios:
    def test_execute_somente_service_role(self, sql043):
        assert re.search(
            r"REVOKE ALL ON FUNCTION public\.describe_tv_app_data\(uuid\)\s+FROM PUBLIC, anon, authenticated;",
            sql043,
        )
        assert re.search(
            r"GRANT EXECUTE ON FUNCTION public\.describe_tv_app_data\(uuid\)\s+TO service_role;",
            sql043,
        )


class TestBackendConsumidor:
    def test_rota_continua_chamando_a_mesma_funcao(self):
        app = (Path(__file__).resolve().parents[1] / "app.py").read_text(encoding="utf-8")
        assert re.search(
            r"_rpc\('describe_tv_app_data',\s*\{'p_workspace': g\.workspace_id\}\)",
            app,
        ), "contrato da rota /api/admin/app-data/describe mudou indevidamente"
