import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"


@pytest.fixture(scope="session")
def worker_api_module():
    for name in ("root_api", "chamados_api"):
        existing = sys.modules.get(name)
        if existing is not None and Path(getattr(existing, "__file__", "")) == API_FILE:
            return existing
    spec = importlib.util.spec_from_file_location("chamados_api", API_FILE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["chamados_api"] = module
    spec.loader.exec_module(module)
    return module


def test_outbox_delivery_uses_server_side_targeting_and_dedup(worker_api_module, monkeypatch):
    super_admin = {"user": {"id": "admin-1", "is_super_admin": True}}
    regular = {"user": {"id": "user-1", "is_super_admin": False}}
    selected = []
    sent = []

    monkeypatch.setattr(worker_api_module, "_is_safe_url", lambda url: True)
    monkeypatch.setattr(
        worker_api_module, "_target_subs",
        lambda **kwargs: selected.extend([super_admin, regular]) or [super_admin, regular],
    )

    def send(subs, event_id, ttl, title, body, **kwargs):
        sent.append((subs, event_id, ttl, title, body, kwargs))
        return 1, 0, 0, 0, 0

    monkeypatch.setattr(worker_api_module, "_push_notify_subs_dedup", send)

    assert worker_api_module._deliver_outbox_notification("evt-1", {
        "title": "Aprovação",
        "body": "Conta liberada",
        "module": "chamados",
        "target_user_id": None,
        "target_role": None,
        "target_super_admin": True,
        "action_url": "/",
    }) is True

    assert len(sent) == 1
    assert sent[0][0] == [super_admin]
    assert sent[0][1:5] == ("evt-1", 86400, "Aprovação", "Conta liberada")
    assert sent[0][5]["context"] == "chamados"


def test_outbox_delivery_retries_unknown_push_result(worker_api_module, monkeypatch):
    monkeypatch.setattr(worker_api_module, "_is_safe_url", lambda url: True)
    monkeypatch.setattr(worker_api_module, "_target_subs", lambda **kwargs: [{"user": {"id": "u1"}}])
    monkeypatch.setattr(
        worker_api_module, "_push_notify_subs_dedup",
        lambda *args, **kwargs: (0, 0, 1, 0, 0),
    )

    with pytest.raises(RuntimeError, match="push inconclusivo"):
        worker_api_module._deliver_outbox_notification("evt-2", {
            "title": "Aviso", "body": "Teste", "action_url": "/",
        })


def test_notification_worker_route_runs_bounded_publish_and_consume(
    worker_api_module, monkeypatch,
):
    monkeypatch.setenv("CRON_SECRET", "test-worker-secret")
    monkeypatch.setattr(worker_api_module, "redis", object())
    monkeypatch.setattr(worker_api_module.pg_store, "is_configured", lambda: True)
    monkeypatch.setattr(worker_api_module.pg_store, "store", object())
    publish = Mock(return_value={"claimed": 2, "published": 2, "released": 0})
    process = Mock(return_value={"fetched": 2, "acked": 2, "delivered": 2})
    monkeypatch.setattr(worker_api_module, "publish_pending", publish)
    monkeypatch.setattr(worker_api_module, "process_pending", process)

    response = worker_api_module.app.test_client().post(
        "/api/notifications/worker",
        headers={"Authorization": "Bearer test-worker-secret"},
        json={"publish_limit": 2, "consume_limit": 3},
    )

    assert response.status_code == 200
    assert response.get_json()["published"]["published"] == 2
    assert response.get_json()["processed"]["delivered"] == 2
    publish.assert_called_once()
    process.assert_called_once()
    assert publish.call_args.kwargs["limit"] == 2
    assert process.call_args.kwargs["count"] == 3


def test_notification_worker_route_fails_closed_without_cron_secret(
    worker_api_module, monkeypatch,
):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    response = worker_api_module.app.test_client().post("/api/notifications/worker")
    assert response.status_code == 503


def test_auth_notification_targets_user_without_product_module_rbac(
    worker_api_module, monkeypatch,
):
    selected = []
    monkeypatch.setattr(worker_api_module, "_is_safe_url", lambda url: True)
    monkeypatch.setattr(
        worker_api_module, "_target_subs",
        lambda **kwargs: selected.append(kwargs) or [{"user": {"id": "user-1"}}],
    )
    monkeypatch.setattr(
        worker_api_module, "_push_notify_subs_dedup",
        lambda *args, **kwargs: (1, 0, 0, 0, 0),
    )

    assert worker_api_module._deliver_outbox_notification("evt-auth", {
        "title": "Conta aprovada",
        "body": "Acesso liberado",
        "module": "auth",
        "target_user_id": "user-1",
        "action_url": "/",
    }) is True
    assert selected[0]["module"] is None
    assert selected[0]["user_id"] == "user-1"


def test_chamados_producers_persist_outbox_without_synchronous_push(
    worker_api_module, monkeypatch,
):
    events = []
    monkeypatch.setattr(
        worker_api_module, "_enqueue_push_event",
        lambda event_id, payload: events.append((event_id, payload)) or True,
    )
    monkeypatch.setattr(
        worker_api_module, "_target_subs",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("producer queried subscribers")),
    )
    monkeypatch.setattr(
        worker_api_module, "push_notify",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("producer sent Push directly")),
    )

    ticket = {
        "id": "ticket-123", "ticketNumber": 123, "workspace_id": "ws-1",
        "status": "aberto", "updatedAt": "2026-11-20T12:00:00Z",
        "assignedToUserId": "tech-1", "reportedByUserId": "reporter-1",
        "roomName": "Lab 2", "problemCategory": "Computador",
    }
    worker_api_module._notify_new_ticket(ticket)
    worker_api_module._notify_ticket_assigned(ticket)
    worker_api_module._notify_ticket_claimed(ticket, "Técnico")

    assert len(events) == 4
    assert len({event_id for event_id, _ in events}) == 4
    assert events[0][1]["module"] == "chamados"
    assert events[1][1]["target_user_id"] == "tech-1"
    assert events[2][1]["target_user_id"] == "tech-1"
    assert events[3][1]["exclude_user_id"] == "tech-1"
    assert all(event_id.startswith("chamados:") for event_id, _ in events)


def test_chamados_event_id_is_stable_for_same_ticket_revision(worker_api_module):
    ticket = {
        "id": "ticket-123", "updatedAt": "2026-11-20T12:00:00Z",
        "status": "aberto",
    }
    first = worker_api_module._chamados_event_id("created", ticket)
    second = worker_api_module._chamados_event_id("created", ticket)
    assert first == second
    assert first.startswith("chamados:")
