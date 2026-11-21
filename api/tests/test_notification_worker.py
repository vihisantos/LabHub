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
