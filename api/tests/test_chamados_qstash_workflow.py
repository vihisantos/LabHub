"""Testes isolados do agendador durável QStash/Workflow; nunca usam rede."""
import importlib
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
        "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "VERCEL_ENV", "VERCEL_URL",
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


def job(**updates):
    data = {
        "job_id": str(uuid.UUID("cccccccc-cccc-4ccc-cccc-cccccccccccc")),
        "ticket_id": ticket()["id"],
        "workspace_id": ticket()["workspace_id"],
        "cycle_key": "a" * 64,
        "lock_token": str(uuid.UUID("dddddddd-dddd-4ddd-dddd-dddddddddddd")),
    }
    data.update(updates)
    return data


class FakeStore:
    """Simula a semântica das RPCs apenas para testar a lógica do dispatcher."""

    def __init__(self, rows=None, claim_error=None):
        self.rows = [dict(r) for r in (rows or [])]
        self.claim_error = claim_error
        self.calls = []

    def __call__(self, name, params):
        self.calls.append((name, dict(params)))
        if name == workflow.OUTBOX_RPC_ENQUEUE:
            return params["p_job_id"]
        if name == workflow.OUTBOX_RPC_CLAIM:
            if self.claim_error:
                raise self.claim_error("QStash indisponível")
            return self.rows[: max(1, min(params["p_limit"], 25))]
        if name == workflow.OUTBOX_RPC_MARK:
            return True
        if name == workflow.OUTBOX_RPC_RELEASE:
            return "dead" if self.rows and self.rows[0].get("exhausted") else "pending"
        raise AssertionError(f"RPC inesperada: {name}")


# ---------------------------------------------------------------------------
# Flag e criação de chamado
# ---------------------------------------------------------------------------

def test_flag_off_does_not_enqueue_publish_or_register():
    assert not workflow.enabled()
    assert workflow.schedule(ticket(), enqueue_fn=lambda *_: pytest.fail("enqueued")) is False
    assert workflow.register(object(), lambda *_: pytest.fail("ran"), interval_seconds=120) is False
    result = workflow.drain_pending()
    assert result == {
        "enabled": False, "claimed": 0, "published": 0,
        "retried": 0, "dead": 0, "error": None,
    }


def test_only_unassigned_open_tickets_are_enqueued(monkeypatch):
    config(monkeypatch)
    called = []
    assert workflow.schedule(ticket(status="a_caminho"), enqueue_fn=called.append) is False
    assert workflow.schedule(ticket(assignedToUserId="user"), enqueue_fn=called.append) is False
    assert not called


def test_qstash_outage_during_ticket_creation_never_propagates(monkeypatch, caplog):
    config(monkeypatch)

    def explode(_ticket):
        raise RuntimeError("qstash-token-segredo")

    assert workflow.schedule(ticket(), enqueue_fn=explode) is False
    assert "qstash-token-segredo" not in caplog.text
    assert "RuntimeError" in caplog.text
    # Nenhuma chamada externa acontece no caminho da requisição.
    assert "publish" not in caplog.text


def test_enqueue_uses_stable_cycle_and_idempotent_key(monkeypatch):
    config(monkeypatch)
    store = FakeStore()
    monkeypatch.setenv("SUPABASE_URL", "https://staging.example")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "secret-nao-imprimir")

    # A mesma revisão produz a mesma chave de ciclo (a RPC faz o dedup).
    first = workflow.cycle_key(ticket())
    assert workflow.cycle_key(ticket()) == first
    assert workflow.cycle_key(ticket(updatedAt="2026-11-21T03:10:00+00:00")) != first

    assert workflow.schedule(ticket(), rpc=store) is True
    assert workflow.schedule(ticket(), rpc=store) is True
    names = [call[0] for call in store.calls]
    assert names == [workflow.OUTBOX_RPC_ENQUEUE, workflow.OUTBOX_RPC_ENQUEUE]
    # O job_id é gerado no cliente para permitir dedup id estável no QStash.
    assert workflow.cycle_key(ticket()) == first


@pytest.mark.parametrize("status", ["resolvido", "fechado", "indeferido", "em espera", ""])
def test_status_nao_aberto_nao_agenda(status):
    assert workflow.eligible_ticket(ticket(status=status)) is False


def test_current_job_escopo_por_workspace_nao_aceita_id_do_cliente():
    """O workspace vem do payload assinado; nunca de Host/parâmetro livre."""
    captured = []

    def rpc(name, params):
        captured.append((name, dict(params)))
        return job()["job_id"]

    other = str(uuid.UUID("eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee"))
    assert workflow.current_job(ticket()["id"], other, rpc=rpc) == job()["job_id"]
    assert captured[0][1] == {
        "p_ticket_id": ticket()["id"], "p_workspace_id": other,
    }
    with pytest.raises(ValueError):
        workflow.parse_payload({
            "ticket_id": ticket()["id"],
            "workspace_id": "javascript:alert(1)",
            "job_id": job()["job_id"],
        })


def test_enqueue_rpc_payload_has_only_internal_ids(monkeypatch):
    config(monkeypatch)
    captured = {}

    def rpc(name, params):
        captured.update(name=name, params=params)
        return params["p_job_id"]

    job_id = workflow.enqueue(ticket(), rpc=rpc)
    assert captured["name"] == workflow.OUTBOX_RPC_ENQUEUE
    assert set(captured["params"]) == {
        "p_job_id", "p_ticket_id", "p_workspace_id", "p_cycle_key",
    }
    assert captured["params"]["p_ticket_id"] == ticket()["id"]
    assert captured["params"]["p_workspace_id"] == ticket()["workspace_id"]
    assert len(captured["params"]["p_cycle_key"]) == 64
    assert job_id


# ---------------------------------------------------------------------------
# Payload/segurança
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad", ["../other", "not-a-uuid", "", None])
def test_rejects_untrusted_ids(bad):
    with pytest.raises((ValueError, TypeError, AttributeError)):
        workflow.parse_payload({
            "ticket_id": bad,
            "workspace_id": ticket()["workspace_id"],
            "job_id": job()["job_id"],
        })


def test_payload_rejects_extra_user_data_and_noncanonical_ids():
    with pytest.raises(ValueError):
        workflow.parse_payload({
            "ticket_id": ticket()["id"],
            "workspace_id": ticket()["workspace_id"],
            "job_id": job()["job_id"],
            "email": "professor@example.com",
        })
    with pytest.raises(ValueError):
        workflow.parse_payload({
            "ticket_id": ticket()["id"].upper(),
            "workspace_id": "0" * 32,
            "job_id": job()["job_id"],
        })


def test_requires_https_explicit_endpoint_and_signing_keys(monkeypatch):
    config(monkeypatch)
    assert workflow._config()["url"].endswith(workflow.WORKFLOW_PATH)
    monkeypatch.setenv(workflow.URL_ENV, "https://evil.example/prefix?redirect=true")
    with pytest.raises(ValueError):
        workflow._config()
    monkeypatch.setenv(workflow.URL_ENV, "http://localhost" + workflow.WORKFLOW_PATH)
    with pytest.raises(ValueError):
        workflow._config()
    monkeypatch.setenv(workflow.URL_ENV, "https://preview.example" + workflow.WORKFLOW_PATH)
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


# ---------------------------------------------------------------------------
# Dispatcher durável
# ---------------------------------------------------------------------------

def test_drain_publishes_with_stable_dedup_and_ack(monkeypatch):
    config(monkeypatch)
    store = FakeStore([job()])
    published = []

    result = workflow.drain_pending(rpc=store, publish=lambda **kw: published.append(kw))

    assert result["claimed"] == result["published"] == 1
    assert result["retried"] == 0
    assert published[0]["body"] == {
        "ticket_id": job()["ticket_id"],
        "workspace_id": job()["workspace_id"],
        "job_id": job()["job_id"],
    }
    assert published[0]["deduplication_id"] == f"labhub-reminder-{job()['job_id']}"
    assert published[0]["retries"] == 0
    assert published[0]["redact"] == {"body": True}
    assert published[0]["url"] == "https://preview.example/api/chamados/reminders/workflow"
    assert store.calls[0][0] == workflow.OUTBOX_RPC_CLAIM
    assert store.calls[0][1]["p_limit"] == workflow.DEFAULT_DISPATCH_BATCH
    assert store.calls[1][0] == workflow.OUTBOX_RPC_MARK


def test_drain_releases_failed_publication_with_backoff(monkeypatch, caplog):
    config(monkeypatch)
    store = FakeStore([job()])

    def fail(**kwargs):
        raise TimeoutError("detalhe-do-token")

    result = workflow.drain_pending(rpc=store, publish=fail)

    assert result["claimed"] == 1
    assert result["published"] == 0
    assert result["retried"] == 1
    release = [c for c in store.calls if c[0] == workflow.OUTBOX_RPC_RELEASE]
    assert len(release) == 1
    assert release[0][1]["p_error"] == "TimeoutError"
    assert "detalhe-do-token" not in caplog.text
    assert "TimeoutError" in caplog.text


def test_drain_reports_dead_after_exhausted_attempts(monkeypatch):
    config(monkeypatch)
    store = FakeStore([job(exhausted=True)])

    def fail(**kwargs):
        raise RuntimeError("QStash indisponível")

    result = workflow.drain_pending(rpc=store, publish=fail)
    assert result["dead"] == 1
    assert result["retried"] == 0
    assert result["claimed"] == 1


def test_drain_survives_claim_outage_without_touching_rows(monkeypatch):
    config(monkeypatch)
    store = FakeStore([job()], claim_error=OSError)
    result = workflow.drain_pending(rpc=store, publish=lambda **kw: pytest.fail("published"))
    assert result["error"] == "OSError"
    assert result["claimed"] == 0
    assert [c[0] for c in store.calls] == [workflow.OUTBOX_RPC_CLAIM]


def test_current_job_uses_scoped_rpc():
    captured = {}

    def rpc(name, params):
        captured.update(name=name, params=params)
        return job()["job_id"]

    assert workflow.current_job(ticket()["id"], ticket()["workspace_id"], rpc=rpc) == job()["job_id"]
    assert captured["name"] == workflow.OUTBOX_RPC_CURRENT
    assert captured["params"] == {
        "p_ticket_id": ticket()["id"], "p_workspace_id": ticket()["workspace_id"],
    }


# ---------------------------------------------------------------------------
# Workflow: falha dentro da etapa e ciclos antigos
# ---------------------------------------------------------------------------

def install_fake_sdk(monkeypatch):
    captures = {}

    class FakeReceiver:
        def __init__(self, **kwargs):
            captures["receiver"] = kwargs

    class FakeServe:
        def __init__(self, app):
            captures["app"] = app

        def route(self, path, **kwargs):
            captures["options"] = kwargs
            captures["path"] = path

            def decorator(fn):
                captures["fn"] = fn
                return fn
            return decorator

    qstash = types.ModuleType("qstash")
    qstash.Receiver = FakeReceiver
    flask_sdk = types.ModuleType("upstash_workflow.flask")
    flask_sdk.Serve = FakeServe
    sdk = types.ModuleType("upstash_workflow")
    sdk.flask = flask_sdk
    monkeypatch.setitem(sys.modules, "qstash", qstash)
    monkeypatch.setitem(sys.modules, "upstash_workflow", sdk)
    monkeypatch.setitem(sys.modules, "upstash_workflow.flask", flask_sdk)
    return captures


class FakeContext:
    def __init__(self):
        self.request_payload = {
            "ticket_id": ticket()["id"],
            "workspace_id": ticket()["workspace_id"],
            "job_id": job()["job_id"],
        }
        self.sleeps = []
        self.steps = []

    def sleep(self, name, seconds):
        self.sleeps.append((name, seconds))

    def run(self, name, fn):
        self.steps.append(name)
        return fn()


def test_workflow_validates_result_inside_step(monkeypatch):
    config(monkeypatch)
    captures = install_fake_sdk(monkeypatch)

    def process(*_args):
        return {"error": "falha"}

    app = object()
    assert workflow.register(app, process, interval_seconds=120)
    assert captures["options"]["url"] == "https://preview.example/api/chamados/reminders/workflow"
    # Serve.route do SDK Flask 2.0.0 não aceita `redact`.
    assert "redact" not in captures["options"]

    # A exceção nasce DENTRO da função passada a context.run, antes que a
    # SDK persista a etapa como sucesso.
    seen = {}

    class Context(FakeContext):
        def run(self, name, fn):
            seen["fn"] = fn
            return fn()

    with pytest.raises(RuntimeError, match="verificação") as excinfo:
        captures["fn"](Context())

    assert seen["fn"].__name__ == "check"
    assert any(
        frame.name == "check"
        for frame in excinfo.traceback
    )


def test_workflow_stops_when_cycle_changed(monkeypatch):
    config(monkeypatch)
    captures = install_fake_sdk(monkeypatch)
    processed = []
    workflow.register(
        object(),
        lambda *_a: (processed.append(1), {"candidate_count": 1, "ok": True})[1],
        interval_seconds=120,
        # O banco diz que outro ciclo (reabertura) já venceu.
        current_job_fn=lambda *_a: str(uuid.uuid4()),
    )
    ctx = FakeContext()
    captures["fn"](ctx)
    assert ctx.steps == ["verificar-onda-1"]
    assert len(processed) == 1
    assert not ctx.sleeps or ctx.sleeps[0][0] == "aguardar-onda-1"


def test_workflow_stops_when_ticket_was_claimed(monkeypatch):
    config(monkeypatch)
    captures = install_fake_sdk(monkeypatch)
    seen = []

    def process(*_a):
        seen.append("check")
        return {"ok": True, "candidate_count": 0}

    workflow.register(
        object(), process, interval_seconds=120,
        current_job_fn=lambda *_a: job()["job_id"],
    )
    ctx = FakeContext()
    captures["fn"](ctx)
    assert seen == ["check"]
    assert ctx.steps == ["verificar-onda-1"]
    assert ctx.sleeps == [("aguardar-onda-1", 120)]
