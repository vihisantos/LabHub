"""Revisão estática da migration 061_tv_station_auto_advance.sql.

A suíte backend roda SEM Postgres ao vivo (padrão api/tests: leitura estática
do DDL). A 061 introduz o AUTO-ADVANCE AUTORITATIVO server-side (Fase 2.14):
o Desktop deixou de calcular a próxima faixa — o fim da música vira um SINAL
para o servidor, que valida o tempo decorrido (clock server-side) e aplica a
transição via `station_auto_advance`.

Garantias estruturais verificadas aqui (no corpo da migration 061):
  - station_auto_advance: SECURITY DEFINER + search_path public + assinatura
    (uuid, uuid, text, text, bigint) + VOLATILE.
  - NÃO chama station_begin_mutation (o gate tv_can_manage_workspace exige
    auth.uid(); service_role tem uid NULL) — autorização é responsabilidade do
    endpoint Flask.
  - Idempotência calculada DENTRO do shim ('auto-next:' + sha256 nativa, sem
    pgcrypto): p_idempotency_key/p_request_hash do caller NÃO são usados.
  - Acesso: REVOKE de anon/authenticated/PUBLIC + GRANT EXECUTE a service_role.
  - Concorrência (advisory lock por workspace) e expected_sequence (40900)
    preservados; replay via station_try_replay; transição idêntica à 039.
  - Nenhuma tabela/policy nova; sem SQL dinâmico; sem reescrever o kernel 039.
"""

import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "061_tv_station_auto_advance.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _load() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def _func_body(sql: str, name: str) -> str:
    m = re.search(rf"FUNCTION\s+public\.{name}\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada na migration 061"
    return m.group(1)


def _func_def(sql: str, name: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{name}\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada na migration 061"
    return m.group(0)


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("061_")


def test_funcao_auto_advance_declarada_com_assinatura_esperada():
    decl = _func_def(_load(), "station_auto_advance")
    # Assinatura do contrato: p_workspace, p_current_snapshot_track_id,
    # p_idempotency_key, p_request_hash, p_expected_sequence.
    assert "public.station_auto_advance( p_workspace uuid, p_current_snapshot_track_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL )" in decl
    assert "RETURNS jsonb" in decl
    assert "VOLATILE" in decl
    assert "SECURITY DEFINER" in decl
    assert "SET search_path = public" in decl


def test_nao_chama_station_begin_mutation():
    # O gate de begin_mutation (tv_can_manage_workspace) exige auth.uid();
    # service_role roda com uid NULL. O shim é service_role-only: a autorização
    # viva está no endpoint Flask (workspace resolvido do vínculo de device).
    body = _func_body(_load(), "station_auto_advance")
    assert "public.station_begin_mutation" not in body
    assert "station_begin_mutation" not in body
    # Sem gates de usuário no corpo (não são a autoridade do auto-advance).
    assert "can_access_tv_workspace" not in body
    assert "tv_can_manage_workspace" not in body


def test_idempotencia_calculada_no_shim():
    body = _func_body(_load(), "station_auto_advance")
    # Chave determinística a partir do ESTADO (não do caller).
    assert "v_key := 'auto-next:'" in body
    assert "state_sequence::text" in body
    # hash via SHA-256 nativa (sem pgcrypto) do concat canônico.
    assert "sha256(" in body
    assert "encode(" in body
    assert "convert_to(" in body
    assert "'auto-next'" in body


def test_key_hash_nao_usam_argumentos_do_caller():
    body = _func_body(_load(), "station_auto_advance")
    # O chamador não tem como controlar chave/hash de idempotência.
    assert "p_idempotency_key" not in body
    assert "p_request_hash" not in body


def test_concorrencia_e_expected_sequence():
    body = _func_body(_load(), "station_auto_advance")
    assert "pg_advisory_xact_lock" in body
    assert "'tv_station:' || p_workspace::text" in body
    assert "state_sequence <> p_expected_sequence" in body
    assert "SEQUENCE_CONFLICT" in body
    assert "ERRCODE = '40900'" in body
    assert "ensure_station_row" in body


def test_estado_nao_tocando_e_guarda_de_corrida():
    body = _func_body(_load(), "station_auto_advance")
    assert "v_st.state <> 'playing'" in body
    assert "NOT_PLAYING" in body
    assert "TRACK_MISMATCH" in body
    assert "current_snapshot_track_id <> p_current_snapshot_track_id" in body
    assert "NO_CURRENT_TRACK" in body


def test_validacao_de_duracao_e_tempo_decorrido():
    body = _func_body(_load(), "station_auto_advance")
    assert "EXTRACT(EPOCH FROM (now() - v_st.started_at))" in body
    assert "duration_seconds" in body
    assert "NOT_ELAPSED" in body
    assert "DURATION_UNKNOWN" in body
    assert "UNKNOWN_STARTED_AT" in body


def test_transicao_identica_ao_kernel_039():
    body = _func_body(_load(), "station_auto_advance")
    # Próxima faixa: relative_track(+1) + transição playing (started_at=now).
    assert "public.relative_track(p_workspace, 1)" in body
    assert "state = 'playing'" in body
    assert "started_at = now()" in body
    assert "state_sequence = state_sequence + 1" in body
    # Sem próxima (última/empty): stop espelha station_next.
    assert "state='stopped'" in body
    assert "current_snapshot_track_id = NULL" in body
    assert "started_at = NULL" in body
    # Resultado + registro de idempotência.
    assert "public.station_mutation_result(p_workspace)" in body
    assert "public.station_record_idempotency" in body
    assert "public.station_try_replay" in body
    assert "'replayed'" in body
    assert "'applied'" in body


def test_acesso_somente_service_role():
    sql = _load()
    assert "REVOKE ALL ON FUNCTION public.station_auto_advance" in sql
    assert "FROM anon" in sql
    assert "FROM authenticated" in sql
    assert "FROM PUBLIC" in sql
    assert "GRANT EXECUTE ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) TO service_role" in sql


def test_sem_sql_dinamico_nem_pgcrypto():
    sql = _load()
    assert "EXECUTE FORMAT" not in sql.upper()
    assert "EXECUTE IMMEDIATE" not in sql.upper()
    assert "EXCEPTION WHEN" not in sql.upper()
    assert "pgcrypto" not in sql.lower()


def test_sem_tabelas_ou_policies_novas():
    sql = _load()
    assert "CREATE TABLE" not in sql.upper()
    assert "CREATE POLICY" not in sql.upper()


def test_nao_regrava_039():
    sql = _load()
    for extra in (
        "station_play",
        "station_next",
        "station_previous",
        "station_stop",
        "station_seek",
        "station_pause",
        "station_resume",
        "station_track_change",
        "materialize_station_snapshot",
        "relative_track",
    ):
        assert f"CREATE OR REPLACE FUNCTION public.{extra}(" not in sql, f"{extra} não deveria ser recriado na 061"