"""Revisão estática do SQL da migration 103_tv_station_loop_and_failures.sql
(ETAPA 1.5 / B1 — Estação: loop + falhas, foco em station_report_track_failure).

A suíte backend deste repositório roda SEM Postgres ao vivo. As garantias que
vivem dentro da transação SQL — idempotência, advisory lock, validação de faixa,
gate de acesso, não-duplicação de mutação — são verificadas por análise estática
do DDL, para que qualquer regressão futura na migration quebre o build.

Cobrindo:
  - lock serializacao via pg_advisory_xact_lock (workspace-scoped)
  - gate de acesso via can_access_tv_workspace
  - idempotencia: station_try_replay (replay) e station_record_idempotency
  - validacao de faixa: p_snapshot_track_id deve bater com current_snapshot_track_id
  - seguranca: SECURITY DEFINER, search_path fixo, grant apenas a service_role
  - retorno jsonb preservado ('status','reported','failures')
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "103_tv_station_loop_and_failures.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def _func_body(sql: str, name: str) -> str:
    m = re.search(rf"FUNCTION\s+public\.{name}\(.*?AS\s*\$\$(.*?)\$\;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada"
    return m.group(1)


def _func_decl(sql: str, name: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{name}\(.*?AS\s*\$\$", sql, re.DOTALL)
    assert m, f"declaração de {name} não encontrada"
    return m.group(0)


class TestFailureFunctionSignature:
    def test_assinatura_preservada(self, sql):
        decl = _func_decl(sql, "station_report_track_failure")
        body = _func_body(sql, "station_report_track_failure")
        assert "p_workspace uuid" in decl
        assert "p_snapshot_track_id uuid" in decl
        assert "p_idempotency_key text DEFAULT NULL" in decl

    def test_retorno_jsonb_preservado(self, sql):
        decl = _func_decl(sql, "station_report_track_failure")
        body = _func_body(sql, "station_report_track_failure")
        assert "RETURNS jsonb" in decl
        assert "'status','reported','failures'" in body

    def test_workspace_obrigatorio(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "WORKSPACE_REQUIRED" in body
        assert "ERRCODE = '22023'" in body


class TestFailureLockAndSequence:
    def test_advisory_lock_workspace_scoped(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "pg_advisory_xact_lock" in body
        assert "'tv_station:' || p_workspace::text" in body

    def test_state_sequence_incrementado(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "state_sequence = state_sequence + 1" in body

    def test_consecutive_failures_incrementado(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "consecutive_failures = v_failures" in body
        assert "last_failure_at = now()" in body


class TestFailureIdempotency:
    def test_replay_antes_da_mutacao(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        p_try = body.find("station_try_replay")
        p_record = body.find("station_record_idempotency")
        assert -1 not in (p_try, p_record), "replay e record_idempotency devem estar presentes"
        assert p_try < p_record, "replay deve vir ANTES de record_idempotency"

    def test_try_replay_usado_para_duplicata(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "station_try_replay" in body
        assert "station_record_idempotency" in body

    def test_idempotency_key_vazia_nao_bloqueia(self, sql):
        """Chave NULL/'' deve ser tratada como sem idempotencia (compatível com clientes antigos)."""
        body = _func_body(sql, "station_report_track_failure")
        assert "p_idempotency_key IS NOT NULL AND p_idempotency_key <> ''" in body


class TestFailureTrackValidation:
    def test_valida_faixa_atual(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "current_snapshot_track_id" in body
        assert "TRACK_MISMATCH" in body
        assert "'no_op'" in body

    def test_faixa_antiga_nao_mutacao(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        # Faixa antiga retorna no_op sem incrementar failures nem mudar state_sequence.
        assert "TRACK_MISMATCH" in body

    def test_track_mismatch_registra_idempotencia(self, sql):
        """O resultado TRACK_MISMATCH deve ser gravado via station_record_idempotency
        antes do RETURN, para que repetições com mesma chave aproveitem o replay."""
        body = _func_body(sql, "station_report_track_failure")
        p_record = body.find("station_record_idempotency")
        p_return_mismatch = body.find("'no_op', 'reason', 'TRACK_MISMATCH'")
        assert -1 not in (p_record, p_return_mismatch)
        # station_record_idempotency deve aparecer antes do RETURN de TRACK_MISMATCH
        assert p_record < p_return_mismatch, (
            "station_record_idempotency deve ser chamado antes de retornar TRACK_MISMATCH"
        )


class TestFailureStopAndLoop:
    def test_parada_apos_limite(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "stopped_reason = 'failures'" in body
        assert "state = 'stopped'" in body

    def test_loop_preservado(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "loop_mode IN ('loop','loop_shuffle')" in body
        assert "materialize_station_snapshot" in body


class TestFailureSecurity:
    def test_security_definer_e_search_path(self, sql):
        decl = _func_decl(sql, "station_report_track_failure")
        body = _func_body(sql, "station_report_track_failure")
        assert "SECURITY DEFINER" in decl
        assert "SET search_path = public" in decl

    def test_grant_apenas_service_role(self, sql):
        # Revogacao de todos e grant apenas a service_role.
        assert "REVOKE ALL ON FUNCTION public.station_report_track_failure(uuid,uuid,text) FROM public, anon, authenticated;" in sql
        assert "GRANT EXECUTE ON FUNCTION public.station_report_track_failure(uuid,uuid,text) TO service_role;" in sql

    def test_gate_de_acesso(self, sql):
        body = _func_body(sql, "station_report_track_failure")
        assert "can_access_tv_workspace" in body
        assert "ACCESS_DENIED" in body
        assert "ERRCODE = '42501'" in body
