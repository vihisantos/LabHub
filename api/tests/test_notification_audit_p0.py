"""Regressões P0 da auditoria de notificações (#528).

Não acessam Supabase, Redis, QStash ou enviam Push real.
"""
import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

ROOT = Path(__file__).resolve().parents[2]
RESERVALAB_API = ROOT / "src/apps/reservalab/api/app.py"
CHAMADOS_API = ROOT / "api/app.py"
MOVEMENT_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(scope="module")
def stock_module():
    key = "notification_audit_stock_api"
    spec = importlib.util.spec_from_file_location(key, RESERVALAB_API)
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def stock_client(stock_module, monkeypatch):
    import auth
    import rbac

    user = {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "status": "active",
        "is_super_admin": False,
    }
    monkeypatch.setattr(auth, "_verify_jwt", lambda token: {"sub": user["id"]})
    monkeypatch.setattr(auth, "_get_user_profile", lambda uid: user.copy())
    monkeypatch.setattr(auth, "_get_user_workspace_ids", lambda uid: ["ws-test"])
    monkeypatch.setattr(auth, "_user_in_workspace", lambda profile, ws: ws == "ws-test")
    monkeypatch.setattr(
        auth, "_get_workspace",
        lambda ws: {"id": ws, "disabled_apps": []},
    )
    monkeypatch.setattr(rbac, "rbac_can", lambda *args: True)
    monkeypatch.setattr(rbac, "record_rbac_audit", lambda **kwargs: None)
    monkeypatch.setattr(stock_module, "_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(stock_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    movement = {
        "id": MOVEMENT_ID,
        "workspace_id": "ws-test",
        "type": "emprestimo",
        "itemName": "Item confiável do banco",
        "borrowedBy": "Pessoa autorizada",
        "expectedReturnAt": "2026-11-25",
        "performedBy": "Técnico do banco",
        "deletedAt": None,
    }
    reply = Mock()
    reply.ok = True
    reply.json.return_value = [movement]
    received_queries = []
    def fake_get(url, **kwargs):
        received_queries.append((url, kwargs))
        return reply

    monkeypatch.setattr(stock_module.requests, "get", fake_get)
    enqueued = []
    monkeypatch.setattr(
        stock_module, "_queue_push_event",
        lambda *args, **kwargs: enqueued.append((args, kwargs)) or "queued",
    )
    return stock_module.app.test_client(), movement, reply, enqueued, received_queries


def post(client, path="/api/push/notify-loan", *, data=None, authorized=True):
    headers = {"Authorization": "Bearer test-token"} if authorized else {}
    return client.post(
        path, json=data if data is not None else {
            "workspace_id": "ws-test", "movement_id": MOVEMENT_ID,
        }, headers=headers,
    )


@pytest.mark.parametrize("path", ["/api/push/notify-loan", "/api/push/notify-return"])
def test_stock_requires_bearer(stock_client, path):
    client, _, _, enqueued, _ = stock_client
    assert post(client, path, authorized=False).status_code == 401
    assert not enqueued


def test_stock_rejects_missing_or_foreign_workspace(stock_client):
    client, _, _, enqueued, queries = stock_client
    assert post(client, data={"movement_id": MOVEMENT_ID}).status_code == 403
    assert post(client, data={
        "workspace_id": "ws-other", "movement_id": MOVEMENT_ID,
    }).status_code == 403
    assert not queries
    assert not enqueued


def test_stock_denies_missing_action(stock_client, monkeypatch):
    import rbac
    client, _, _, enqueued, queries = stock_client
    monkeypatch.setattr(rbac, "rbac_can", lambda *args: False)
    assert post(client).status_code == 403
    assert not queries
    assert not enqueued


def test_stock_does_not_accept_module_spoof_or_unpersisted_event(stock_client):
    client, _, _, enqueued, queries = stock_client
    assert post(client, data={
        "workspace_id": "ws-test", "movement_id": MOVEMENT_ID, "module": "chamados",
    }).status_code == 400
    assert post(client, data={
        "workspace_id": "ws-test", "itemName": "Forjado",
    }).status_code == 400
    assert not queries
    assert not enqueued


def test_stock_uses_persisted_workspace_and_content(stock_client):
    client, _, _, enqueued, queries = stock_client
    response = post(client, data={
        "workspace_id": "ws-test", "movement_id": MOVEMENT_ID,
        "module": "stock", "itemName": "FORJADO", "borrowedBy": "FORJADO",
    })
    assert response.status_code == 202
    assert response.get_json()["event_id"] == f"stock:loan:{MOVEMENT_ID}"
    assert len(enqueued) == 1
    args, kwargs = enqueued[0]
    assert args[0] == f"stock:loan:{MOVEMENT_ID}"
    assert "Item confiável do banco" in args[1]
    assert "FORJADO" not in " ".join(args[:3])
    assert kwargs["workspace_id"] == "ws-test"
    assert kwargs["module"] == "stock"
    assert kwargs["context"] == "stock-loan"
    assert queries[0][1]["params"]["workspace_id"] == "eq.ws-test"
    assert queries[0][1]["params"]["id"] == f"eq.{MOVEMENT_ID}"


def test_stock_rejects_wrong_type_removed_or_wrong_campus(stock_client):
    client, movement, reply, enqueued, _ = stock_client
    movement["type"] = "devolucao"
    assert post(client).status_code == 409
    movement["type"] = "emprestimo"
    movement["deletedAt"] = "2026-11-24T00:00:00Z"
    assert post(client).status_code == 409
    movement["deletedAt"] = None
    movement["workspace_id"] = "ws-other"
    assert post(client).status_code == 409
    movement["workspace_id"] = "ws-test"
    reply.json.return_value = []
    assert post(client).status_code == 404
    assert not enqueued


def test_stock_returns_retryable_error_on_read_or_enqueue_failure(stock_client, monkeypatch, stock_module):
    client, _, reply, enqueued, _ = stock_client
    reply.ok = False
    reply.status_code = 500
    assert post(client).status_code == 503
    reply.ok = True
    monkeypatch.setattr(stock_module, "_queue_push_event", lambda *a, **kw: None)
    assert post(client).status_code == 503
    assert not enqueued


def test_stock_return_uses_persisted_performer(stock_client):
    client, movement, _, enqueued, _ = stock_client
    movement["type"] = "devolucao"
    response = post(client, "/api/push/notify-return")
    assert response.status_code == 202
    args, kwargs = enqueued[0]
    assert args[0] == f"stock:return:{MOVEMENT_ID}"
    assert "Técnico do banco" in args[2]
    assert kwargs["workspace_id"] == "ws-test"


def test_claim_exclusion_reaches_outbox_and_actual_recipient_filter(monkeypatch):
    key = "notification_audit_chamados_api"
    spec = importlib.util.spec_from_file_location(key, CHAMADOS_API)
    api = importlib.util.module_from_spec(spec)
    sys.modules[key] = api
    spec.loader.exec_module(api)

    captures = []
    monkeypatch.setattr(
        api, "_queue_push_event",
        lambda *args, **kwargs: captures.append((args, kwargs)) or "queued",
    )
    monkeypatch.setattr(api, "_request_tick_for_chamados_event", lambda event: True)
    assert api._enqueue_push_event("evt-claim", {
        "title": "Aviso", "body": "Outro técnico assumiu",
        "module": "chamados", "workspace_id": "ws-test",
        "exclude_user_id": "tech-1", "context": "chamados-claimed",
    }) is True
    assert captures[0][1]["exclude_user_id"] == "tech-1"

    selected = []
    subs = [
        {"user": {"id": "tech-1"}},
        {"user": {"id": "tech-2"}},
    ]
    monkeypatch.setattr(api, "_target_subs", lambda **kwargs: subs)
    monkeypatch.setattr(api, "_push_notify_subs_dedup",
                        lambda recipients, *args, **kwargs: selected.extend(recipients) or (1, 0, 0, 0, 0))
    assert api._deliver_outbox_notification("evt-claim", {
        "module": "chamados", "workspace_id": "ws-test",
        "exclude_user_id": captures[0][1]["exclude_user_id"],
        "title": "Aviso", "body": "Outro técnico assumiu",
        "context": "chamados-claimed",
    }) is True
    assert selected == [subs[1]]
