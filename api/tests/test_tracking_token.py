"""Testes do tracking token (Trilha B1) — acesso público limitado a um chamado.

O tracking token é a credencial anônima do professor: criptograficamente
aleatória, somente o hash SHA-256 é armazenado, e o acesso fica limitado a UM
único chamado via endpoints /api/public/chamados/<token>. O RLS permanece
fechado; o backend Flask é a única porta pública.
"""
import importlib.util
import base64
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


SUPER_ADMIN_PROFILE = {
    "id": "user-1",
    "email": "test@test.com",
    "name": "Test User",
    "role": "technician",
    "is_super_admin": True,
    "workspace_ids": ["ws-a"],
    "status": "active",
}


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.calls = []
        self._routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for part, response in self._routes.get(method, []):
            if part in url:
                return response
        return self._default

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._do("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


class FakeRedis:
    def __init__(self, members=None):
        self.members = list(members or [])
        self.sadds = []
        self.deleted = []

    def smembers(self, key):
        return list(self.members)

    def sadd(self, key, value):
        self.sadds.append((key, value))
        self.members.append(value)

    def delete(self, key):
        self.deleted.append(key)


@pytest.fixture(scope="session")
def api_module():
    for existing in ("chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            if Path(getattr(sys.modules[existing], "__file__", "")) == API_FILE:
                return sys.modules[existing]
    spec = importlib.util.spec_from_file_location("chamados_api", API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["chamados_api"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    # Zera o rate limit do tracking para não vazar estado entre os testes.
    api_module._TRACKING_RATE_STORE.clear()
    return api_module.app.test_client()


# ── helpers ────────────────────────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _auth_headers():
    return {"Authorization": f"Bearer {_make_jwt({'sub': 'user-1'})}"}


def _valid_payload(**overrides):
    payload = {
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "reportedBy": "Prof. Maria",
        "problemArea": "academica",
        "problemCategory": "Internet",
        "problemDescription": "Sem conexão",
    }
    payload.update(overrides)
    return payload


def _make_ticket(tid="ticket-A", ws="ws-a", status="aberto", **overrides):
    ticket = {
        "id": tid,
        "workspace_id": ws,
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Sem conexão",
        "status": status,
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "",
        "assignedTo": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
        "ticketNumber": 10,
        "photos": "",
        "createdAt": "2026-06-25T12:00:00Z",
        "updatedAt": "2026-06-25T12:00:00Z",
        "closedAt": None,
        "tracking_token_hash": "hash-fixo-para-teste",
    }
    ticket.update(overrides)
    return ticket


def _route_token_lookup(fake_requests, token, tid="ticket-A", ws="ws-a", status="aberto"):
    """Roteia a consulta do decorator (por hash). Retorna o registro mínimo."""
    h = _hash(token)
    fake_requests.route(
        "GET",
        f"chamados_tickets?tracking_token_hash=eq.{h}&select=id,workspace_id,status",
        FakeResponse([{"id": tid, "workspace_id": ws, "status": status}]),
    )


def _route_ticket_full(fake_requests, ticket, select="*"):
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{ticket['id']}&select={select}",
        FakeResponse([ticket]),
    )


def _route_events(fake_requests, tid, events):
    fake_requests.route(
        "GET",
        f"ticket_events?ticket_id=eq.{tid}",
        FakeResponse(events),
    )


def _route_patch(fake_requests, ticket):
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{ticket['id']}",
        FakeResponse([ticket]),
    )


def _route_workspace_ok(fake_requests):
    fake_requests.route(
        "GET",
        "/rest/v1/workspaces",
        FakeResponse([{"id": "ws-a", "name": "Campus A", "slug": "a", "location": "X", "disabled_apps": []}]),
    )


def _route_ticket_number(fake_requests, last=9):
    fake_requests.route(
        "GET",
        "chamados_tickets?select=ticketNumber",
        FakeResponse([{"ticketNumber": last}]),
    )


def _route_create_insert(fake_requests, ticket):
    fake_requests.route("POST", "/rest/v1/chamados_tickets", FakeResponse([ticket]))


def _sub(endpoint="https://fcm.example/push/x"):
    return {"endpoint": endpoint, "expirationTime": None, "keys": {"p256dh": "a", "auth": "b"}}


# ── B1.2 — criação devolve o tracking token (só na criação) ─────────────────

def test_create_retorna_tracking_token_e_nao_persiste_token_cru(client, fake_requests):
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([SUPER_ADMIN_PROFILE]))
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=9)
    created = _make_ticket(tid="ticket-A", ticketNumber=10)
    _route_create_insert(fake_requests, created)

    resp = client.post("/api/chamados", json=_valid_payload(), headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.get_json()
    token = data.get("tracking_token")
    assert token and len(token) >= 20, "deve devolver um token aleatório"
    # O INSERT deve conter apenas o hash, nunca o token cru
    insert = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert insert.get("tracking_token_hash") == _hash(token)
    assert "tracking_token" not in insert, "token cru não deve ir ao banco"
    # O mock inclui o hash na linha persistida; mesmo assim a resposta do ticket
    # NÃO pode expô-lo: é segredo interno usado só na autenticação por token.
    assert "tracking_token_hash" not in data["ticket"]
    # Repetir requisições de leitura não devolve o token (ele só existe na criação)
    assert "tracking_token" not in data["ticket"]


# ── B1.3/B1.10 — autenticação por token ────────────────────────────────────

def test_token_valido_permite_ver_proprio_ticket(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/segredo-token-A")
    assert r.status_code == 200
    assert r.get_json()["ticket"]["id"] == "ticket-A"


def test_header_token_tambem_valido(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/irrelevante", headers={"X-Tracking-Token": "segredo-token-A"})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["id"] == "ticket-A"


def test_token_invalido_denegado(client, fake_requests):
    # Nenhuma rota de lookup por hash do token inválido existe -> retorna vazio
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))
    r = client.get("/api/public/chamados/invalido")
    assert r.status_code == 403


def test_token_alterado_denegado(client, fake_requests):
    # Token original existe, mas com um caractere a mais/trocado -> hash diferente
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/segredo-token-A-alterado")
    assert r.status_code == 403


def test_token_truncado_denegado(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/segredo-tok")
    assert r.status_code == 403


def test_token_vazio_denegado(client, fake_requests):
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))
    r = client.get("/api/public/chamados/")
    assert r.status_code in (403, 404)


def test_token_nao_aceito_por_query_string(client, fake_requests):
    # O token NÃO deve ser aceito via query string (evita vazar segredo na URL).
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/x?token=segredo-token-A")
    # path tem token "x" (inválido) e query token é ignorado -> 403
    assert r.status_code == 403


def test_token_a_nao_acessa_ticket_b(client, fake_requests):
    # Token A aponta para ticket-A; o endpoint usa g.tracking_ticket["id"] = ticket-A
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    r = client.get("/api/public/chamados/segredo-token-A")
    data = r.get_json()
    assert data["ticket"]["id"] == "ticket-A"
    # Não há como o cliente forçar o ticket B: o id vem do token.
    assert data["ticket"]["id"] != "ticket-B"


# ── B1.5 — projeção segura (não expõe campos internos) ─────────────────────

def test_detail_nao_expoe_campos_internos(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(
        fake_requests,
        _make_ticket(tid="ticket-A", reportedByEmail="int@x.com", assignedTo="Tec"),
    )

    r = client.get("/api/public/chamados/segredo-token-A")
    body = r.get_json()["ticket"]
    for campo in ("reportedByEmail", "assignedTo", "workspace_id", "tracking_token_hash"):
        assert campo not in body, f"não deve expor {campo}"


# ── B1.6 — eventos ─────────────────────────────────────────────────────────

def test_events_retornam_somente_ticket_a(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_events(fake_requests, "ticket-A", [
        {"id": "ev-1", "type": "status", "content": "Técnico a caminho", "author": "Sistema",
         "photo_urls": '["https://res.cloudinary.com/x/image/upload/v1/a.jpg"]', "createdAt": "2026-06-25T12:05:00Z"},
    ])

    r = client.get("/api/public/chamados/segredo-token-A/events")
    assert r.status_code == 200
    events = r.get_json()["events"]
    assert len(events) == 1
    assert events[0]["id"] == "ev-1"
    # A consulta no banco usa o id vindo do token (ticket-A), não o do cliente
    qs = fake_requests.calls_for("GET", "ticket_events")[0]["url"]
    assert "ticket_id=eq.ticket-A" in qs

    # Fotos retornam apenas quando pertencem a esse ticket (já filtrado pelo id)
    assert events[0]["photos"][0].startswith("https://res.cloudinary.com/")


# ── B1.7 — feedback ────────────────────────────────────────────────────────

def test_feedback_token_a_permite_quando_resolvido(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="resolvido")
    current = _make_ticket(tid="ticket-A", status="resolvido", resolvedAt="2026-06-25T12:05:00Z")
    _route_ticket_full(fake_requests, current, select="status,feedbackRating")
    updated = _make_ticket(tid="ticket-A", status="resolvido", feedbackRating=5, feedbackComment="Ótimo")
    _route_patch(fake_requests, updated)

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"rating": 5, "comment": "Ótimo"}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 200
    assert r.get_json()["ticket"]["feedbackRating"] == 5


def test_feedback_token_a_nao_permite_ticket_b(client, fake_requests):
    # Token A valida em ticket-A; o PATCH de feedback vai para ?id=eq.ticket-A (nunca B)
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="resolvido")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", status="resolvido"),
                       select="status,feedbackRating")
    updated = _make_ticket(tid="ticket-A", status="resolvido", feedbackRating=4)
    _route_patch(fake_requests, updated)

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"rating": 4, "ticket_id": "ticket-B", "workspace_id": "ws-b"})

    assert r.status_code == 200
    # O PATCH foi direcionado a ticket-A (derivado do token), ignorando ticket_id do body
    patch = fake_requests.calls_for("PATCH", "chamados_tickets?id=eq.ticket-A")
    assert len(patch) == 1
    assert "ticket-B" not in [c["url"] for c in fake_requests.calls_for("PATCH", "chamados_tickets")]
    # O body não conseguiu alterar campos administrativos
    patch_body = patch[0]["kwargs"]["json"]
    assert "workspace_id" not in patch_body
    assert "status" not in patch_body


def test_feedback_antes_de_resolvido_denegado(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="aberto")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", status="aberto"),
                       select="status,feedbackRating")

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"rating": 5}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 403


def test_feedback_segunda_vez_retorna_409(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="fechado")
    _route_ticket_full(
        fake_requests,
        _make_ticket(tid="ticket-A", status="fechado", feedbackRating=4),
        select="status,feedbackRating",
    )

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"rating": 3}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 409


@pytest.mark.parametrize("rating", [0, 6, -1, 10])
def test_feedback_rating_invalido_denegado(client, fake_requests, rating):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="resolvido")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", status="resolvido"),
                       select="status,feedbackRating")

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"rating": rating}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 400


def test_feedback_sem_rating_denegado(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="resolvido")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", status="resolvido"),
                       select="status,feedbackRating")

    r = client.post("/api/public/chamados/segredo-token-A/feedback",
                    json={"comment": "ok"}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 400


# ── B1.8 — subscribe ───────────────────────────────────────────────────────

def test_subscribe_token_a_associa_ao_proprio_chamado(client, fake_requests, api_module, monkeypatch):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    fake_redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", fake_redis)

    r = client.post("/api/public/chamados/segredo-token-A/subscribe", json=_sub(),
                    headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 200
    # A subscription foi gravada sob a chave do ticket-A (derivado do token)
    assert any(k == "push:chamado:ticket-A" for k, _ in fake_redis.sadds)


def test_subscribe_token_a_nao_associa_ticket_b(client, fake_requests, api_module, monkeypatch):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    fake_redis = FakeRedis()
    monkeypatch.setattr(api_module, "redis", fake_redis)

    r = client.post("/api/public/chamados/segredo-token-A/subscribe",
                    json={**_sub(), "ticket_id": "ticket-B"},
                    headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 200
    keys = {k for k, _ in fake_redis.sadds}
    assert keys == {"push:chamado:ticket-A"}, "o body não pode mudar o alvo da subscription"


def test_subscribe_sem_redis_retorna_500(client, fake_requests, api_module, monkeypatch):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    monkeypatch.setattr(api_module, "redis", None)

    r = client.post("/api/public/chamados/segredo-token-A/subscribe", json=_sub(),
                    headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 500


def test_subscribe_sem_endpoint_retorna_400(client, fake_requests, api_module, monkeypatch):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    monkeypatch.setattr(api_module, "redis", FakeRedis())

    r = client.post("/api/public/chamados/segredo-token-A/subscribe",
                    json={"keys": {}}, headers={"X-Tracking-Token": "segredo-token-A"})

    assert r.status_code == 400


# ── B1.9/B1.13 — token não concede outras operações (POST/PATCH/DELETE/admin) ──

def test_token_nao_permite_patch_de_ticket(client):
    # PATCH em /api/chamados/<id> exige @require_auth (não o tracking token)
    r = client.patch("/api/chamados/ticket-A", json={"status": "fechado"})
    assert r.status_code in (401, 403)


def test_token_nao_permite_delete_de_ticket(client):
    r = client.delete("/api/chamados/ticket-A")
    assert r.status_code in (401, 403)


def test_token_nao_permite_endpoint_admin(client):
    # /api/admin/backups exige @require_admin; o tracking token não é suficiente
    r = client.get("/api/admin/backups")
    assert r.status_code in (401, 403)


# ── B1.10 — anti-enumeração ────────────────────────────────────────────────

def test_token_invalido_nao_revela_informacoes(client, fake_requests):
    # Diferentes tokens inválidos produzem a MESMA resposta genérica 403.
    respostas = set()
    for i in range(3):
        r = client.get(f"/api/public/chamados/inexistente-{i}")
        respostas.add((r.status_code, r.get_json().get("error")))
    assert len(respostas) == 1, "não pode distinguir token inexistente/ticket inexistente/inválido"
    assert respostas == {(403, "Tracking token inválido")}


def test_hash_nunca_aparece_em_respostas(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", photos="", reportedBy="Prof"))
    _route_events(fake_requests, "ticket-A", [])

    for path in ("", "/events"):
        r = client.get(f"/api/public/chamados/segredo-token-A{path}")
        assert "tracking_token_hash" not in r.get_data(as_text=True)
        assert _hash("segredo-token-A") not in r.get_data(as_text=True)


# ── B1.4 — rate limit ──────────────────────────────────────────────────────

def test_rate_limit_retorna_429_apos_limite(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    # Consome o limite na janela (mesmo IP + mesmo token)
    for _ in range(30):
        client.get("/api/public/chamados/segredo-token-A")
    r = client.get("/api/public/chamados/segredo-token-A")
    assert r.status_code == 429


def test_rate_limit_nao_compartilha_contador_entre_tokens(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_token_lookup(fake_requests, "segredo-token-B", tid="ticket-B")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    # Esgota o limite do token A (definido no lookup como ticket-A, mas basta esgotar a chave A)
    for _ in range(30):
        client.get("/api/public/chamados/segredo-token-A")
    # Token B tem hash diferente -> chave de rate limit diferente -> segue funcional
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-B"))
    r = client.get("/api/public/chamados/segredo-token-B")
    assert r.status_code == 200


def test_rate_limit_nao_compartilha_contador_entre_ips(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))

    for _ in range(30):
        client.get("/api/public/chamados/segredo-token-A",
                   environ_overrides={"REMOTE_ADDR": "10.0.0.1"})
    # Mesmo token, IP diferente -> chave diferente -> segue funcional
    r = client.get("/api/public/chamados/segredo-token-A",
                   environ_overrides={"REMOTE_ADDR": "10.0.0.2"})
    assert r.status_code == 200


# ── B2/B5 — acesso anônimo por UUID eliminado ──────────────────────────────

def test_feedback_anonymo_por_uuid_nao_existe(client):
    # O endpoint antigo POST /api/chamados/<id>/feedback (acesso anônimo por
    # UUID, sem token) foi removido. Não deve existir mais rota anônima.
    r = client.post("/api/chamados/ticket-A/feedback", json={"rating": 5})
    assert r.status_code == 404


def test_subscribe_anonymo_por_uuid_nao_existe(client):
    # O endpoint antigo POST /api/chamados/<id>/subscribe (acesso anônimo por
    # UUID, sem token) foi removido. Não deve existir mais rota anônima.
    r = client.post("/api/chamados/ticket-A/subscribe", json={"endpoint": "https://fcm/x"})
    assert r.status_code == 404


def test_ticket_id_unico_nao_produz_acesso_anonimo(client, fake_requests):
    # Um UUID de chamado NÃO dá acesso sozinho: sem token, o chamado (mesmo
    # que exista) não é exposto em nenhuma rota pública.
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A"))
    assert client.get("/api/public/chamados/ticket-A").status_code == 403


def test_ticket_id_nao_surfa_o_token_em_events(client, fake_requests):
    # Mesmo informando um ticket_id diferente no query/body, o token só expõe
    # o chamado que ele autoriza (ticket-A).
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A")
    _route_events(fake_requests, "ticket-A", [
        {"id": "ev-1", "type": "status", "content": "x", "author": "Sistema",
         "photo_urls": "[]", "createdAt": "2026-06-25T12:05:00Z"},
    ])
    r = client.get("/api/public/chamados/segredo-token-A/events?ticket_id=ticket-B")
    assert r.status_code == 200
    events = r.get_json()["events"]
    assert len(events) == 1 and events[0]["id"] == "ev-1"


def test_feedback_body_nao_muda_quem_avalia(client, fake_requests):
    _route_token_lookup(fake_requests, "segredo-token-A", tid="ticket-A", status="resolvido")
    _route_ticket_full(fake_requests, _make_ticket(tid="ticket-A", status="resolvido"),
                       select="status,feedbackRating")
    updated = _make_ticket(tid="ticket-A", status="resolvido", feedbackRating=5)
    _route_patch(fake_requests, updated)

    r = client.post("/api/public/chamados/segredo-token-A/feedback", json={
        "rating": 5, "comment": "ok",
        "reportedBy": "Hacker", "status": "aberto", "workspace_id": "ws-b",
    })

    assert r.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets?id=eq.ticket-A")
    assert len(patch) == 1
    patch_body = patch[0]["kwargs"]["json"]
    assert "reportedBy" not in patch_body
    assert "status" not in patch_body
    assert "workspace_id" not in patch_body
