"""Segurança, escopo e compatibilidade do cron assinado QStash.

Não cria mensagens reais nem altera ambientes: todos os workers são fakes.
"""
import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
TICK_BODY = b'{"job":"labhub-notifications","version":1}'
TICK_PATH = "/api/notifications/qstash/tick"


@pytest.fixture(scope="module")
def api_module():
    for name in ("root_api", "chamados_api"):
        existing = sys.modules.get(name)
        if existing is not None and Path(getattr(existing, "__file__", "")) == API_FILE:
            return existing
    spec = importlib.util.spec_from_file_location("chamados_api", API_FILE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["chamados_api"] = module
    spec.loader.exec_module(module)
    return module


def test_signed_tick_verifies_body_signature_and_fixed_destination(api_module, monkeypatch):
    import notification_tick as tick

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", "test-current")
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", "test-next")
    receiver = Mock()
    receiver.verify.return_value = None
    factory = Mock(return_value=receiver)

    assert tick.verify_signed_tick(TICK_BODY, "valid-jwt", receiver_factory=factory)
    factory.assert_called_once_with(
        current_signing_key="test-current",
        next_signing_key="test-next",
    )
    receiver.verify.assert_called_once_with(
        body=TICK_BODY.decode(),
        signature="valid-jwt",
        url="https://lab-hub-pi.vercel.app" + TICK_PATH,
    )


def test_signed_tick_fail_closed_for_invalid_signature_body_env_and_keys(api_module, monkeypatch):
    import notification_tick as tick

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", "test-current")
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", "test-next")
    receiver = Mock()
    receiver.verify.side_effect = ValueError("bad signature")
    factory = Mock(return_value=receiver)

    assert not tick.verify_signed_tick(TICK_BODY, "bad-jwt", receiver_factory=factory)
    assert not tick.verify_signed_tick(b'{"job":"other"}', "valid-jwt", receiver_factory=factory)
    assert not tick.verify_signed_tick(TICK_BODY, "", receiver_factory=factory)

    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert not tick.verify_signed_tick(TICK_BODY, "valid-jwt", receiver_factory=factory)
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("QSTASH_NEXT_SIGNING_KEY")
    with pytest.raises(RuntimeError, match="not configured"):
        tick.verify_signed_tick(TICK_BODY, "valid-jwt", receiver_factory=factory)


def test_qstash_tick_rejects_unsigned_requests_without_processing(api_module, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setattr(api_module, "_verify_qstash_tick", lambda *args: False)
    worker = Mock()
    dispatcher = Mock()
    monkeypatch.setattr(api_module, "_run_notification_worker", worker)
    monkeypatch.setattr(api_module, "_drain_chamado_workflow_outbox", dispatcher)

    response = api_module.app.test_client().post(
        TICK_PATH, data=TICK_BODY, headers={"Upstash-Signature": "invalid"},
    )
    assert response.status_code == 401
    oversized = api_module.app.test_client().post(
        TICK_PATH, data=b"x" * 257, headers={"Upstash-Signature": "invalid"},
    )
    assert oversized.status_code == 401
    worker.assert_not_called()
    dispatcher.assert_not_called()


def test_qstash_tick_disabled_on_preview(api_module, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setattr(api_module, "_verify_qstash_tick", Mock(side_effect=AssertionError))
    response = api_module.app.test_client().post(TICK_PATH, data=TICK_BODY)
    assert response.status_code == 404


def test_qstash_tick_runs_queue_and_dispatcher_only_after_signature(api_module, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    verify = Mock(return_value=True)
    worker = Mock(return_value=({"status": "ok", "published": {"published": 1}}, 200))
    dispatch = Mock(return_value={"enabled": True, "published": 1})
    monkeypatch.setattr(api_module, "_verify_qstash_tick", verify)
    monkeypatch.setattr(api_module, "_run_notification_worker", worker)
    monkeypatch.setattr(api_module, "_drain_chamado_workflow_outbox", dispatch)

    response = api_module.app.test_client().post(
        TICK_PATH, data=TICK_BODY, headers={"Upstash-Signature": "test-signed"},
    )
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"
    verify.assert_called_once_with(TICK_BODY, "test-signed")
    worker.assert_called_once_with(5, 5)
    dispatch.assert_called_once_with(limit=5)


def test_qstash_tick_fails_for_retry_but_other_subsystem_still_runs(api_module, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setattr(api_module, "_verify_qstash_tick", lambda *args: True)
    worker = Mock(return_value=({"error": "Redis indisponível"}, 503))
    dispatch = Mock(return_value={"enabled": True, "published": 0})
    monkeypatch.setattr(api_module, "_run_notification_worker", worker)
    monkeypatch.setattr(api_module, "_drain_chamado_workflow_outbox", dispatch)

    response = api_module.app.test_client().post(TICK_PATH, data=TICK_BODY)
    assert response.status_code == 503
    dispatch.assert_called_once_with(limit=5)

    worker.return_value = ({"status": "ok"}, 200)
    dispatch.return_value = {"enabled": True, "error": "TimeoutError"}
    response = api_module.app.test_client().post(TICK_PATH, data=TICK_BODY)
    assert response.status_code == 503


def test_new_ticket_targets_only_claimers_of_campus(api_module, monkeypatch):
    events = []
    monkeypatch.setattr(
        api_module, "_enqueue_push_event",
        lambda event_id, payload: events.append(payload) or True,
    )
    api_module._notify_new_ticket({
        "id": "ticket-1", "ticketNumber": 77,
        "workspace_id": "ws-piracicaba", "status": "aberto",
        "roomName": "Lab", "updatedAt": "2026-11-23T10:00:00Z",
    })
    assert len(events) == 1
    assert events[0]["workspace_id"] == "ws-piracicaba"
    assert events[0]["min_level"] == "claim"


def test_reminders_use_ticket_claim_permission(api_module, monkeypatch):
    captured = []
    monkeypatch.setattr(
        api_module, "_target_subs",
        lambda **kwargs: captured.append(kwargs) or [],
    )
    assert api_module._eligible_reminder_subs("ws-piracicaba") == []
    assert captured[0]["workspace_id"] == "ws-piracicaba"
    assert captured[0]["module"] == "chamados"
    assert captured[0]["min_level"] == "claim"


def test_claim_targeting_excludes_other_campuses_and_non_claim_roles(api_module, monkeypatch):
    legacy = sys.modules[api_module._target_subs.__module__]
    subscribers = [
        {"user": {"id": "tech-here", "notify_settings": {}}},
        {"user": {"id": "tech-other", "notify_settings": {}}},
        {"user": {"id": "coordinator-here", "notify_settings": {}}},
        {"user": {"id": "super-admin-global", "is_super_admin": True, "notify_settings": {}}},
    ]
    role_tech, role_coord = "r-tec", "r-coord"
    memberships = {
        "tech-here": {"ws-here": {"role_id": role_tech, "membership_id": "mem-1"}},
        "tech-other": {"ws-other": {"role_id": role_tech, "membership_id": "mem-2"}},
        "coordinator-here": {"ws-here": {"role_id": role_coord, "membership_id": "mem-3"}},
        "super-admin-global": {},
    }
    monkeypatch.setattr(legacy, "_get_subs", lambda: subscribers)
    monkeypatch.setattr(legacy, "_resolve_batch_rbac", lambda _: memberships)
    monkeypatch.setattr(
        legacy, "_resolve_batch_role_permissions",
        lambda _: {role_tech: {"ticket.claim"}, role_coord: {"ticket.assign"}},
    )
    monkeypatch.setattr(legacy, "_resolve_batch_overrides", lambda _: {})

    selected = legacy._target_subs(module="chamados", workspace_id="ws-here", min_level="claim")
    assert [item["user"]["id"] for item in selected] == ["tech-here"]
    assert legacy._target_subs(module="chamados", min_level="claim") == []
