"""Revisão estática da migration 060_tv_station_rbac_hardening.sql.

A suíte backend roda SEM Postgres ao vivo (padrão api/tests: leitura estática
do DDL). Esta migration é o hardening de autorização do Station pós-auditoria
2.2-A, em duas frentes:

  SNAP-1  `station_get_snapshot` passa a ter gate explícito
          `can_access_tv_workspace` (SECURITY DEFINER ignora a policy RLS).
  RBAC-1  `station_begin_mutation` passa a exigir `tv_can_manage_workspace`
          (nível FULL, 059) em vez de `can_access_tv_workspace` (read/device).

Garantias estruturais verificadas aqui (no corpo da migration 060):
  - get_snapshot: SECURITY DEFINER + search_path fixo + gate can_access +
    ACCESS_DENIED ANTES de ensure_station_row (não vaza/efeito cross-workspace).
  - begin_mutation: passa a usar tv_can_manage_workspace (NÃO can_access), e
    PRESERVA advisory lock + expected_sequence/SEQUENCE_CONFLICT (idempotência
    e concorrência intactas).
  - station_try_replay NÃO é recriado (semântica de replay preservada).
  - Nenhuma tabela/policy nova; sem SQL dinâmico (EXECUTE FORMAT / EXCEPTION).
"""

import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "060_tv_station_rbac_hardening.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _load() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def _func_body(sql: str, name: str) -> str:
    m = re.search(rf"FUNCTION\s+public\.{name}\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada na migration 060"
    return m.group(1)


def _func_def(sql: str, name: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{name}\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada na migration 060"
    return m.group(0)


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("060_")


def test_snap1_get_snapshot_gate_can_access():
    body = _func_body(_load(), "station_get_snapshot")
    assert "public.can_access_tv_workspace(p_workspace)" in body
    assert "ACCESS_DENIED" in body
    # Gate ANTES de qualquer efeito (ensure_station_row só depois da negação).
    assert body.find("can_access_tv_workspace") < body.find("ensure_station_row")


def test_snap1_get_snapshot_ainda_retorna_estado_completo():
    body = _func_body(_load(), "station_get_snapshot")
    assert "'state_sequence'" in body
    assert "'queue_snapshot_id'" in body
    assert "'current_snapshot_track_id'" in body


def test_rbac1_begin_mutation_exige_full_nao_read():
    body = _func_body(_load(), "station_begin_mutation")
    assert "public.tv_can_manage_workspace(p_workspace)" in body
    # Não pode continuar autorizando por membership/read/device (o gate antigo
    # usava public.can_access_tv_workspace; eventual menção em comentário não
    # conta como gate).
    assert "public.can_access_tv_workspace" not in body
    assert "ACCESS_DENIED" in body


def test_idempotencia_e_concorrencia_preservadas():
    body = _func_body(_load(), "station_begin_mutation")
    # advisory lock por workspace permanece
    assert "pg_advisory_xact_lock" in body
    assert "'tv_station:' || p_workspace::text" in body
    # expected_sequence / SEQUENCE_CONFLICT permanecem
    assert "state_sequence <> p_expected_sequence" in body
    assert "SEQUENCE_CONFLICT" in body
    assert "ERRCODE = '40900'" in body
    # ensure_station_row (backfill lazy) preservado
    assert "ensure_station_row" in body


def test_replay_nao_recriado():
    sql = _load()
    # A semântica de idempotência (station_try_replay) não é REESCRITA aqui
    # (não há CREATE OR REPLACE FUNCTION dessa função na migration).
    assert "CREATE OR REPLACE FUNCTION public.station_try_replay" not in sql


def test_security_definer_e_search_path():
    for fn in ("station_get_snapshot", "station_begin_mutation"):
        decl = _func_def(_load(), fn)
        assert "SECURITY DEFINER" in decl, f"{fn} não é SECURITY DEFINER"
        assert "SET search_path = public" in decl, f"{fn} sem search_path fixado"


def test_sem_sql_dinamico_nem_exception():
    sql = _load()
    assert "EXECUTE FORMAT" not in sql.upper()
    assert "EXECUTE IMMEDIATE" not in sql.upper()
    # RAISE EXCEPTION tradicional é aceitável; o que não pode haver é bloco de
    # tratamento dinâmico (EXCEPTION WHEN ...) que engula erros de autorização.
    assert "EXCEPTION WHEN" not in sql.upper()


def test_sem_tabelas_ou_policies_novas():
    sql = _load()
    assert "CREATE TABLE" not in sql.upper()
    # Nenhuma policy nova (autorização continua por gate interno, não RLS).
    assert "CREATE POLICY" not in sql.upper()


def test_nao_regrava_039():
    # A migration de hardening é incremental e não reescreve o restante do
    # Station: apenas as duas funções alvo.
    sql = _load()
    for extra in ("station_play", "station_next", "station_stop", "materialize_station_snapshot"):
        assert f"FUNCTION public.{extra}(" not in sql, f"{extra} não deveria ser recriado na 060"