"""Testes isolados do agendador QStash/Workflow; nunca usam rede."""
import importlib
import logging
import pathlib
import sys
import types
import uuid

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2] / "src/apps/reservalab/api"
sys.path.insert(0, str(MODULE_DIR))
workflow = importlib.import_module("chamados_workflow")


@pytest.fixture(autouse=True)
def clear_config(monkeypatch):
    for key in (
        workflow.FLAG, workflow.URL_ENV, "QSTASH_TOKEN",
        "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


def config(monkeypatch):
    monkeypatch.setenv(workflow.FLAG, "true")
    monkeypatch.setenv(workflow.URL_ENV, "https://preview.example/api/chamados/reminders/workflow")
    monkeypatch.setenv("QSTASH_TOKEN", "mock-token")
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", "mock-current")
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", "mock-next")


def ticket(**updates):
    data = {
        "id": str(uuid.UUID("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa")),
        "workspace_id": str(uuid.UUID("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb")),
        "status": "aberto",
        "assignedToUserId": "",
        "createdAt": "2026-11-21T03:00:00+00:00",
        "updatedAt": "2026-11-21T03:00:00+00:00",
    }
    data.update(updates)
    return data


def test_flag_off_does_not_publish_or_register():
    assert not workflow.enabled()
    assert workflow.schedule(ticket(), publish=lambda **kw: pytest.fail("published")) is False
    assert workflow.register(object(), lambda *_: pytest.fail("ran"), interval_seconds=120) is False


def test_only_unassigned_open_tickets_are_scheduled(monkeypatch):
    config(monkeypatch)
    sent = []
    publish = lambda **kwargs: sent.append(kwargs)
    assert workflow.schedule(ticket(status="a_caminho"), publish=publish) is False
    assert workflow.schedule(ticket(assignedToUserId="user"), publish=publish) is False
    assert not sent


@pytest.mark.parametrize("bad", ["../other", "not-a-uuid", "", None])
def test_rejects_untrusted_ids(bad):
    with pytest.raises((ValueError, TypeError, AttributeError)):
        workflow.parse_payload({"ticket_id": bad, "workspace_id": ticket()["workspace_id"]})


def test_payload_rejects_extra_user_data_and_noncanonical_ids():
    data = ticket()
    with pytest.raises(ValueError):
        workflow.parse_payload({"ticket_id": data["id"], "workspace_id": data["workspace_id"], "email": "secret"})
    with pytest.raises(ValueError):
        workflow.parse_payload({"ticket_id": data["id"].upper(), "workspace_id": "0" * 32})


def test_requires_https_explicit_endpoint_and_signing_keys(monkeypatch):
    config(monkeypatch)
    assert workflow._config()["url"].endswith(workflow.WORKFLOW_PATH)
    monkeypatch.setenv(workflow.URL_ENV, "https://evil.example/prefix?redirect=true")
    with pytest.raises(ValueError):
        workflow._config()
    monkeypatch.setenv(workflow.URL_ENV, "http://localhost"+workflow.WORKFLOW_PATH)
    with pytest.raises(ValueError):
        workflow._config()
    monkeypatch.setenv(workflow.URL_ENV, "https://preview.example"+workflow.WORKFLOW_PATH)
    monkeypatch.delenv("QSTASH_NEXT_SIGNING_KEY")
    with pytest.raises(ValueError):
        workflow._config()


def test_preview_uses_trusted_vercel_deployment_host(monkeypatch):
    config(monkeypatch)
    monkeypatch.delenv(workflow.URL_ENV)
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("VERCEL_URL", "lab-preview-abc.vercel.app")
    assert workflow._config()["url"] == (
        "https://lab-preview-abc.vercel.app" + workflow.WORKFLOW_PATH
    )
    monkeypatch.setenv("VERCEL_URL", "evil.vercel.app/redirect")
    with pytest.raises(ValueError):
        workflow._config()
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("VERCEL_URL", "prod.vercel.app")
    with pytest.raises(ValueError):
        workflow._config()


def test_publish_uses_deduplication_and_redaction(monkeypatch):
    config(monkeypatch)
    published = []
    assert workflow.schedule(ticket(), publish=lambda **kwargs: published.append(kwargs)) is True
    assert workflow.schedule(ticket(), publish=lambda **kwargs: published.append(kwargs)) is True
    assert len(published) == 2
    assert published[0]["body"] == {
        "ticket_id": ticket()["id"], "workspace_id": ticket()["workspace_id"],
    }
    assert published[0]["deduplication_id"] == published[1]["deduplication_id"]
    assert published[0]["redact"] == {"body": True}
    assert published[0]["retries"] == 2
    assert published[0]["url"].startswith("https://preview.example/")


def test_invalid_ticket_or_missing_config_is_best_effort(monkeypatch, caplog):
    config(monkeypatch)
    assert workflow.schedule(ticket(id="malformed"), publish=lambda **kw: pytest.fail("published")) is False
    assert workflow.schedule(ticket(), publish=lambda **kw: (_ for _ in ()).throw(RuntimeError("secret-leak"))) is False
    assert "secret-leak" not in caplog.text
    monkeypatch.delenv("QSTASH_TOKEN")
    assert workflow.schedule(ticket(), publish=lambda **kw: pytest.fail("published")) is False


def test_workflow_rechecks_only_expected_ticket_workspace(monkeypatch):
    config(monkeypatch)
    captured = {}
    class FakeReceiver:
        def __init__(self, **kwargs):
            captured["receiver"] = kwargs

    class FakeServe:
        def __init__(self, app):
            captured["app"] = app
        def route(self, path, **kwargs):
            captured["path"] = path
            captured["options"] = kwargs
            def decorator(fn):
                captured["route_fn"] = fn
                return fn
            return decorator

    qstash = types.ModuleType("qstash")
    qstash.Receiver = FakeReceiver
    flask_sdk = types.ModuleType("upstash_workflow.flask")
    flask_sdk.Serve = FakeServe
    workflow_sdk = types.ModuleType("upstash_workflow")
    workflow_sdk.flask = flask_sdk
    monkeypatch.setitem(sys.modules, "qstash", qstash)
    monkeypatch.setitem(sys.modules, "upstash_workflow", workflow_sdk)
    monkeypatch.setitem(sys.modules, "upstash_workflow.flask", flask_sdk)

    received = []
    def process(ticket_id, workspace_id):
        received.append((ticket_id, workspace_id))
        return {"ok": True, "candidate_count": 1 if len(received) < 2 else 0}

    app = object()
    assert workflow.register(app, process, interval_seconds=120)
    assert captured["app"] is app
    assert captured["path"] == workflow.WORKFLOW_PATH
    assert captured["options"]["receiver"].__class__ is FakeReceiver
    assert captured["options"]["initial_payload_parser"].__name__ == "loads"
    assert captured["options"]["url"] == "https://preview.example" + workflow.WORKFLOW_PATH

    class FakeContext:
        request_payload = workflow.parse_payload({
            "ticket_id": ticket()["id"], "workspace_id": ticket()["workspace_id"],
        })
        sleeps = []
        steps = []
        def sleep(self, name, seconds):
            self.sleeps.append((name, seconds))
        def run(self, name, fn):
            self.steps.append(name)
            return fn()

    ctx = FakeContext()
    captured["route_fn"](ctx)
    assert received == [(ticket()["id"], ticket()["workspace_id"])] * 2
    assert ctx.sleeps == [("aguardar-onda-1", 120), ("aguardar-onda-2", 120)]
    assert ctx.steps == ["verificar-onda-1", "verificar-onda-2"]


def test_workflow_rejects_failed_worker(monkeypatch):
    config(monkeypatch)
    captured = {}
    class FakeServe:
        def __init__(self, app): pass
        def route(self, *args, **kwargs):
            return lambda fn: captured.setdefault("fn", fn)
    class FakeReceiver:
        def __init__(self, **kwargs): pass
    qstash = types.ModuleType("qstash")
    qstash.Receiver = FakeReceiver
    flask_sdk = types.ModuleType("upstash_workflow.flask")
    flask_sdk.Serve = FakeServe
    sdk = types.ModuleType("upstash_workflow")
    sdk.flask = flask_sdk
    monkeypatch.setitem(sys.modules, "qstash", qstash)
    monkeypatch.setitem(sys.modules, "upstash_workflow", sdk)
    monkeypatch.setitem(sys.modules, "upstash_workflow.flask", flask_sdk)
    workflow.register(object(), lambda *_: {"error": "failed"}, interval_seconds=120)

    class C:
        request_payload = {"ticket_id": ticket()["id"], "workspace_id": ticket()["workspace_id"]}
        def sleep(self, name, seconds): pass
        def run(self, name, fn): return fn()

    with pytest.raises(RuntimeError, match="verificação"):
        captured["fn"](C())
