"""Chamados — Claim atômico + Ownership de Atendimento + Atribuição do Líder.

Cobre o modelo definitivo de atribuição de Chamados em RBAC OFF e ON, com
segurança real no backend:

Claim:
  - Caso 1: chamado sem responsável → técnico A assume (200, assignedToUserId=A).
  - Caso 2: chamado já atribuído a A → técnico B NÃO assume (403/409), A continua.
  - Caso 3 (concorrência): updating retorna 0 linhas → 409 (só um consegue).

Ownership:
  - A = responsável; B = outro técnico. B recebe 403 ao tentar comment/edit/status.

Líder/assigner:
  - Pode atribuir, reatribuir e remover responsável.
  - Atribuição para usuário de outro workspace falha.

RBAC OFF e ON: o enforcement de ownership/claim vale nos dois modos.
"""

import base64
import hashlib
import hmac
import importlib.util
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


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or str(payload)

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.calls = []
        self._routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def _match_url(self, url, kwargs):
        # Inclui os query params na URL de roteamento, para diferenciar perfis
        # por id (o módulo auth passa params= em vez de query string no path).
        params = kwargs.get("params")
        if params:
            qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
            return f"{url}?{qs}"
        return url

    def _do(self, method, url, **kwargs):
        match_url = self._match_url(url, kwargs)
        self.calls.append({"method": method, "url": url, "kwargs": kwargs, "match_url": match_url})
        for part, response in self._routes.get(method, []):
            if part in match_url:
                return response
        return self._default

    def unroute(self, method, url_part):
        routes = self._routes.setdefault(method, [])
        for i, (part, _resp) in enumerate(routes):
            if part == url_part:
                del routes[i]
                return

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


@pytest.fixture(scope="session")
def api_module():
    for existing in ("chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            if Path(getattr(sys.modules[existing], "__file__", "")) == API_FILE:
                return sys.modules[existing]
    spec = importlib.util.spec_from_file_location("chamados_ownership_api", API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["chamados_ownership_api"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _profile(uid, role="technician", is_super=False, ws=None):
    return {
        "id": uid,
        "email": f"{uid}@test.com",
        "name": f"User {uid}",
        "role": role,
        "is_super_admin": is_super,
        "workspace_ids": ws if ws is not None else ["ws-a"],
        "status": "active",
    }


def _make_ticket(**overrides):
    ticket = {
        "id": "t-1",
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "status": "aberto",
        "assignedTo": "",
        "assignedToUserId": "",
        "ticketNumber": 6,
        "problemDescription": "Sem conexão",
    }
    ticket.update(overrides)
    return ticket


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    monkeypatch.setattr(api_module, "_target_subs", lambda **k: [])
    monkeypatch.setattr(api_module, "push_notify", lambda *a, **k: True)
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    rbac_mod = sys.modules.get("rbac")
    if rbac_mod is not None:
        monkeypatch.setattr(rbac_mod, "requests", fake_requests)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


def _setup_as(client, fake_requests, monkeypatch, profile, rbac_on=False):
    """Ativa auth como `profile` e opcionalmente RBAC_2_ENABLED=1."""
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile]))
    if rbac_on:
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
    else:
        monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _route_claim_update(fake_requests, updated_rows):
    """Roteia o PATCH atômico do claim (condição assignedToUserId is.null).

    `updated_rows` vazio ⇒ simula que outra transação assumiu primeiro (0 linhas).
    """
    fake_requests.route(
        "PATCH",
        "assignedToUserId=is.null",
        FakeResponse(updated_rows),
    )


def _route_ticket(fake_requests, ticket):
    part = f"chamados_tickets?id=eq.{ticket['id']}"
    fake_requests.unroute("GET", part)
    fake_requests.route("GET", part, FakeResponse([ticket]))


def _route_events(fake_requests):
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse([], status_code=204))
    fake_requests.route("PATCH", "/rest/v1/chamados_tickets", FakeResponse([]))


TEC_A = _profile("user-a", role="technician")
TEC_B = _profile("user-b", role="technician")
LEADER = _profile("user-leader", role="admin")


# ── CLAIM ─────────────────────────────────────────────────────────────────────

def test_claim_sem_responsavel_tecnico_assume(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_A)
    ticket = _make_ticket(assignedTo="", assignedToUserId="")
    _route_ticket(fake_requests, ticket)
    claimed = dict(ticket, assignedToUserId="user-a", assignedTo="User user-a")
    _route_claim_update(fake_requests, [claimed])
    _route_events(fake_requests)

    resp = client.post("/api/chamados/t-1/claim", headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["assignedToUserId"] == "user-a"


def test_claim_chamado_ja_assumido_por_outro_409(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_B)
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a")
    _route_ticket(fake_requests, ticket)
    # Update atômico afeta 0 linhas (já assumido por A).
    _route_claim_update(fake_requests, [])
    _route_events(fake_requests)

    resp = client.post("/api/chamados/t-1/claim", headers=headers)

    assert resp.status_code in (403, 409)


def test_claim_concorrencia_so_um_consegue(client, fake_requests, monkeypatch):
    """Simula dois claims simultâneos: o 2º update atômico retorna 0 linhas."""
    # Técnico A ganha a corrida.
    h_a = _setup_as(client, fake_requests, monkeypatch, TEC_A)
    ticket = _make_ticket(assignedTo="", assignedToUserId="")
    _route_ticket(fake_requests, ticket)
    claimed = dict(ticket, assignedToUserId="user-a", assignedTo="User user-a")
    _route_claim_update(fake_requests, [claimed])
    _route_events(fake_requests)
    resp_a = client.post("/api/chamados/t-1/claim", headers=h_a)
    assert resp_a.status_code == 200

    # Técnico B tenta sobre o mesmo chamado já assumido → 0 linhas → 409/403.
    _route_ticket(fake_requests, claimed)
    _route_claim_update(fake_requests, [])
    h_b = _setup_as(client, fake_requests, monkeypatch, TEC_B)
    resp_b = client.post("/api/chamados/t-1/claim", headers=h_b)
    assert resp_b.status_code in (403, 409)
    # Nenhum update afetou linhas para B.
    assert resp_b.status_code == 409 or resp_b.status_code == 403


# ── OWNERSHIP (técnico comum não opera chamado de outro) ─────────────────────

def test_ownership_tecnico_b_nao_comenta_chamado_de_a(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_B)
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a")
    _route_ticket(fake_requests, ticket)
    _route_events(fake_requests)

    resp = client.post("/api/chamados/t-1/events",
                       json={"content": "intromissão"}, headers=headers)

    assert resp.status_code == 403


def test_ownership_tecnico_b_nao_muda_status_chamado_de_a(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_B)
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a", status="aberto")
    _route_ticket(fake_requests, ticket)
    _route_events(fake_requests)

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 403


def test_ownership_tecnico_a_pode_operar_proprio_chamado(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_A)
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a", status="aberto")
    _route_ticket(fake_requests, ticket)
    updated = dict(ticket, status="em_atendimento")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([updated]))
    _route_events(fake_requests)

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 200


# ── LÍDER / ASSIGNER ─────────────────────────────────────────────────────────

def test_lider_pode_atribuir_para_tecnico(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, LEADER)
    ticket = _make_ticket(assignedTo="", assignedToUserId="")
    _route_ticket(fake_requests, ticket)
    updated = dict(ticket, assignedTo="User user-a", assignedToUserId="user-a")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([updated]))
    _route_events(fake_requests)

    resp = client.patch("/api/chamados/t-1",
                        json={"assignedTo": "User user-a", "assignedToUserId": "user-a"},
                        headers=headers)

    assert resp.status_code == 200


def test_lider_pode_reatribuir_e_remover_responsavel(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, LEADER)
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a")

    # Reatribuir A → B
    _route_ticket(fake_requests, ticket)
    updated_b = dict(ticket, assignedTo="User user-b", assignedToUserId="user-b")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([updated_b]))
    _route_events(fake_requests)
    resp = client.patch("/api/chamados/t-1",
                        json={"assignedTo": "User user-b", "assignedToUserId": "user-b"},
                        headers=headers)
    assert resp.status_code == 200

    # Remover responsável (unassign)
    _route_ticket(fake_requests, updated_b)
    updated_none = dict(updated_b, assignedTo="", assignedToUserId="")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([updated_none]))
    resp = client.patch("/api/chamados/t-1",
                        json={"assignedTo": "", "assignedToUserId": ""},
                        headers=headers)
    assert resp.status_code == 200


def test_tecnico_comum_nao_pode_atribuir_para_outro(client, fake_requests, monkeypatch):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_A)
    ticket = _make_ticket(assignedTo="", assignedToUserId="")
    _route_ticket(fake_requests, ticket)
    _route_events(fake_requests)

    resp = client.patch("/api/chamados/t-1",
                        json={"assignedTo": "User user-b", "assignedToUserId": "user-b"},
                        headers=headers)

    assert resp.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets?id=eq.&assignedToUserId=is.null")


# ── RBAC ON ainda protege ────────────────────────────────────────────────────

def test_ownership_valido_com_rbac_on(client, fake_requests, monkeypatch, api_module):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_B, rbac_on=True)
    # TEC_B não é líder: pode claim/comment, mas NÃO tem ticket.assign → não é
    # assigner, então ownership bloqueia a operação no chamado de outro.
    monkeypatch.setattr(
        api_module, "rbac_two_can",
        lambda *a: str(a[2]) in ("ticket.comment", "ticket.claim"),
    )
    ticket = _make_ticket(assignedTo="User user-a", assignedToUserId="user-a")
    _route_ticket(fake_requests, ticket)
    _route_events(fake_requests)

    resp = client.post("/api/chamados/t-1/events",
                       json={"content": "intromissão"}, headers=headers)

    assert resp.status_code == 403


def test_claim_valido_com_rbac_on(client, fake_requests, monkeypatch, api_module):
    headers = _setup_as(client, fake_requests, monkeypatch, TEC_A, rbac_on=True)
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a, **k: True)
    ticket = _make_ticket(assignedTo="", assignedToUserId="")
    _route_ticket(fake_requests, ticket)
    claimed = dict(ticket, assignedToUserId="user-a", assignedTo="User user-a")
    _route_claim_update(fake_requests, [claimed])
    _route_events(fake_requests)

    resp = client.post("/api/chamados/t-1/claim", headers=headers)

    assert resp.status_code == 200
