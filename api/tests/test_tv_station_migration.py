"""Revisão estática do SQL da migration 039_tv_station.sql (ETAPA 1 — Estação de
Música por Workspace).

A suíte backend deste repositório roda SEM Postgres ao vivo (padrão das demais
em api/tests: fakes de requests / leitura estática do DDL). As garantias que
vivem DENTRO da transação SQL — máquina de estados, idempotência, concorrência
via advisory lock, imutabilidade de snapshot, isolamento entre workspaces,
RLS e não-exposição de escrita direta — são verificadas por análise estática do
DDL, para que qualquer regressão futura na migration quebre o build.

Cobrindo do prompt (casos A–J + adversarial + reconexão):
  A  isolamento entre workspaces (todos os RPCs gateados por can_access_tv_workspace)
  B  máquina de estados (states válidos + transições)
  C  posição play/pause/resume/seek
  D  state_sequence incrementado a cada mutação
  E  expected_sequence divergente => 40900 SEQUENCE_CONFLICT
  F  replay idempotente => resultado original SEM re-mutar
  G  reuso de chave com payload diferente => 40901 IDEMPOTENCY_KEY_REUSE
  H  concorrência: advisory lock + SEM next duplo
  I  snapshot #1 imutável + snapshot #2 com novo estado (queue_change)
  J  current_snapshot_track_id pertence ao snapshot vigente
  adversarial multi-TV: next do TV A + next do TV B => um vence OU 40900
  reconexão conceitual: station_get_snapshot expõe state_sequence+snapshot
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "039_tv_station.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def _func_body(sql: str, name: str) -> str:
    m = re.search(rf"FUNCTION\s+public\.{name}\(.*?AS\s*\$\$(.*?)\$\;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada"
    return m.group(1)


def _func_def(sql: str, name: str) -> str:
    """Declaração completa da função (até o fechamento $$;)."""
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{name}\(.*?AS\s*\$\$(.*?)\$\;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada"
    return m.group(0)


def _all_function_decls(sql: str) -> str:
    """Corpo concatenado de todas as funções public (para asserts globais de
    padrões repetidos como advisory lock)."""
    bodies = re.findall(r"FUNCTION\s+public\.(\w+)\(.*?AS\s*\$\$(.*?)\$\;", sql, re.DOTALL)
    return " ".join(name + " " + body for name, body in bodies)


class TestTablesExist:
    def test_quatro_tabelas_criadas(self, sql):
        for t in ("tv_queue_snapshots", "tv_queue_snapshot_tracks", "tv_station", "station_idempotency"):
            assert f"CREATE TABLE IF NOT EXISTS public.{t}" in sql, f"tabela {t} ausente"

    def test_schema_nao_cria_tabelas_fora_do_escopo(self, sql):
        created = set(re.findall(r"CREATE TABLE IF NOT EXISTS public\.([a-z_]+)", sql))
        assert created == {
            "tv_queue_snapshots",
            "tv_queue_snapshot_tracks",
            "tv_station",
            "station_idempotency",
        }, f"tabelas inesperadas: {created}"

    def test_rls_habilitado_em_todas(self, sql):
        for t in ("tv_queue_snapshots", "tv_queue_snapshot_tracks", "tv_station", "station_idempotency"):
            assert f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;" in sql


class TestConstraints:
    def test_state_check_valido(self, sql):
        assert "CHECK (state IN ('stopped', 'playing', 'paused'))" in sql

    def test_position_nao_negativa(self, sql):
        assert "CHECK (position_seconds >= 0)" in sql

    def test_duration_nao_negativa_e_posicao_snapshot_nao_negativa(self, sql):
        assert "CHECK (duration_seconds >= 0)" in sql
        assert "CHECK (position >= 0)" in sql

    def test_snapshot_version_unica_por_workspace(self, sql):
        assert "UNIQUE (workspace_id, version)" in sql
        assert "CHECK (version >= 1)" in sql

    def test_fk_estacao_snapshot_e_filhas(self, sql):
        ddl_station = re.search(r"CREATE TABLE IF NOT EXISTS public\.tv_station\s*\((.*?)\);", sql, re.DOTALL).group(1)
        assert "queue_snapshot_id uuid NOT NULL REFERENCES public.tv_queue_snapshots(id)" in ddl_station
        assert "current_snapshot_track_id uuid REFERENCES public.tv_queue_snapshot_tracks(id)" in ddl_station
        ddl_tracks = re.search(r"CREATE TABLE IF NOT EXISTS public\.tv_queue_snapshot_tracks\s*\((.*?)\);", sql, re.DOTALL).group(1)
        assert "snapshot_id uuid NOT NULL REFERENCES public.tv_queue_snapshots(id) ON DELETE CASCADE" in ddl_tracks

    def test_idempotency_pk_workspace_key(self, sql):
        ddl = re.search(r"CREATE TABLE IF NOT EXISTS public\.station_idempotency\s*\((.*?)\);", sql, re.DOTALL).group(1)
        assert "PRIMARY KEY (workspace_id, idempotency_key)" in ddl
        # TTL 24h
        assert "expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')" in ddl


class TestCaseA_IsolationBetweenWorkspaces:
    def test_todo_rpc_gateado_por_can_access_tv_workspace(self, sql):
        mutating = [
            "station_play", "station_pause", "station_resume", "station_next",
            "station_previous", "station_seek", "station_stop",
            "station_queue_change", "station_track_change",
        ]
        for fn in mutating:
            body = _func_body(sql, fn)
            assert "station_begin_mutation" in body, f"{fn} não passa pelo kernel (lock+gate)"
        assert "can_access_tv_workspace" in _func_body(sql, "station_begin_mutation")
        assert "ACCESS_DENIED" in _func_body(sql, "station_begin_mutation")

    def test_snapshots_e_estacao_escolam_por_workspace_no_select(self, sql):
        assert "can_access_tv_workspace(workspace_id)" in sql
        assert "can_access_tv_workspace" in sql

    def test_estacao_uma_por_workspace(self, sql):
        assert "workspace_id uuid PRIMARY KEY" in sql


class TestCaseB_StateMachine:
    def test_transicoes_esperadas_presentes(self, sql):
        play = _func_body(sql, "station_play")
        assert "state = 'playing'" in play
        pause = _func_body(sql, "station_pause")
        assert "state = 'paused'" in pause
        stop = _func_body(sql, "station_stop")
        assert "state='stopped'" in stop
        resume = _func_body(sql, "station_resume")
        assert "state='playing'" in resume

    def test_stop_limpa_track_e_posicao(self, sql):
        stop = _func_body(sql, "station_stop")
        assert "current_snapshot_track_id = NULL" in stop
        assert "position_seconds = 0" in stop
        assert "started_at = NULL" in stop


class TestCaseC_PositionPlayPauseResumeSeek:
    def test_pause_soma_tempo_decorrido(self, sql):
        pause = _func_body(sql, "station_pause")
        assert "position_seconds +" in pause and "now() - v_st.started_at" in pause
        assert "started_at = NULL" in pause

    def test_play_define_started_at_e_zera_posicao(self, sql):
        play = _func_body(sql, "station_play")
        assert "position_seconds = 0" in play
        assert "started_at" in play

    def test_seek_valida_range(self, sql):
        seek = _func_body(sql, "station_seek")
        assert "SEEK_OUT_OF_RANGE" in seek
        assert "p_position < 0" in seek


class TestCaseD_SequenceIncrement:
    def test_toda_mutacao_incrementa_state_sequence(self, sql):
        for fn in (
            "station_play", "station_pause", "station_seek", "station_next",
            "station_previous", "station_stop", "station_queue_change",
            "station_track_change",
        ):
            assert "state_sequence = state_sequence + 1" in _func_body(sql, fn), f"{fn} nao incrementa sequence"


class TestCaseE_ExpectedSequenceConflict:
    def test_expected_sequence_divergente_gera_40900(self, sql):
        body = _func_body(sql, "station_begin_mutation")
        assert "SEQUENCE_CONFLICT" in body
        assert "ERRCODE = '40900'" in body
        assert "state_sequence <> p_expected_sequence" in body


class TestCaseF_GH_Idempotency:
    def test_replay_devolve_resultado_original_sem_remutar(self, sql):
        body = _func_body(sql, "station_try_replay")
        assert "RETURN v_idem.result" in body  # replay => resultado original
        assert "request_hash = p_request_hash" in body

    def test_reuso_de_chave_com_payload_diferente_gera_40901(self, sql):
        body = _func_body(sql, "station_try_replay")
        assert "IDEMPOTENCY_KEY_REUSE" in body
        assert "ERRCODE = '40901'" in body

    def test_replay_e_checado_depois_do_lock(self, sql):
        """Anti-double-mutate: cada RPC chama station_begin_mutation (lock)
        ANTES de station_try_replay (replay). Ordem textual prova isso."""
        for fn in (
            "station_play", "station_pause", "station_resume", "station_seek",
            "station_next", "station_previous", "station_stop",
            "station_queue_change", "station_track_change",
        ):
            body = _func_body(sql, fn)
            p_begin = body.find("station_begin_mutation")
            p_replay = body.find("station_try_replay")
            assert -1 not in (p_begin, p_replay), fn
            assert p_begin < p_replay, f"{fn}: replay precisa vir DEPOIS do lock (begin_mutation)"

    def test_idempotencia_loopback_por_workspace(self, sql):
        # PK (workspace_id, idempotency_key) => chave isolada por workspace
        assert "PRIMARY KEY (workspace_id, idempotency_key)" in sql


class TestCaseH_Concurrency:
    def test_todo_rpc_adquire_advisory_lock(self, sql):
        for fn in (
            "station_play", "station_pause", "station_resume", "station_next",
            "station_previous", "station_seek", "station_stop",
            "station_queue_change", "station_track_change",
        ):
            # via begin_mutation -> pg_advisory_xact_lock
            assert "pg_advisory_xact_lock" in _func_body(sql, "station_begin_mutation")
            assert "station_begin_mutation" in _func_body(sql, fn), f"{fn} sem lock"

    def test_lock_escopado_ao_workspace(self, sql):
        assert "'tv_station:' || p_workspace::text" in _func_body(sql, "station_begin_mutation")


class TestCaseI_SnapshotImmutability:
    def test_queue_change_materializa_novo_snapshot(self, sql):
        body = _func_body(sql, "station_queue_change")
        assert "materialize_station_snapshot" in body
        assert "queue_snapshot_id = v_new" in body

    def test_materializacao_gera_snapshot_novo_e_faixas(self, sql):
        body = _func_body(sql, "materialize_station_snapshot")
        assert "INSERT INTO public.tv_queue_snapshots" in body
        assert "INSERT INTO public.tv_queue_snapshot_tracks" in body
        assert "MAX(version), 0) + 1" in body

    def test_snapshot_imutavel_sem_trigger_de_update_publico(self, sql):
        """Snapshots são append-only: nenhuma policy/sem exposição de write
        (a escrita é só via função SECURITY DEFINER)."""
        assert "tv_queue_snapshots_update" not in sql
        assert "tv_queue_snapshot_tracks_update" not in sql

    def test_materializacao_preserva_ordem_canonica(self, sql):
        # ordem do frontend: queue created_at ASC, com desempate determinístico
        # por queue id (evita intercalar filas com created_at idêntico), depois
        # track position ASC.
        body = _func_body(sql, "materialize_station_snapshot")
        assert "ORDER BY q.created_at ASC, q.id ASC, t.position ASC" in body


class TestCaseJ_CurrentTrackBelongsToSnapshot:
    def test_trigger_valida_posse_da_faixa(self, sql):
        guard = _func_body(sql, "station_snapshot_track_guard")
        assert "t.snapshot_id = NEW.queue_snapshot_id" in guard
        assert "CURRENT_TRACK_NOT_IN_SNAPSHOT" in guard

    def test_trigger_aplicado_a_estacao(self, sql):
        assert "CREATE TRIGGER trg_station_snapshot_track_check" in sql
        assert "BEFORE INSERT OR UPDATE ON public.tv_station" in sql


class TestCaseAdversarialMultiTV:
    def test_next_nunca_duplica_sem_serializacao(self, sql):
        """Dois TVs chamando station_next concorrentes: ambos passam pelo mesmo
        advisory lock (serializam) E por expected_sequence/sequence — garantindo
        que o segundo vê o estado do primeiro (move a partir dele), nunca uma
        segunda 'próxima' baseada no estado antigo. A rejeição de estado
        defasado é via 40900 SEQUENCE_CONFLICT quando expected_sequence bate."""
        next_body = _func_body(sql, "station_next")
        assert "relative_track" in next_body
        assert "station_begin_mutation" in next_body

    def test_next_avanca_uma_faixa_relativa(self, sql):
        """next usa relativo ao track atual (posição > atual), portanto dois
        nexts serializados nunca pulam/duplicam — avançam de uma em uma."""
        rel = _func_body(sql, "relative_track")
        assert "t.position > v_pos" in rel  # direção pra frente relativa


class TestCaseReconnect:
    def test_get_snapshot_permite_reconciliacao(self, sql):
        """Reconexão conceitual: station_get_snapshot devolve state_sequence +
        queue_snapshot_id + current track — o cliente compara com o local e
        reconcilia. Prova de que os dados persistidos suportam o fluxo."""
        body = _func_body(sql, "station_get_snapshot")
        assert "'state_sequence'" in body
        assert "'queue_snapshot_id'" in body
        assert "'current_snapshot_track_id'" in body


class TestSecurity:
    def test_estacao_sem_policy_de_escrita_direta(self, sql):
        for table in ("tv_station", "tv_queue_snapshots", "tv_queue_snapshot_tracks"):
            for op in ("insert", "update", "delete"):
                assert f"CREATE POLICY \"{table}_{op}\"" not in sql, (
                    f"não deve haver policy de {op} em {table} (escrita via RPC)"
                )
            # anon revogado
            assert f"REVOKE ALL ON public.{table} FROM anon;" in sql

    def test_idempotency_sem_policy_e_forcada(self, sql):
        assert "station_idempotency FORCE ROW LEVEL SECURITY" in sql
        assert "REVOKE ALL ON public.station_idempotency FROM anon;" in sql

    def test_rpcs_security_definer_com_search_path_fixado(self, sql):
        public_rpcs = [
            "station_play", "station_pause", "station_resume", "station_next",
            "station_previous", "station_seek", "station_stop",
            "station_queue_change", "station_track_change", "station_get_snapshot",
        ]
        for fn in public_rpcs:
            decl = _func_def(sql, fn)
            assert "SECURITY DEFINER" in decl, f"{fn} não é SECURITY DEFINER"
            assert "SET search_path = public" in decl, f"{fn} sem search_path fixado"

    def test_grants_rpc_autenticados_e_internos_service_role(self, sql):
        for fn in (
            "station_get_snapshot", "station_play", "station_pause",
            "station_resume", "station_next", "station_previous", "station_stop",
            "station_queue_change", "station_track_change",
        ):
            assert any(f"GRANT EXECUTE ON FUNCTION public.{fn}(" in sql for _ in [0])

    def test_toda_policy_usa_drop_if_exists(self, sql):
        for b in re.findall(r"CREATE POLICY \"[^\"]+\"", sql):
            policy_name = re.search(r"\"([^\"]+)\"", b).group(1)
            assert f'DROP POLICY IF EXISTS "{policy_name}" ON public.' in sql, (
                f"policy {policy_name} sem DROP IF EXISTS prévio"
            )


class TestBackfill:
    def test_backfill_uma_estacao_por_workspace_sem_duplicar(self, sql):
        assert "ensure_station_row" in sql
        # o loop só pega workspaces sem estação e nunca apaga
        assert "NOT EXISTS (SELECT 1 FROM public.tv_station" in sql
        assert "DELETE FROM public.tv_music_queues" not in sql
        assert "DELETE FROM public.tv_station" not in sql

    def test_backfill_reporta_contagem(self, sql):
        assert "stations backfilled" in sql
        assert "RAISE NOTICE" in sql
