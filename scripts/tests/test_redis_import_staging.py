"""Integração REAL do importador no Supabase STAGING (opt-in).

Não usa Redis nem credenciais de produção. O snapshot é sintético, criado com
UUIDs aleatórios, e todo dado é removido ao final. A aplicação só acontece se
o ref passar pela mesma barreira fail-closed do importador.
"""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1]
for _path in (str(_SCRIPTS), str(_SCRIPTS / "migrate")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from migrate import redis_contract as contract  # noqa: E402
from migrate import redis_import as importer  # noqa: E402
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
    if not _REF_RE.fullmatch(ref) or ref != importer.STAGING_REF or ref not in _ALLOWED_REFS:
        pytest.fail("ref de Staging divergente; nenhuma requisição feita")
    if not token:
        pytest.fail("token de Staging ausente; nenhuma requisição feita")
    return ManagementAPI(project_ref=ref, access_token=token)


def _lit(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return "E'" + text + "'"


def _q(pg, sql):
    return pg.query(sql) or []


def _scalar(pg, sql):
    rows = _q(pg, sql)
    return next(iter(rows[0].values())) if rows else None


def _fixture_rows(pg, workspace: str, ticket: str) -> None:
    _q(pg, f"""
        INSERT INTO public.workspaces (id, name, slug)
        VALUES ({_lit(workspace)}, 'Redis Import Test', {_lit('redis-import-' + workspace)})
    """)
    _q(pg, f"""
        INSERT INTO public.chamados_tickets (id, workspace_id, "roomName", status)
        VALUES ({_lit(ticket)}, {_lit(workspace)}, 'Redis import test', 'aberto')
    """)


def _cleanup(pg, *, workspace: str, ticket: str, endpoints: list[str], dedup_keys: list[str]) -> None:
    for endpoint in endpoints:
        _q(pg, f"DELETE FROM public.push_subscriptions WHERE endpoint = {_lit(endpoint)}")
    for key in dedup_keys:
        _q(pg, f"DELETE FROM public.push_dedup_marks WHERE key = {_lit(key)}")
    _q(pg, f"DELETE FROM public.chamado_push_subscriptions WHERE ticket_id = {_lit(ticket)}")
    _q(pg, f"DELETE FROM public.chamado_reminder_sent_marks WHERE ticket_id = {_lit(ticket)}")
    _q(pg, f"DELETE FROM public.chamado_reminder_states WHERE ticket_id = {_lit(ticket)}")
    _q(pg, f"DELETE FROM public.chamados_tickets WHERE id = {_lit(ticket)}")
    _q(pg, f"DELETE FROM public.workspaces WHERE id = {_lit(workspace)}")


def _snapshot(workspace: str, ticket: str) -> contract.Snapshot:
    suffix = uuid.uuid4().hex[:12]
    endpoint = f"https://push.example.invalid/staging/{suffix}"
    chamado_endpoint = f"https://push.example.invalid/staging-chamado/{suffix}"
    token = uuid.uuid4().hex  # 32 hex: formato canônico do contrato de dedup
    identity = uuid.uuid4().hex[:16]
    cycle_id = "cycle-" + suffix
    dedup_key = f"push:sent:{suffix}:{identity}"
    legacy_key = f"push:sent:legacy-{suffix}"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    snap = contract.Snapshot()
    snap.generated_at = now
    snap.add("reminder_states", {
        "ticket_id": ticket,
        "workspace_id": workspace,
        "cycle_id": cycle_id,
        "reminder_count": 3,
        "last_reminder_at": now,
        "last_known_status": "aberto",
        "transition_generation": 4,
        "ttl_seconds": 604800,
    })
    snap.add("reminder_marks", {
        "ticket_id": ticket,
        "cycle_id": cycle_id,
        "wave": 3,
        "identity": identity,
        "ttl_seconds": 604800,
    })
    snap.add("push_subscriptions", {
        "payload": {
            "key": uuid.uuid4().hex + uuid.uuid4().hex,
            "endpoint": endpoint,
            "expirationTime": None,
            "keys": {"p256dh": "staging-p", "auth": "staging-a"},
        },
        "ttl_seconds": -1,
    })
    snap.add("chamado_push_subscriptions", {
        "ticket_id": ticket,
        "payload": {
            "key": uuid.uuid4().hex + uuid.uuid4().hex,
            "endpoint": chamado_endpoint,
            "expirationTime": None,
            "keys": {"p256dh": "staging-chamado-p", "auth": "staging-chamado-a"},
        },
        "ttl_seconds": 600,
    })
    snap.add("push_dedup_marks", {
        "key": dedup_key,
        "state": "accepted",
        "token": token,
        "ttl_seconds": 7200,
    })
    snap.add("push_dedup_marks", {
        "key": legacy_key,
        "state": "attempted",
        "token": None,
        "ttl_seconds": 7200,
    })
    snap.add("reminder_locks_ignored", {"ticket_id": ticket, "ttl_seconds": 120})
    return snap


def test_import_snapshot_no_staging(pg, tmp_path):
    workspace = str(uuid.uuid4())
    ticket = str(uuid.uuid4())
    snap = _snapshot(workspace, ticket)
    endpoints = [
        snap.records["push_subscriptions"][0]["payload"]["endpoint"],
        snap.records["chamado_push_subscriptions"][0]["payload"]["endpoint"],
    ]
    dedup_keys = [r["key"] for r in snap.records["push_dedup_marks"]]
    _fixture_rows(pg, workspace, ticket)

    artifact = tmp_path / "snapshot.json"
    artifact.write_text(json.dumps(snap.to_dict()), encoding="utf-8")
    os.chmod(artifact, 0o600)
    loaded = importer.load_snapshot(artifact)

    try:
        # Dry-run não escreve nada.
        dry = importer.import_snapshot(loaded, pg, apply=False, ref=importer.STAGING_REF)
        assert dry["applied"] is False
        assert _scalar(pg, f"SELECT count(*)::int FROM public.chamado_reminder_states WHERE ticket_id = {_lit(ticket)}") == 0

        report = importer.import_snapshot(loaded, pg, apply=True, ref=importer.STAGING_REF)
        assert report["applied"] is True
        assert report["inserted"]["reminder_states"] == 1
        assert report["inserted"]["reminder_marks"] == 1
        assert report["inserted"]["push_subscriptions"] == 1
        assert report["inserted"]["chamado_push_subscriptions"] == 1
        assert report["inserted"]["push_dedup_marks"] == 2

        state = _q(pg, f"""
            SELECT reminder_count, cycle_id, transition_generation,
                   lock_token, lock_expires_at, expires_at
            FROM public.chamado_reminder_states WHERE ticket_id = {_lit(ticket)}
        """)[0]
        assert state["reminder_count"] == 3
        assert state["cycle_id"] == snap.records["reminder_states"][0]["cycle_id"]
        assert state["transition_generation"] == 4
        assert state["lock_token"] is None
        assert state["lock_expires_at"] is None
        assert state["expires_at"] > datetime.now(timezone.utc)

        mark = _q(pg, f"""
            SELECT wave, identity FROM public.chamado_reminder_sent_marks
            WHERE ticket_id = {_lit(ticket)}
        """)[0]
        assert mark["wave"] == 3
        assert mark["identity"] == snap.records["reminder_marks"][0]["identity"]

        payload = _scalar(pg, f"""
            SELECT payload FROM public.push_subscriptions
            WHERE endpoint = {_lit(endpoints[0])}
        """)
        assert payload == snap.records["push_subscriptions"][0]["payload"]

        chamado_payload = _scalar(pg, f"""
            SELECT payload FROM public.chamado_push_subscriptions
            WHERE ticket_id = {_lit(ticket)} AND endpoint = {_lit(endpoints[1])}
        """)
        assert chamado_payload == snap.records["chamado_push_subscriptions"][0]["payload"]

        assert _scalar(pg, f"SELECT public.push_dedup_state({_lit(dedup_keys[0])})") == "accepted"
        assert _scalar(pg, f"SELECT public.push_dedup_state({_lit(dedup_keys[1])})") == "attempted"

        # Reimportação não duplica nada.
        again = importer.import_snapshot(loaded, pg, apply=True, ref=importer.STAGING_REF)
        assert again["applied"] is True
        assert all(v == 0 for v in again["inserted"].values())
        assert _scalar(pg, f"SELECT count(*)::int FROM public.chamado_reminder_states WHERE ticket_id = {_lit(ticket)}") == 1
    finally:
        _cleanup(pg, workspace=workspace, ticket=ticket, endpoints=endpoints, dedup_keys=dedup_keys)
