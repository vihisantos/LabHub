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
        {"user": {"id": "super-admin-local", "is_super_admin": True, "notify_settings": {}}},
    ]
    role_tech, role_coord = "r-tec", "r-coord"
    memberships = {
        "tech-here": {"ws-here": {"role_id": role_tech, "membership_id": "mem-1"}},
        "tech-other": {"ws-other": {"role_id": role_tech, "membership_id": "mem-2"}},
        "coordinator-here": {"ws-here": {"role_id": role_coord, "membership_id": "mem-3"}},
        "super-admin-global": {},
        "super-admin-local": {"ws-here": {"role_id": role_coord, "membership_id": "mem-4"}},
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


def test_created_ticket_kicks_fixed_signed_tick_without_user_data(api_module, monkeypatch):
    import notification_tick as tick

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    publish = Mock()
    ticket_id = "b394e6e1-b6e8-442c-aa99-c76c37ec3303"

    assert tick.request_tick_for_created_ticket(ticket_id, publish=publish)
    publish.assert_called_once_with(
        url="https://lab-hub-pi.vercel.app" + TICK_PATH,
        body=TICK_BODY.decode("utf-8"),
        content_type="application/json",
        deduplication_id="labhub-created-" + ticket_id,
        retries=1,
        timeout="20s",
    )
    assert not tick.request_tick_for_created_ticket("not-uuid", publish=publish)
    assert publish.call_count == 1


def test_created_ticket_kick_fails_open_and_preview_never_publishes(api_module, monkeypatch):
    import notification_tick as tick

    ticket_id = "b394e6e1-b6e8-442c-aa99-c76c37ec3303"
    publish = Mock(side_effect=TimeoutError("network timeout"))
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    assert tick.request_tick_for_created_ticket(ticket_id, publish=publish) is False
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert tick.request_tick_for_created_ticket(ticket_id, publish=publish) is False
    assert publish.call_count == 1
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("QSTASH_TOKEN")
    assert tick.request_tick_for_created_ticket(ticket_id, publish=publish) is False
    assert publish.call_count == 1


def test_old_created_notification_does_not_alert_after_claim(api_module, monkeypatch):
    subscriber_lookup = Mock(side_effect=AssertionError("stale event queried subscribers"))
    push = Mock(side_effect=AssertionError("stale event sent Push"))
    monkeypatch.setattr(api_module, "_created_push_still_actionable", lambda *args: False)
    monkeypatch.setattr(api_module, "_target_subs", subscriber_lookup)
    monkeypatch.setattr(api_module, "_push_notify_subs_dedup", push)

    result = api_module._deliver_outbox_notification(
        "ticket-created-stale",
        {
            "module": "chamados",
            "context": "chamados-created",
            "workspace_id": "b394e6e1-b6e8-442c-aa99-c76c37ec3303",
            "action_url": "/chamados/tickets/23a8de5b-09b7-49ba-8b9f-7380425be4c9",
            "title": "Novo chamado",
        },
    )
    assert result is True
    subscriber_lookup.assert_not_called()
    push.assert_not_called()


def test_created_ticket_revalidation_requires_open_unclaimed_and_same_campus(
    api_module, monkeypatch,
):
    from unittest.mock import Mock

    ticket_id = "23a8de5b-09b7-49ba-8b9f-7380425be4c9"
    workspace_id = "b394e6e1-b6e8-442c-aa99-c76c37ec3303"
    url = f"/chamados/tickets/{ticket_id}"
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-key")
    response = Mock(ok=True)
    response.json.return_value = [{
        "id": ticket_id, "workspace_id": workspace_id,
        "status": "aberto", "assignedToUserId": "",
    }]
    get = Mock(return_value=response)
    monkeypatch.setattr(api_module.requests, "get", get)

    assert api_module._created_push_still_actionable(url, workspace_id)
    assert get.call_args.kwargs["timeout"] == 8

    response.json.return_value[0]["assignedToUserId"] = "tech-1"
    assert not api_module._created_push_still_actionable(url, workspace_id)
    response.json.return_value[0]["assignedToUserId"] = ""
    response.json.return_value[0]["status"] = "indeferido"
    assert not api_module._created_push_still_actionable(url, workspace_id)
    response.json.return_value[0]["status"] = "aberto"
    response.json.return_value[0]["workspace_id"] = "d64116cd-3dc8-407a-a940-f5539ac81061"
    assert not api_module._created_push_still_actionable(url, workspace_id)

    assert not api_module._created_push_still_actionable("/invalid-url", workspace_id)


def test_db_error_during_created_push_revalidation_keeps_event_for_retry(api_module, monkeypatch):
    ticket_id = "23a8de5b-09b7-49ba-8b9f-7380425be4c9"
    workspace_id = "b394e6e1-b6e8-442c-aa99-c76c37ec3303"
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-key")
    response = Mock(ok=False, status_code=503)
    monkeypatch.setattr(api_module.requests, "get", lambda *args, **kwargs: response)
    with pytest.raises(RuntimeError, match="revalidar abertura"):
        api_module._deliver_outbox_notification(
            "ticket-created-retry", {
                "module": "chamados",
                "context": "chamados-created",
                "workspace_id": workspace_id,
                "action_url": f"/chamados/tickets/{ticket_id}",
            },
        )


def test_push_action_urls_keep_internal_paths_and_block_evil_schemes(api_module):
    assert api_module._safe_push_action_url("/chamados/tickets/abc")
    assert api_module._safe_push_action_url("/chamados/tickets/abc?tab=history")
    assert not api_module._safe_push_action_url("//evil.example/path")
    assert not api_module._safe_push_action_url("/%2fevil.example")
    assert not api_module._safe_push_action_url("/%5c%5cevil.example")
    assert not api_module._safe_push_action_url("javascript:alert(1)")
    assert not api_module._safe_push_action_url("/chamados/abc\nX-Test: value")


def test_created_event_preserves_ticket_deep_link(api_module, monkeypatch):
    from unittest.mock import Mock

    subscriber = {"user": {"id": "tech"}}
    select = Mock(return_value=[subscriber])
    send = Mock(return_value=(1, 0, 0, 0, 0))
    validate = Mock(return_value=True)
    monkeypatch.setattr(api_module, "_created_push_still_actionable", validate)
    monkeypatch.setattr(api_module, "_target_subs", select)
    monkeypatch.setattr(api_module, "_push_notify_subs_dedup", send)

    ticket = "23a8de5b-09b7-49ba-8b9f-7380425be4c9"
    campus = "b394e6e1-b6e8-442c-aa99-c76c37ec3303"
    url = f"/chamados/tickets/{ticket}"
    assert api_module._deliver_outbox_notification("new-event", {
        "module": "chamados", "context": "chamados-created",
        "workspace_id": campus, "min_level": "claim",
        "action_url": url, "title": "Novo chamado",
    })
    validate.assert_called_once_with(url, campus)
    assert select.call_args.kwargs["min_level"] == "claim"
    assert select.call_args.kwargs["workspace_id"] == campus
    assert send.call_args.kwargs["url"] == url


# Regression suite for event-driven latency (no real QStash requests).
def test_claim_status_and_assignment_publish_distinct_fixed_qstash_wakeups(api_module, monkeypatch):
    import notification_tick as tick

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    publish = Mock()
    one = "chamados:" + "a" * 64
    two = "chamados:" + "b" * 64

    assert tick.request_tick_for_chamados_event(one, publish=publish)
    assert tick.request_tick_for_chamados_event(two, publish=publish)
    assert publish.call_count == 2
    for event_id, call in zip((one, two), publish.call_args_list):
        assert call.kwargs["url"] == "https://lab-hub-pi.vercel.app" + TICK_PATH
        assert call.kwargs["body"] == TICK_BODY.decode("utf-8")
        assert call.kwargs["content_type"] == "application/json"
        assert call.kwargs["deduplication_id"] == "labhub-event-" + event_id[9:]
        assert call.kwargs["retries"] == 1
    assert publish.call_args_list[0].kwargs["deduplication_id"] != publish.call_args_list[1].kwargs["deduplication_id"]


@pytest.mark.parametrize("bad_id", [
    "", "other:" + "a" * 64, "chamados:" + "x" * 64,
    "chamados:" + "a" * 63, "chamados:" + "A" * 64,
    "chamados:" + "a" * 64 + ":extra", None,
])
def test_event_wakeup_refuses_malformed_unrelated_or_pii_ids(
    api_module, monkeypatch, bad_id,
):
    import notification_tick as tick

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    publisher = Mock()
    assert not tick.request_tick_for_chamados_event(bad_id, publish=publisher)
    publisher.assert_not_called()


def test_event_wakeup_never_publishes_in_preview_and_fails_open_on_qstash_error(
    api_module, monkeypatch,
):
    import notification_tick as tick

    event_id = "chamados:" + "c" * 64
    publish = Mock()
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    assert not tick.request_tick_for_chamados_event(event_id, publish=publish)
    publish.assert_not_called()

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("QSTASH_TOKEN")
    assert not tick.request_tick_for_chamados_event(event_id, publish=publish)
    publish.assert_not_called()

    monkeypatch.setenv("QSTASH_TOKEN", "test-publish-token")
    publish.side_effect = TimeoutError("simulate outage")
    assert not tick.request_tick_for_chamados_event(event_id, publish=publish)
    assert publish.call_count == 1


def test_chamados_outbox_wakes_qstash_after_persisted_event(
    api_module, monkeypatch,
):
    timeline = []
    event_id = "chamados:" + "d" * 64
    monkeypatch.setattr(
        api_module, "_queue_push_event",
        lambda event, *args, **kwargs: timeline.append(("queued", event, kwargs)) or "queued",
    )
    monkeypatch.setattr(
        api_module, "_request_tick_for_chamados_event",
        lambda event: timeline.append(("qstash_wakeup", event)) or True,
    )
    payload = {
        "module": "chamados",
        "context": "chamados-claimed",
        "workspace_id": "ws-piracicaba",
        "title": "Chamado assumido",
        "target_user_id": "tech-1",
    }
    assert api_module._enqueue_push_event(event_id, payload)
    assert [item[0] for item in timeline] == ["queued", "qstash_wakeup"]
    assert timeline[1][1] == event_id
    assert timeline[0][2]["workspace_id"] == "ws-piracicaba"


@pytest.mark.parametrize("queue_status,module,context,expected_kicks", [
    ("queued", "chamados", "chamados-status", 1),
    ("queued", "chamados", "chamados-assigned", 1),
    ("queued", "chamados", "chamados-claimed", 1),
    ("queued", "chamados", "chamados-created", 0),  # creation wakes after workflow outbox
    ("duplicate", "chamados", "chamados-status", 0),
    ("queued", "stock", "stock-inventory", 0),
    (None, "chamados", "chamados-status", 0),
])
def test_wakeup_only_for_new_persisted_chamados_events(
    api_module, monkeypatch, queue_status, module, context, expected_kicks,
):
    wake = Mock(return_value=True)
    monkeypatch.setattr(api_module, "_request_tick_for_chamados_event", wake)
    monkeypatch.setattr(api_module, "_queue_push_event", lambda *args, **kwargs: queue_status)
    event_id = "chamados:" + "e" * 64
    assert api_module._enqueue_push_event(event_id, {
        "module": module, "context": context, "title": "status",
    }) is (queue_status in ("queued", "duplicate"))
    assert wake.call_count == expected_kicks


def test_qstash_failure_does_not_lose_durable_ticket_event(api_module, monkeypatch):
    writes = []
    monkeypatch.setattr(
        api_module, "_queue_push_event",
        lambda event, *args, **kwargs: writes.append(event) or "queued",
    )
    wake = Mock(return_value=False)
    monkeypatch.setattr(api_module, "_request_tick_for_chamados_event", wake)
    monkeypatch.setenv("VERCEL_ENV", "production")
    event_id = "chamados:" + "f" * 64

    assert api_module._enqueue_push_event(event_id, {
        "module": "chamados", "context": "chamados-status",
        "target_user_id": "reporter-1",
    }) is True
    assert writes == [event_id]  # periodic 5-min tick can still consume the outbox
    wake.assert_called_once_with(event_id)


def test_chamados_producers_wake_each_distinct_claim_event(api_module, monkeypatch):
    queued = []
    wake = []
    monkeypatch.setattr(
        api_module, "_queue_push_event",
        lambda event, *args, **kwargs: queued.append((event, kwargs)) or "queued",
    )
    monkeypatch.setattr(
        api_module, "_request_tick_for_chamados_event",
        lambda event: wake.append(event) or True,
    )
    ticket = {
        "id": "9c9f7381-c03f-41de-a46f-c0094025ef60",
        "ticketNumber": 333, "workspace_id": "ws-piracicaba",
        "status": "aberto", "updatedAt": "2026-11-23T20:30:00Z",
        "assignedToUserId": "technician-1",
        "roomName": "Laboratorio", "problemCategory": "Internet",
    }
    api_module._notify_ticket_claimed(ticket, "Técnico")
    assert len(queued) == 2
    assert len(wake) == 2
    assert set(wake) == {item[0] for item in queued}
    assert all(item[1]["module"] == "chamados" for item in queued)


def test_operational_push_isolation_across_two_campuses(api_module, monkeypatch):
    """Real targeting and delivery code; synthetic subscriptions, no external pushes."""
    from unittest.mock import Mock
    legacy = sys.modules[api_module._target_subs.__module__]
    a, b = "ws-a", "ws-b"
    uids = [f"10000000-0000-4000-8000-{i:012d}" for i in range(1, 8)]
    tech_a, tech_b, admin_global, admin_b, both, denied, inactive = uids
    subscribers = [{"endpoint": f"https://push.invalid/{uid}", "user": {
        "id": uid, "is_super_admin": uid in (admin_global, admin_b),
        "notify_settings": {},
    }} for uid in uids]
    profiles = [{"id": uid, "status": "active", "is_super_admin":
        uid in (admin_global, admin_b), "notify_settings": {}}
        for uid in uids if uid != inactive]
    def membership(uid, ws):
        return {"role_id": "tech-role", "membership_id": uid + ws}
    members = {
        tech_a: {a: membership(tech_a, a)},
        tech_b: {b: membership(tech_b, b)},
        admin_global: {},
        admin_b: {b: membership(admin_b, b)},
        both: {a: membership(both, a), b: membership(both, b)},
        denied: {a: membership(denied, a)},
        inactive: {},
    }
    monkeypatch.setattr(legacy, "_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(legacy, "_SUPABASE_SERVICE_KEY", "test")
    monkeypatch.setattr(legacy, "_get_subs", lambda **kw: subscribers)
    monkeypatch.setattr(legacy, "_resolve_batch_rbac", lambda *args, **kw: members)
    monkeypatch.setattr(legacy, "_resolve_batch_role_permissions",
                        lambda *args, **kw: {"tech-role": {"ticket.claim", "ticket.edit"}})
    monkeypatch.setattr(legacy, "_resolve_batch_overrides", lambda *args, **kw: {
        denied + a: {"ticket.claim": "deny", "ticket.edit": "deny"},
    })
    response = Mock(ok=True)
    response.json.return_value = profiles
    monkeypatch.setattr(legacy.requests, "get", lambda *args, **kw: response)
    monkeypatch.setattr(api_module, "_created_push_still_actionable", lambda *args: True)
    # Avoid a redundant external recheck in this test: the global admin has
    # already been excluded by membership; real DB fetches are mocked.
    monkeypatch.setattr(api_module, "_revalidate_super_admin_subs", lambda subs: subs)
    def ids(subs):
        return {s["user"]["id"] for s in subs}
    assert ids(api_module._eligible_reminder_subs(a)) == {tech_a, both}
    assert ids(api_module._eligible_reminder_subs(b)) == {tech_b, admin_b, both}
    for level in ("claim", "full"):
        assert legacy._target_subs(module="chamados", min_level=level) == []
        assert ids(legacy._target_subs(module="chamados", workspace_id=a,
                                      min_level=level, strict=True)) == {tech_a, both}
        assert ids(legacy._target_subs(module="chamados", workspace_id=b,
                                      min_level=level, strict=True)) == {tech_b, admin_b, both}
    send = Mock(return_value=(1, 0, 0, 0, 0))
    monkeypatch.setattr(api_module, "_push_notify_subs_dedup", send)
    for campus, eligible, claimer in ((a, {tech_a, both}, tech_a),
                                     (b, {tech_b, admin_b, both}, tech_b)):
        for context, level, target, exclude, expected in (
            ("chamados-created", "claim", None, None, eligible),
            ("chamados-claimed", "full", claimer, None, {claimer}),
            ("chamados-claimed", "full", None, claimer, eligible - {claimer}),
            ("chamados-assigned", "full", claimer, None, {claimer}),
        ):
            send.reset_mock()
            assert api_module._deliver_outbox_notification("event-" + context, {
                "module": "chamados", "context": context, "workspace_id": campus,
                "min_level": level, "target_user_id": target, "exclude_user_id": exclude,
            })
            assert ids(send.call_args.args[0]) == expected
            assert send.call_args.kwargs["workspace_id"] == campus
    send.reset_mock()
    with pytest.raises(ValueError, match="sem campus"):
        api_module._deliver_outbox_notification("invalid-claim", {
            "module": "chamados", "context": "chamados-claimed", "min_level": "full",
        })
    send.assert_not_called()
