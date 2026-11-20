"""Integração REAL com PostgreSQL/Supabase Staging (opt-in).

Este arquivo NÃO usa Redis, Lua, fakeredis nem qualquer simulador: todas as
opções passam por `SELECT public.<rpc>(...)` na Management API do projeto
autorizado. Só roda quando `LABHUB_TEST_SUPABASE_STAGING=1` está definido —
ou seja, é executado pelo workflow `staging-reminders-integration.yml` com os
secrets de Staging, nunca pela suíte local.

Toda fixture usa UUIDs aleatórios e é removida em `finally`. Nenhum dado de
produção é lido ou escrito: o ref é validado contra um allowlist explícito
antes do primeiro request.
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from migrate.api import ManagementAPI  # noqa: E402

_ALLOWED_REFS = frozenset(
    r.strip() for r in os.environ.get(
        "SUPABASE_STAGING_ALLOWED_PROJECT_REFS", "pgmetdqsdjotdcifjivu"
    ).split(",") if r.strip()
)
_REF_RE = re.compile(r"^[a-z0-9]{20}$")

pytestmark = pytest.mark.skipif(
    os.environ.get("LABHUB_TEST_SUPABASE_STAGING") != "1",
    reason="integração real com Staging é opt-in",
)


@pytest.fixture(scope="module")
def pg():
    ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "").strip()
    token = os.environ.get("SUPABASE_STAGING_ACCESS_TOKEN", "").strip()
    if not _REF_RE.match(ref):
        pytest.fail("SUPABASE_STAGING_PROJECT_REF inválido; nenhuma requisição feita")
    if ref not in _ALLOWED_REFS:
        pytest.fail("SUPABASE_STAGING_PROJECT_REF não autorizado; nenhuma requisição feita")
    if not token:
        pytest.fail("SUPABASE_STAGING_ACCESS_TOKEN ausente; nenhuma requisição feita")
    return ManagementAPI(project_ref=ref, access_token=token)


def _sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _q(pg, sql: str):
    return pg.query(sql) or []


def _scalar(pg, sql: str):
    rows = _q(pg, sql)
    if not rows:
        return None
    return next(iter(rows[0].values()))


@pytest.fixture
def tickets(pg):
    workspace = str(uuid.uuid4())
    ticket_a = str(uuid.uuid4())
    ticket_b = str(uuid.uuid4())
    _q(pg, f"""
        INSERT INTO public.workspaces (id, name, slug)
        VALUES ({_sql_literal(workspace)}, 'Reminder PG Test', {_sql_literal('reminder-pg-' + workspace)});
    """)
    for ticket in (ticket_a, ticket_b):
        _q(pg, f"""
            INSERT INTO public.chamados_tickets (id, workspace_id, "roomName", status)
            VALUES ({_sql_literal(ticket)}, {_sql_literal(workspace)}, 'PG test', 'aberto');
        """)
    try:
        yield workspace, ticket_a, ticket_b
    finally:
        for table in (
            "public.chamado_push_subscriptions",
            "public.chamado_reminder_sent_marks",
            "public.chamado_reminder_states",
        ):
            _q(pg, f"DELETE FROM {table} WHERE ticket_id IN ({_sql_literal(ticket_a)}, {_sql_literal(ticket_b)});")
        _q(pg, f"DELETE FROM public.chamados_tickets WHERE id IN ({_sql_literal(ticket_a)}, {_sql_literal(ticket_b)});")
        _q(pg, f"DELETE FROM public.workspaces WHERE id = {_sql_literal(workspace)};")


def _acquire(pg, ticket, workspace, token, seconds=120):
    return _scalar(pg, f"""
        SELECT public.chamado_reminder_acquire(
          {_sql_literal(ticket)}::uuid, {_sql_literal(workspace)}::uuid,
          {_sql_literal(token)}::uuid, {seconds});
    """)


def _write(pg, ticket, token, generation, count, status="aberto", cycle="ciclo-1",
           terminal=False):
    state = (
        '{"reminder_count": %d, "cycle_id": "%s", "last_reminder_at": '
        '"2026-01-01T00:00:00.000000Z", "last_known_status": "%s", '
        '"transition_generation": %d}'
    ) % (count, cycle, status, generation)
    return _scalar(pg, f"""
        SELECT public.chamado_reminder_write(
          {_sql_literal(ticket)}::uuid, {_sql_literal(token)}::uuid,
          {generation}, {_sql_literal(state)}::jsonb, {_sql_literal(terminal)});
    """)


def test_lock_token_fencing_e_renovacao(pg, tickets):
    _workspace, ticket, _other = tickets
    owner = str(uuid.uuid4())
    intruder = str(uuid.uuid4())

    assert _acquire(pg, ticket, _workspace, owner) is True
    assert _acquire(pg, ticket, _workspace, intruder) is False

    assert _scalar(pg, f"""
        SELECT public.chamado_reminder_renew({_sql_literal(ticket)}::uuid,
          {_sql_literal(intruder)}::uuid, 120);
    """) is False
    assert _scalar(pg, f"""
        SELECT public.chamado_reminder_renew({_sql_literal(ticket)}::uuid,
          {_sql_literal(owner)}::uuid, 120);
    """) is True

    assert _scalar(pg, f"""
        SELECT public.chamado_reminder_release({_sql_literal(ticket)}::uuid,
          {_sql_literal(intruder)}::uuid);
    """) is False
    assert _scalar(pg, f"""
        SELECT public.chamado_reminder_release({_sql_literal(ticket)}::uuid,
          {_sql_literal(owner)}::uuid);
    """) is True
    assert _acquire(pg, ticket, _workspace, intruder) is True


def test_geracao_e_fencing_da_escrita_de_onda(pg, tickets):
    _workspace, ticket, _other = tickets
    token = str(uuid.uuid4())
    assert _acquire(pg, ticket, _workspace, token) is True

    envelope = _q(pg, f"""
        SELECT public.chamado_reminder_read({_sql_literal(ticket)}::uuid,
          {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_read"]
    assert envelope["ok"] is True
    assert envelope["state"] is None

    assert _write(pg, ticket, token, 0, 6) is True
    state = _q(pg, f"""
        SELECT public.chamado_reminder_read({_sql_literal(ticket)}::uuid,
          {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_read"]["state"]
    assert state["reminder_count"] == 6
    assert state["transition_generation"] == 0

    generation = _scalar(pg, f"""
        SELECT public.chamado_reminder_transition({_sql_literal(ticket)}::uuid, 'a_caminho');
    """)
    assert generation == 1

    # Worker antigo, com a geração lida antes da transição, não grava.
    assert _write(pg, ticket, token, 0, 7) is False
    assert _write(pg, ticket, token, 1, 7) is True

    stale = _q(pg, f"""
        SELECT public.chamado_reminder_read({_sql_literal(ticket)}::uuid,
          {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_read"]["state"]
    assert stale["reminder_count"] == 7
    assert stale["last_known_status"] == "aberto"


def test_transition_sem_onda_persistida_devolve_estado_inicial(pg, tickets):
    """Um terminal registrado antes do primeiro envio não é estado malformado.

    `chamado_reminder_transition()` grava `last_known_status` mas não
    `last_reminder_at`. A RPC deve continuar devolvendo `state: null` para que
    o worker trate o chamado como estado inicial (e use o histórico para
    detectar o terminal), em vez de descartar a leitura como corrompida.
    """
    _workspace, ticket, _other = tickets
    token = str(uuid.uuid4())
    assert _acquire(pg, ticket, _workspace, token) is True
    generation = _scalar(pg, f"""
        SELECT public.chamado_reminder_transition({_sql_literal(ticket)}::uuid, 'resolvido');
    """)
    assert generation == 1
    envelope = _q(pg, f"""
        SELECT public.chamado_reminder_read({_sql_literal(ticket)}::uuid,
          {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_read"]
    assert envelope["ok"] is True
    assert envelope["state"] is None


def test_marcas_por_onda_e_guarda_de_ciclo_terminal(pg, tickets):
    _workspace, ticket, _other = tickets
    token = str(uuid.uuid4())
    assert _acquire(pg, ticket, _workspace, token) is True
    assert _write(pg, ticket, token, 0, 1) is True

    assert _scalar(pg, f"""
        SELECT public.chamado_reminder_mark_sent({_sql_literal(ticket)}::uuid,
          'ciclo-1', 1, 'identity-a', {_sql_literal(token)}::uuid);
    """) is True
    marked = _q(pg, f"""
        SELECT public.chamado_reminder_is_marked({_sql_literal(ticket)}::uuid,
          'ciclo-1', 1, 'identity-a', {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_is_marked"]
    assert marked == {"ok": True, "marked": True}

    other = _q(pg, f"""
        SELECT public.chamado_reminder_is_marked({_sql_literal(ticket)}::uuid,
          'ciclo-1', 1, 'identity-b', {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_is_marked"]
    assert other["marked"] is False

    assert _write(pg, ticket, token, 0, 2, cycle="ciclo-2") is True
    _q(pg, f"""
        SELECT public.chamado_reminder_clear_marks({_sql_literal(ticket)}::uuid,
          'ciclo-1', 2, ARRAY['identity-a'], {_sql_literal(token)}::uuid);
    """)
    cleared = _q(pg, f"""
        SELECT public.chamado_reminder_is_marked({_sql_literal(ticket)}::uuid,
          'ciclo-1', 1, 'identity-a', {_sql_literal(token)}::uuid);
    """)[0]["chamado_reminder_is_marked"]
    assert cleared["marked"] is False

    terminal_gen = _scalar(pg, f"""
        SELECT public.chamado_reminder_transition({_sql_literal(ticket)}::uuid, 'fechado');
    """)
    assert terminal_gen == 1
    # Mesmo ciclo e status de entrada diferente: não pode reanimar o terminal.
    assert _write(pg, ticket, token, terminal_gen, 3, status="aberto",
                  cycle="ciclo-2", terminal=True) is False
    # Reabertura legítima troca o ciclo.
    assert _write(pg, ticket, token, terminal_gen, 3, status="aberto",
                  cycle="ciclo-3", terminal=True) is True


def test_leitura_fenciada_quando_lock_e_perdido(pg, tickets):
    _workspace, ticket, _other = tickets
    owner = str(uuid.uuid4())
    thief = str(uuid.uuid4())
    assert _acquire(pg, ticket, _workspace, owner) is True
    _q(pg, f"""
        UPDATE public.chamado_reminder_states
        SET lock_token = {_sql_literal(thief)}::uuid
        WHERE ticket_id = {_sql_literal(ticket)}::uuid;
    """)
    envelope = _q(pg, f"""
        SELECT public.chamado_reminder_read({_sql_literal(ticket)}::uuid,
          {_sql_literal(owner)}::uuid);
    """)[0]["chamado_reminder_read"]
    assert envelope == {"ok": False}
    assert _write(pg, ticket, owner, 0, 1) is False


def test_isolamento_por_chamado_e_workspace(pg, tickets):
    workspace_a, ticket_a, ticket_b = tickets
    workspace_b = str(uuid.uuid4())
    _q(pg, f"""
        INSERT INTO public.workspaces (id, name, slug)
        VALUES ({_sql_literal(workspace_b)}, 'Reminder PG Test B', {_sql_literal('reminder-pg-b-' + workspace_b)});
    """)
    _q(pg, f"""
        UPDATE public.chamados_tickets
        SET workspace_id = {_sql_literal(workspace_b)}::uuid
        WHERE id = {_sql_literal(ticket_b)}::uuid;
    """)
    try:
        token_a = str(uuid.uuid4())
        token_b = str(uuid.uuid4())
        assert _acquire(pg, ticket_a, workspace_a, token_a) is True
        assert _acquire(pg, ticket_b, workspace_b, token_b) is True

        assert _scalar(pg, f"""
            SELECT public.chamado_reminder_mark_sent({_sql_literal(ticket_a)}::uuid,
              'ciclo', 1, 'mesma-identidade', {_sql_literal(token_a)}::uuid);
        """) is True
        marked_b = _q(pg, f"""
            SELECT public.chamado_reminder_is_marked({_sql_literal(ticket_b)}::uuid,
              'ciclo', 1, 'mesma-identidade', {_sql_literal(token_b)}::uuid);
        """)[0]["chamado_reminder_is_marked"]
        assert marked_b["marked"] is False

        state_b = _q(pg, f"""
            SELECT workspace_id FROM public.chamado_reminder_states
            WHERE ticket_id = {_sql_literal(ticket_b)}::uuid;
        """)[0]["workspace_id"]
        assert state_b == workspace_b
    finally:
        _q(pg, f"""
            DELETE FROM public.chamado_reminder_states WHERE ticket_id = {_sql_literal(ticket_b)}::uuid;
        """)
        _q(pg, f"DELETE FROM public.workspaces WHERE id = {_sql_literal(workspace_b)}::uuid;")


def test_inscricoes_e_dedup_postgres(pg, tickets):
    _workspace, ticket, _other = tickets
    endpoint = "https://example.test/push/" + uuid.uuid4().hex
    payload = {"endpoint": endpoint, "keys": {"p256dh": "x", "auth": "y"}}
    _q(pg, f"""
        SELECT public.push_subs_save({_sql_literal(json.dumps(payload))}::jsonb);
    """)
    listed = _q(pg, "SELECT public.push_subs_list();")
    assert any(row["push_subs_list"].get("endpoint") == endpoint for row in listed)

    key = "push:sent:evt-integracao:" + uuid.uuid4().hex
    token_a = "token-" + uuid.uuid4().hex
    token_b = "token-" + uuid.uuid4().hex
    assert _scalar(pg, f"""
        SELECT public.push_dedup_reserve({_sql_literal(key)}, {_sql_literal(token_a)}, 300);
    """) is True
    assert _scalar(pg, f"""
        SELECT public.push_dedup_reserve({_sql_literal(key)}, {_sql_literal(token_b)}, 300);
    """) is False
    assert _scalar(pg, f"SELECT public.push_dedup_state({_sql_literal(key)});") == "reserved"
    assert _scalar(pg, f"""
        SELECT public.push_dedup_confirm({_sql_literal(key)}, {_sql_literal(token_b)});
    """) is False
    expires_before = _scalar(pg, f"""
        SELECT expires_at FROM public.push_dedup_marks WHERE key = {_sql_literal(key)};
    """)
    assert _scalar(pg, f"""
        SELECT public.push_dedup_confirm({_sql_literal(key)}, {_sql_literal(token_a)});
    """) is True
    expires_after = _scalar(pg, f"""
        SELECT expires_at FROM public.push_dedup_marks WHERE key = {_sql_literal(key)};
    """)
    assert expires_before == expires_after
    assert _scalar(pg, f"SELECT public.push_dedup_state({_sql_literal(key)});") == "accepted"
    assert _scalar(pg, f"""
        SELECT public.push_dedup_release({_sql_literal(key)}, {_sql_literal(token_a)});
    """) is False

    _q(pg, f"""
        SELECT public.chamado_subs_save({_sql_literal(ticket)}::uuid,
          {_sql_literal(json.dumps([payload]))}::jsonb);
    """)
    chamado_subs = _q(pg, f"SELECT public.chamado_subs_list({_sql_literal(ticket)}::uuid);")
    assert len(chamado_subs) == 1
    _q(pg, f"""
        SELECT public.chamado_subs_expire({_sql_literal(ticket)}::uuid, 0);
    """)
    assert _q(pg, f"SELECT public.chamado_subs_list({_sql_literal(ticket)}::uuid);") == []

    _q(pg, f"DELETE FROM public.push_dedup_marks WHERE key = {_sql_literal(key)};")
    _q(pg, f"SELECT public.push_subs_remove({_sql_literal(endpoint)});")
