"""Testes de isolamento do push público por chamado (Sistema B).

Garante que:
- Push de Ticket A não chega para subscriptions de Ticket B
- Vários dispositivos do mesmo ticket recebem corretamente
- Vários chamados simultâneos permanecem isolados
- Deduplicação por endpoint continua funcionando
- Limite de CHAMADOS_SUBS_PER_TICKET é respeitado
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"


# ── Fake Redis com suporte a keys individuais ──────────────────────────────


class FakeRedis:
    """Fake Redis que diferencia entre keys (necessário para testes de isolamento)."""

    def __init__(self):
        self._store: dict[str, set[str]] = {}

    def smembers(self, key: str) -> set[str]:
        return set(self._store.get(key, set()))

    def sadd(self, key: str, value: str) -> int:
        if key not in self._store:
            self._store[key] = set()
        self._store[key].add(value)
        return 1

    def delete(self, key: str) -> int:
        if key in self._store:
            del self._store[key]
            return 1
        return 0

    def srem(self, key: str, value: str) -> int:
        if key in self._store and value in self._store[key]:
            self._store[key].discard(value)
            return 1
        return 0


# ── Helpers ────────────────────────────────────────────────────────────────


def _sub(endpoint: str) -> dict:
    """Cria uma subscription fictícia com o endpoint dado."""
    return {
        "key": f"k-{endpoint}",
        "endpoint": endpoint,
        "expirationTime": None,
        "keys": {"p256dh": "fake", "auth": "fake"},
    }


def _sub_json(endpoint: str) -> str:
    """Subscription JSON para armazenamento no Redis."""
    return json.dumps(_sub(endpoint), ensure_ascii=False)


# ── Fixture: módulo api/app.py ────────────────────────────────────────────


@pytest.fixture(scope="module")
def api_module():
    # Reutiliza o módulo já carregado por outros testes (scope="session")
    # para evitar reimportar api/app.py (Flask rejeita @app.route após primeiro request).
    for existing in ("chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            return sys.modules[existing]
    spec = importlib.util.spec_from_file_location("chamados_api", API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["chamados_api"] = mod
    spec.loader.exec_module(mod)
    return mod


# ── Teste 1: Isolamento básico ────────────────────────────────────────────


def test_isolamento_basico(api_module, monkeypatch):
    """Ticket A e B têm subscriptions independentes. Resolver A não afeta B."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    # Registra subscriptions
    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1")])

    subs_a = api_module._chamado_subs("ticket-a")
    subs_b = api_module._chamado_subs("ticket-b")

    assert len(subs_a) == 1
    assert subs_a[0]["endpoint"] == "https://fcm/a1"

    assert len(subs_b) == 1
    assert subs_b[0]["endpoint"] == "https://fcm/b1"


def test_isolamento_resolver_a_nao_afeta_b(api_module, monkeypatch):
    """Resolver Ticket A e limpar suas subscriptions não afeta Ticket B."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1")])

    # Simula limpeza pós-push: mantém apenas subs de A (vazio = todas falharam)
    api_module._save_chamado_subs("ticket-a", [])

    subs_a = api_module._chamado_subs("ticket-a")
    subs_b = api_module._chamado_subs("ticket-b")

    assert len(subs_a) == 0
    assert len(subs_b) == 1
    assert subs_b[0]["endpoint"] == "https://fcm/b1"


# ── Teste 2: Múltiplos dispositivos no mesmo chamado ──────────────────────


def test_multiplas_devices_no_mesmo_chamado(api_module, monkeypatch):
    """Três dispositivos assinam o mesmo ticket — todos recebem."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-x", [
        _sub("https://fcm/x1"),
        _sub("https://fcm/x2"),
        _sub("https://fcm/x3"),
    ])

    subs = api_module._chamado_subs("ticket-x")
    endpoints = sorted(s["endpoint"] for s in subs)

    assert len(subs) == 3
    assert endpoints == ["https://fcm/x1", "https://fcm/x2", "https://fcm/x3"]


def test_multiplas_devices_envio_simula(api_module, monkeypatch):
    """Simula envio: todos os dispositivos do ticket recebem push."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-x", [
        _sub("https://fcm/x1"),
        _sub("https://fcm/x2"),
        _sub("https://fcm/x3"),
    ])

    sent = []

    def fake_push(sub, title, body, url="/"):
        sent.append(sub["endpoint"])
        return True

    monkeypatch.setattr(api_module, "push_notify", fake_push)

    subs = api_module._chamado_subs("ticket-x")
    for sub in subs:
        api_module.push_notify(sub, "Teste", "Corpo")

    assert sorted(sent) == ["https://fcm/x1", "https://fcm/x2", "https://fcm/x3"]


# ── Teste 3: Vários chamados simultâneos ──────────────────────────────────


def test_varios_chamados_simultaneos(api_module, monkeypatch):
    """Três tickets com subscriptions independentes permanecem isolados."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1"), _sub("https://fcm/a2")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1")])
    api_module._save_chamado_subs("ticket-c", [_sub("https://fcm/c1"), _sub("https://fcm/c2")])

    assert len(api_module._chamado_subs("ticket-a")) == 2
    assert len(api_module._chamado_subs("ticket-b")) == 1
    assert len(api_module._chamado_subs("ticket-c")) == 2


def test_resolver_b_nao_afeta_a_e_c(api_module, monkeypatch):
    """Resolver B e limpar suas subscriptions não afeta A nem C."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1"), _sub("https://fcm/a2")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1")])
    api_module._save_chamado_subs("ticket-c", [_sub("https://fcm/c1"), _sub("https://fcm/c2")])

    # Limpa subs de B (simula pós-push com falha)
    api_module._save_chamado_subs("ticket-b", [])

    assert len(api_module._chamado_subs("ticket-a")) == 2
    assert len(api_module._chamado_subs("ticket-b")) == 0
    assert len(api_module._chamado_subs("ticket-c")) == 2


# ── Teste 4: Isolamento bidirecional ──────────────────────────────────────


def test_isolamento_bidirecional(api_module, monkeypatch):
    """Resolver A e depois B — cada um só afeta suas próprias subscriptions."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1")])

    # Resolve A
    api_module._save_chamado_subs("ticket-a", [])
    assert len(api_module._chamado_subs("ticket-a")) == 0
    assert len(api_module._chamado_subs("ticket-b")) == 1

    # Resolve B
    api_module._save_chamado_subs("ticket-b", [])
    assert len(api_module._chamado_subs("ticket-a")) == 0
    assert len(api_module._chamado_subs("ticket-b")) == 0


def test_isolamento_bidirecional_com_multiplas_subs(api_module, monkeypatch):
    """Versão com múltiplas subscriptions por ticket."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1"), _sub("https://fcm/a2")])
    api_module._save_chamado_subs("ticket-b", [_sub("https://fcm/b1"), _sub("https://fcm/b2"), _sub("https://fcm/b3")])

    # Resolve A — mantém apenas A1
    api_module._save_chamado_subs("ticket-a", [_sub("https://fcm/a1")])

    assert len(api_module._chamado_subs("ticket-a")) == 1
    assert api_module._chamado_subs("ticket-a")[0]["endpoint"] == "https://fcm/a1"
    assert len(api_module._chamado_subs("ticket-b")) == 3

    # Resolve B
    api_module._save_chamado_subs("ticket-b", [])

    assert len(api_module._chamado_subs("ticket-a")) == 1
    assert len(api_module._chamado_subs("ticket-b")) == 0


# ── Teste 5: Deduplicação ────────────────────────────────────────────────


def test_deduplicacao_mesmo_endpoint(api_module, monkeypatch):
    """Duas inscrições com o mesmo endpoint para o mesmo ticket resultam em uma só."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-1", [_sub("https://fcm/duplicate")])
    api_module._save_chamado_subs("ticket-1", [_sub("https://fcm/duplicate")])

    subs = api_module._chamado_subs("ticket-1")
    assert len(subs) == 1
    assert subs[0]["endpoint"] == "https://fcm/duplicate"


def test_deduplicacao_endpoint_diferente_mesmo_ticket(api_module, monkeypatch):
    """Dois endpoints diferentes no mesmo ticket coexistem quando o route handler
    faz read→filter→append→save (como o chamados_subscribe faz)."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    # Simula o fluxo real do chamados_subscribe:
    # 1. Lê subs existentes
    existing = api_module._chamado_subs("ticket-1")
    # 2. Filtra endpoint duplicado (nenhum ainda)
    filtered = [s for s in existing if s.get("endpoint") != "https://fcm/dev1"]
    # 3. Adiciona nova sub
    filtered.append(_sub("https://fcm/dev1"))
    # 4. Salva
    api_module._save_chamado_subs("ticket-1", filtered)

    # Repete para dev2
    existing = api_module._chamado_subs("ticket-1")
    filtered = [s for s in existing if s.get("endpoint") != "https://fcm/dev2"]
    filtered.append(_sub("https://fcm/dev2"))
    api_module._save_chamado_subs("ticket-1", filtered)

    subs = api_module._chamado_subs("ticket-1")
    endpoints = sorted(s["endpoint"] for s in subs)
    assert len(subs) == 2
    assert endpoints == ["https://fcm/dev1", "https://fcm/dev2"]


def test_deduplicacao_endpoint_diferente_tickets_diferentes(api_module, monkeypatch):
    """Mesmo endpoint em tickets diferentes NÃO é deduplicado (isolamento por ticket)."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-1", [_sub("https://fcm/shared")])
    api_module._save_chamado_subs("ticket-2", [_sub("https://fcm/shared")])

    assert len(api_module._chamado_subs("ticket-1")) == 1
    assert len(api_module._chamado_subs("ticket-2")) == 1


# ── Teste 6: Limite de subscriptions ──────────────────────────────────────


def test_limite_10_subscriptions(api_module, monkeypatch):
    """Até 10 subscriptions são aceitas conforme CHAMADOS_SUBS_PER_TICKET."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    subs = [_sub(f"https://fcm/device-{i}") for i in range(10)]
    api_module._save_chamado_subs("ticket-limit", subs)

    result = api_module._chamado_subs("ticket-limit")
    assert len(result) == 10


def test_limite_11_subscriptions_nao_ultrapassa(api_module, monkeypatch):
    """A 11ª subscription não ultrapassa o limite de 10."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    subs = [_sub(f"https://fcm/device-{i}") for i in range(11)]
    api_module._save_chamado_subs("ticket-limit", subs)

    result = api_module._chamado_subs("ticket-limit")
    assert len(result) == 10


def test_limite_20_subscriptions_recorta_para_10(api_module, monkeypatch):
    """20 subscriptions resultam em apenas 10 (as 10 primeiras)."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    subs = [_sub(f"https://fcm/device-{i}") for i in range(20)]
    api_module._save_chamado_subs("ticket-limit", subs)

    result = api_module._chamado_subs("ticket-limit")
    assert len(result) == 10


# ── Teste: _notify_ticket_status integração ───────────────────────────────


def test_notify_ticket_status_somente_para_subs_do_chamado(api_module, monkeypatch):
    """_notify_ticket_status envia push apenas para as subscriptions do ticket resolvido."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-target", [_sub("https://fcm/target-1")])
    api_module._save_chamado_subs("ticket-other", [_sub("https://fcm/other-1")])

    sent = []

    def fake_push(sub, title, body, url="/"):
        sent.append(sub["endpoint"])
        return True

    monkeypatch.setattr(api_module, "push_notify", fake_push)

    ticket = {
        "id": "ticket-target",
        "ticketNumber": 42,
        "status": "resolvido",
        "statusNote": "",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
    }

    api_module._notify_ticket_status(ticket)

    assert sent == ["https://fcm/target-1"]


def test_notify_ticket_status_remove_subs_com_falha(api_module, monkeypatch):
    """Subscriptions que falham no push são removidas do Redis."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-1", [
        _sub("https://fcm/ok"),
        _sub("https://fcm/fail"),
    ])

    def fake_push(sub, title, body, url="/"):
        return sub["endpoint"] != "https://fcm/fail"

    monkeypatch.setattr(api_module, "push_notify", fake_push)

    ticket = {
        "id": "ticket-1",
        "ticketNumber": 1,
        "status": "resolvido",
        "statusNote": "",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
    }

    api_module._notify_ticket_status(ticket)

    remaining = api_module._chamado_subs("ticket-1")
    assert len(remaining) == 1
    assert remaining[0]["endpoint"] == "https://fcm/ok"


def test_notify_ticket_status_sem_subs_nao_envia(api_module, monkeypatch):
    """Sem subscriptions, _notify_ticket_status não tenta enviar push."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    sent = []
    monkeypatch.setattr(api_module, "push_notify", lambda *a, **kw: sent.append(1) or True)

    ticket = {
        "id": "ticket-empty",
        "ticketNumber": 99,
        "status": "resolvido",
        "statusNote": "",
        "roomName": "Sala 202",
        "problemCategory": "Projetor",
    }

    api_module._notify_ticket_status(ticket)

    assert sent == []


def test_notify_ticket_status_url_feedback_para_resolvido(api_module, monkeypatch):
    """Ticket resolvido gera push com URL de feedback."""
    redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", redis)

    api_module._save_chamado_subs("ticket-r", [_sub("https://fcm/r1")])

    sent = []

    def fake_push(sub, title, body, url="/"):
        sent.append({"title": title, "body": body, "url": url})
        return True

    monkeypatch.setattr(api_module, "push_notify", fake_push)

    ticket = {
        "id": "ticket-r",
        "ticketNumber": 7,
        "status": "resolvido",
        "statusNote": "",
        "roomName": "Sala 303",
        "problemCategory": "Impressora",
    }

    api_module._notify_ticket_status(ticket)

    assert len(sent) == 1
    assert "/chamados-publico/feedback/ticket-r" in sent[0]["url"]
    assert "⭐" in sent[0]["title"]
