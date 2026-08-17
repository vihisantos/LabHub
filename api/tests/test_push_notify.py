"""Teste de regressão do fix de VAPID_CLAIMS no push_notify.

O pywebpush MUTA o dict de claims (adiciona `aud` e `exp`) na primeira chamada.
Se o push_notify passasse o global VAPID_CLAIMS, o `aud` do primeiro endpoint
(Ex.: https://fcm.googleapis.com) vazaria para todos os envios seguintes —
causando 403 BadJwtToken na Apple e "aud claim MUST include the origin" no FCM
quando o mesmo processo envia para os dois provedores (usuários com Chrome + Safari).
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"

FCM_SUB = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/testtoken123",
    "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
}
APPLE_SUB = {
    "endpoint": "https://web.push.apple.com/testtoken456",
    "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
}


@pytest.fixture(scope="module")
def rlab_module():
    spec = importlib.util.spec_from_file_location("reservalab_api_push", RESERVALAB_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["reservalab_api_push"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_push_notify_passa_copia_do_vapid_claims_por_envio(rlab_module, monkeypatch):
    """Cada envio recebe um dict proprio — o pywebpush muta aud/exp na copia,
    sem contaminar o global nem os envios seguintes."""
    calls = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)

    assert rlab_module.push_notify(FCM_SUB, "titulo", "corpo") is True
    assert rlab_module.push_notify(APPLE_SUB, "titulo", "corpo") is True

    assert len(calls) == 2
    # Nenhuma chamada pode receber o global (que seria mutado pelo pywebpush)
    for c in calls:
        assert c["vapid_claims"] is not rlab_module.VAPID_CLAIMS
    # Os dois envios nao podem compartilhar o mesmo dict
    assert calls[0]["vapid_claims"] is not calls[1]["vapid_claims"]
    # O global permanece intocado (sem aud/exp vazando)
    assert "aud" not in rlab_module.VAPID_CLAIMS
    assert "exp" not in rlab_module.VAPID_CLAIMS


def test_push_notify_repassa_payload_e_ttl(rlab_module, monkeypatch):
    calls = []
    monkeypatch.setattr(rlab_module, "webpush", lambda **kw: calls.append(kw))

    rlab_module.push_notify(FCM_SUB, "Novo chamado #42", "Sala 1", url="/chamados/x", user_id="u1")

    assert len(calls) == 1
    c = calls[0]
    assert c["subscription_info"] == FCM_SUB
    assert c["ttl"] == 86400
    payload = __import__("json").loads(c["data"])
    assert payload["title"] == "Novo chamado #42"
    assert payload["body"] == "Sala 1"
    assert payload["url"] == "/chamados/x"
    assert payload["userId"] == "u1"


class FakeRedis:
    """Mini fake do upstash_redis.Redis: guarda membros e registra srem."""

    def __init__(self, members=None):
        self.members = set(members or [])
        self.removed = []

    def smembers(self, key):
        return set(self.members)

    def sadd(self, key, value):
        self.members.add(value)

    def srem(self, key, value):
        if value in self.members:
            self.members.remove(value)
            self.removed.append(value)
            return 1
        return 0

    def delete(self, key):
        self.members = set()


def _raise_http(status_code):
    from pywebpush import WebPushException

    class FakeResp:
        pass

    def boom(**kwargs):
        resp = FakeResp()
        resp.status_code = status_code
        raise WebPushException("Push failed", response=resp)

    return boom


def test_push_notify_remove_inscricao_410_do_redis(rlab_module, monkeypatch):
    """410 Gone (inscrição expirada) deve remover a inscrição do Redis."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(410))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") is False
    assert fake.removed == [json.dumps(FCM_SUB, ensure_ascii=False)]
    assert fake.members == set()


def test_push_notify_remove_inscricao_404_do_redis(rlab_module, monkeypatch):
    """404 (endpoint removido) também deve limpar a inscrição."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(404))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") is False
    assert fake.removed == [json.dumps(FCM_SUB, ensure_ascii=False)]


def test_push_notify_nao_remove_em_erro_nao_410(rlab_module, monkeypatch):
    """Erros de auth (403) ou genéricos NÃO podem remover a inscrição."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(403))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") is False
    assert fake.removed == []
    assert fake.members == {json.dumps(FCM_SUB, ensure_ascii=False)}


def test_push_notify_sem_redis_nao_quebra_em_410(rlab_module, monkeypatch):
    """Sem Redis configurado, 410 não pode derrubar o envio dos demais."""
    monkeypatch.setattr(rlab_module, "redis", None)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(410))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") is False
