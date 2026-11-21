"""Validação com os SDKs OFICIAIS qstash/upstash-workflow, sem rede.

Estes testes não substituem o smoke real em Staging. Eles provam, com o código
das bibliotecas instaladas (e apenas o transporte HTTP substituído), que:

* assinaturas ausentes/inválidas são rejeitadas antes de qualquer etapa;
* uma exceção dentro da função de ``context.run`` impede a persistência da
  etapa -- por isso a validação de ``process_one`` vive dentro dela;
* a URL configurada (nunca o Host do request) é usada pelo SDK;
* as retentivas do cliente QStash funcionam, e o dispatcher usa ``retry=False``
  porque quem controla nova tentativa é a outbox (com backoff no PostgreSQL).
"""
import base64
import hashlib
import importlib
import json
import pathlib
import sys
import time
import uuid

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2] / "src/apps/reservalab/api"
sys.path.insert(0, str(MODULE_DIR))
workflow = importlib.import_module("chamados_workflow")

qstash = pytest.importorskip("qstash")
upstash_workflow = pytest.importorskip("upstash_workflow")
jwt = pytest.importorskip("jwt")
httpx = pytest.importorskip("httpx")

from flask import Flask  # noqa: E402
from qstash import QStash, Receiver  # noqa: E402
from upstash_workflow import WorkflowContext  # noqa: E402
from upstash_workflow.serve.options import _determine_urls  # noqa: E402
from upstash_workflow.error import WorkflowAbort  # noqa: E402
from upstash_workflow.workflow_types import _SyncRequest  # noqa: E402
from upstash_workflow.workflow_requests import _recreate_user_headers  # noqa: E402

CURRENT_KEY = "test-current-signing-key-with-at-least-32-bytes"
NEXT_KEY = "test-next-signing-key-with-at-least-32-bytes"
URL = "https://preview-abc123.vercel.app/api/chamados/reminders/workflow"
BYPASS = "bypass-real-sdk-test-token-32chars"
FORWARDED = "Upstash-Forward-x-vercel-protection-bypass"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in (
        workflow.FLAG, workflow.URL_ENV, "QSTASH_TOKEN",
        "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY",
        "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "VERCEL_ENV", "VERCEL_URL",
        "VERCEL_AUTOMATION_BYPASS_SECRET",
    ):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv(workflow.FLAG, "true")
    monkeypatch.setenv(workflow.URL_ENV, URL)
    monkeypatch.setenv("QSTASH_TOKEN", "test-token")
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", CURRENT_KEY)
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", NEXT_KEY)
    monkeypatch.setenv("VERCEL_AUTOMATION_BYPASS_SECRET", BYPASS)


def signed(body: str, key: str = CURRENT_KEY, *, url: str = URL) -> str:
    """Assinatura JWT no formato real do QStash (HS256, issuer Upstash)."""
    now = int(time.time())
    digest = hashlib.sha256(body.encode("utf-8")).digest()
    claims = {
        "iss": "Upstash",
        "sub": url,
        "exp": now + 60,
        "nbf": now - 1,
        "body": base64.urlsafe_b64encode(digest).decode().rstrip("="),
    }
    return jwt.encode(claims, key, algorithm="HS256")


def payload():
    return {
        "ticket_id": str(uuid.UUID("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa")),
        "workspace_id": str(uuid.UUID("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb")),
        "job_id": str(uuid.UUID("cccccccc-cccc-4ccc-cccc-cccccccccccc")),
    }


class NoNetworkHttp:
    def request(self, **_kwargs):
        raise AssertionError("a SDK tentou persistir uma etapa sem rede")


class NoNetworkClient:
    http = NoNetworkHttp()


def real_context(*, steps=None):
    return WorkflowContext(
        qstash_client=NoNetworkClient(),
        workflow_run_id="wfi_test",
        headers={},
        steps=steps or [],
        url=URL,
        failure_url=None,
        initial_payload=payload(),
    )


# ---------------------------------------------------------------------------
# Segurança: verificação real de assinatura
# ---------------------------------------------------------------------------

def test_real_sdk_rejeita_assinatura_ausente(configured):
    app = Flask("missing-signature")
    called = []
    assert workflow.register(
        app, lambda *_a: called.append(1), interval_seconds=1,
        current_job_fn=lambda *_a: payload()["job_id"],
    ) is True

    body = json.dumps(payload())
    response = app.test_client().post(workflow.WORKFLOW_PATH, data=body)
    assert response.status_code >= 400
    assert called == []


def test_real_sdk_rejeita_assinatura_invalida_e_chave_errada(configured):
    app = Flask("bad-signature")
    called = []
    assert workflow.register(
        app, lambda *_a: called.append(1), interval_seconds=1,
        current_job_fn=lambda *_a: payload()["job_id"],
    ) is True
    client = app.test_client()
    body = json.dumps(payload())

    for signature in ("not-a-jwt", signed(body, "wrong-key-with-at-least-32-bytes")):
        response = client.post(
            workflow.WORKFLOW_PATH,
            data=body,
            headers={"Upstash-Signature": signature},
        )
        assert response.status_code >= 400
    assert called == []


def test_real_sdk_receiver_aceita_chave_em_rotacao(configured):
    """A chave `next` é aceita pela SDK real durante rotação."""
    receiver = Receiver(
        current_signing_key=CURRENT_KEY, next_signing_key=NEXT_KEY
    )
    body = "payload"
    # Não levanta: assinatura feita com a chave antiga (next) é válida.
    receiver.verify(signature=signed(body, NEXT_KEY), body=body)


# ---------------------------------------------------------------------------
# Etapas: falha dentro de context.run não vira etapa persistida
# ---------------------------------------------------------------------------

def test_real_sdk_erro_dentro_da_etapa_nao_persiste(configured):
    context = real_context()

    def failing_check():
        raise RuntimeError("verificação de lembrete falhou")

    with pytest.raises(RuntimeError, match="verificação"):
        context.run("verificar-onda-1", failing_check)
    # Nenhuma chamada HTTP => nenhum step salvo como sucesso no QStash.


def test_real_sdk_resultado_com_erro_persistido_se_validado_fora_da_etapa(configured):
    """Prova concreta do bug corrigido: erro fora da etapa viraria 'out'."""
    calls = []

    class RecordingHttp:
        def request(self, **kwargs):
            calls.append(kwargs)
            return []

    context = real_context()
    context.qstash_client.http = RecordingHttp()
    # Este é o padrão inseguro: o resultado com erro é gravado como etapa.
    # WorkflowAbort é o controle de fluxo normal da SDK após persistir.
    with pytest.raises(WorkflowAbort):
        context.run("verificar-onda-1", lambda: {"error": "falha"})
    assert calls, "a SDK real persiste o retorno da etapa"
    step = json.loads(json.loads(calls[0]["body"])[0]["body"])
    assert json.loads(step["out"]) == {"error": "falha"}


def test_real_sdk_url_explicita_prevalece_sobre_host(configured):
    request = _SyncRequest(
        body="", headers={}, method="POST",
        url="https://attacker.example/evil?next=https://evil",
        query={},
    )
    url, _ = _determine_urls(request, URL, None, False, None)
    assert url == URL
    assert "?" not in url
    assert "bypass" not in url


# ---------------------------------------------------------------------------
# Retentivas reais do cliente QStash x retentivas da outbox
# ---------------------------------------------------------------------------

class _FlakyTransport:
    def __init__(self, failures):
        self.failures = failures
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) <= self.failures:
            raise ConnectionError("falha transitória")
        return httpx.Response(200, json={"messageId": "msg_ok"})


def test_real_sdk_qstash_retry_padrao_recupera(configured, monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)
    client = QStash(token="test-token")
    transport = _FlakyTransport(failures=2)
    client.http._client = transport

    result = client.message.publish_json(url=URL, body={"ticket_id": "id"})
    assert result.message_id == "msg_ok"
    assert len(transport.calls) == 3  # 1 tentativa + 2 retentivas reais


def test_dispatcher_desliga_retry_do_sdk_e_devolve_para_outbox(configured, monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)
    client = workflow._qstash_client(workflow._config())
    transport = _FlakyTransport(failures=2)
    client.http._client = transport

    with pytest.raises(ConnectionError):
        client.message.publish_json(url=URL, body={"ticket_id": "id"})
    assert len(transport.calls) == 1
    # A falha volta para a outbox, que aplica backoff e limita a 5 tentativas.
    assert workflow.MAX_PUBLISH_ATTEMPTS == 5


# ---------------------------------------------------------------------------
# QStash -> Preview protegida: por que o query parameter é necessário
# ---------------------------------------------------------------------------

def test_real_sdk_remove_headers_vercel_das_etapas():
    """Prova com o SDK real que enviar só o header NÃO sobrevive ao sleep/run."""
    headers = _recreate_user_headers({
        "x-vercel-protection-bypass": BYPASS,
        "Content-Type": "application/json",
    })
    assert "x-vercel-protection-bypass" not in headers
    assert headers["Content-Type"] == "application/json"


def test_real_sdk_bypass_injetado_em_publicacao_e_em_todas_as_etapas(configured):
    """Prova com a SDK real: o header vai na publicação e em cada step/sleep."""
    client = workflow._qstash_client(workflow._config())
    calls = []

    class RecordingTransport:
        def request(self, **kwargs):
            calls.append(kwargs)
            body = (
                [{"messageId": "msg_ok"}]
                if "batch" in kwargs.get("path", "")
                else {"messageId": "msg_ok", "deduplicated": False}
            )
            return httpx.Response(200, json=body)

    client.http._client = RecordingTransport()

    # Publicação inicial (dispatcher).
    client.message.publish_json(url=URL, body=payload())
    # Etapa persistida pela SDK do Workflow (usa o MESMO cliente configurado).
    context = real_context()
    context.qstash_client = client
    with pytest.raises(WorkflowAbort):
        context.run("verificar-onda-1", lambda: {"stop": False})

    assert len(calls) >= 2
    for call in calls:
        assert call["headers"][FORWARDED] == BYPASS
        assert "x-vercel-protection-bypass" not in call["url"]
        assert "?" not in call["url"]

    # O transporte real recebe o batch de etapas como `content`. O header
    # encaminhado precisa estar DENTRO de cada mensagem: o QStash não replica
    # headers do nível da requisição /v2/batch para as mensagens do lote.
    batch = json.loads(calls[-1]["content"])
    for message in batch:
        assert message["destination"] == URL
        assert message["headers"]["Upstash-Workflow-Url"] == URL
        assert message["headers"][FORWARDED] == BYPASS
    assert BYPASS not in json.dumps(payload())


def test_real_sdk_bypass_chega_em_sleep_agendado(configured):
    """A retomada de `context.sleep()` é o caminho que falhou em Staging."""
    client = workflow._qstash_client(workflow._config())
    calls = []

    class RecordingTransport:
        def request(self, **kwargs):
            calls.append(kwargs)
            return httpx.Response(200, json=[{"messageId": "msg_ok"}])

    client.http._client = RecordingTransport()
    context = real_context()
    context.qstash_client = client
    with pytest.raises(WorkflowAbort):
        context.sleep("aguardar-onda-1", 120)

    assert len(calls) == 1
    assert calls[0]["headers"][FORWARDED] == BYPASS
    batch = json.loads(calls[0]["content"])
    assert len(batch) == 1
    assert batch[0]["headers"][FORWARDED] == BYPASS
    assert batch[0]["headers"]["Upstash-Delay"] == "120s"
    assert batch[0]["destination"] == URL
    assert BYPASS not in json.dumps(batch[0]["body"])


def test_qstash_client_falha_fechada_se_batch_invalido(configured):
    client = workflow._qstash_client(workflow._config())
    with pytest.raises(ValueError, match="batch QStash"):
        client.http.request(path="/v2/batch", body="not-json", method="POST")


def test_real_sdk_assinatura_valida_com_bypass_no_header(configured):
    receiver = Receiver(
        current_signing_key=CURRENT_KEY, next_signing_key=NEXT_KEY
    )
    body = json.dumps(payload())
    # O header de bypass não participa da assinatura: o Receiver continua
    # validando o corpo exatamente como antes.
    receiver.verify(signature=signed(body, CURRENT_KEY, url=URL), body=body)
    with pytest.raises(Exception):
        receiver.verify(signature=signed(body, "wrong-key-with-at-least-32-bytes", url=URL), body=body)
