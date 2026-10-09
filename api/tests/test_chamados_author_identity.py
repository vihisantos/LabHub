"""Chamados — P1 (issue #371): identidade confiável do autor nos eventos.

Regressão da autoria de eventos de STATUS e COMENTÁRIO em `api/app.py`:

Causa:
  O `author` gravado em `ticket_events` era derivado do BODY da requisição
  (`body.author`), ou seja: um técnico autenticado podia atribuir um comentário
  ou uma transição de status ao nome de QUALQUER outro usuário (spoofing de
  identidade na timeline).

Solução:
  O `author` agora vem do contexto confiável do servidor — `g.user['name']`,
  o perfil resolvido por `@require_auth` a partir do JWT (nunca do request).
  O campo `author` do payload continua sendo ACEITO (compatibilidade), mas NÃO
  é mais usado como identidade.

Verificações:
  - Comentário: payload tenta `author="Outro Técnico"` → evento gravado com o
    nome do perfil autenticado; ticket/workspace corretos; auditoria com o
    actor (id + nome) da sessão.
  - Status: payload tenta `author="Sistema"` → evento gravado com o nome do
    perfil autenticado.
  - Derivação POR usuário: dois técnicos distintos geram autores distintos.
  - Isolamento de unidade: quem não pertence ao workspace do chamado NÃO
    comenta (403) e nenhum evento é gravado.
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


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url(json.dumps({"exp": int(time.time()) + 3600, **payload}).encode())
    signing_input = f"{header}.{body}".encode()
    sig = _b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text

    def json(self):
        return self._payload


class FakeRequests:
    """Mesmo harness de test_chamados_authorization_hardening.py."""

    def __init__(self):
        self.routes = []
        self.calls = []

    def route(self, method, url_part, response):
        self.routes.append((method, url_part, response))

    def unroute(self, method, url_part):
        self.routes = [r for r in self.routes if not (r[0] == method and url_part in r[1])]

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]

    def _match(self, method, url, kwargs):
        params = kwargs.get("params")
        if params:
            qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
            url = f"{url}?{qs}"
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for m, part, resp in self.routes:
            if m == method and part in url:
                return resp
        raise AssertionError(f"sem rota mockada: {method} {url}")

    def get(self, url, **kwargs):
        return self._match("GET", url, kwargs)

    def post(self, url, **kwargs):
        return self._match("POST", url, kwargs)

    def patch(self, url, **kwargs):
        return self._match("PATCH", url, kwargs)

    def delete(self, url, **kwargs):
        return self._match("DELETE", url, kwargs)


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
    monkeypatch.setattr(api_module, "_target_subs", lambda **k: [])
    monkeypatch.setattr(api_module, "push_notify", lambda *a, **k: True)
    monkeypatch.setattr(api_module, "_cloudinary_destroy", lambda url: True)
    for name in ("auth", "rbac"):
        mod = sys.modules.get(name)
        if mod is not None:
            monkeypatch.setattr(mod, "requests", fake_requests)
            monkeypatch.setattr(mod, "_SUPABASE_URL", SUPABASE_URL)
            monkeypatch.setattr(mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    fake_requests.route("POST", "/rest/v1/rpc/pg_sql", FakeResponse([], status_code=200))
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


# ── helpers ──────────────────────────────────────────────────────────────────

TECH = {
    "id": "tech-1",
    "email": "tech@test.com",
    "name": "Tecnico",
    "role": "technician",
    "is_super_admin": False,
    "workspace_ids": ["ws-a"],
    "status": "active",
}

TECH_B = {
    "id": "tech-2",
    "email": "techb@test.com",
    "name": "Tecnico B",
    "role": "technician",
    "is_super_admin": False,
    "workspace_ids": ["ws-a"],
    "status": "active",
}

OUTSIDER = {
    "id": "tech-3",
    "email": "outsider@test.com",
    "name": "Tecnico Fora",
    "role": "technician",
    "is_super_admin": False,
    "workspace_ids": ["ws-b"],
    "status": "active",
}


def _auth_as(api_module, fake_requests, monkeypatch, profile, actions):
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile]))
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([
        {"profile_id": profile["id"], "workspace_id": w, "status": "active"}
        for w in (profile.get("workspace_ids") or [])
    ]))
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a: str(a[2]) in actions)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _ticket(**overrides):
    t = {
        "id": "t-1",
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "status": "aberto",
        "assignedTo": "",
        "assignedToUserId": "",
        "ticketNumber": 6,
        "problemDescription": "Sem conexao",
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "resolvedAt": None,
        "statusNote": "",
        "photos": "",
    }
    t.update(overrides)
    return t


def _route_ticket(fake_requests, ticket):
    part = f"chamados_tickets?id=eq.{ticket['id']}"
    fake_requests.unroute("GET", part)
    fake_requests.route("GET", part, FakeResponse([ticket]))


def _route_comment_writes(fake_requests):
    """Escritas da rota de comentário: ticket_events + app_audit_logs."""
    fake_requests.route("POST", "/rest/v1/ticket_events",
                        FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse([], status_code=204))


def _route_status_writes(fake_requests, updated=None):
    """Escritas do PATCH de status: PATCH condicional + ticket_events + rbac_audit."""
    fake_requests.route("PATCH", "chamados_tickets?id=eq.",
                        FakeResponse([updated] if updated else []))
    fake_requests.route("POST", "/rest/v1/ticket_events",
                        FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse([], status_code=204))


def _event_calls(fake_requests):
    return fake_requests.calls_for("POST", "/rest/v1/ticket_events")


def _audit_calls(fake_requests):
    return fake_requests.calls_for("POST", "/rest/v1/app_audit_logs")


# ── 1. COMENTÁRIO: author do body NÃO é identidade ───────────────────────────

def test_comentario_ignora_author_spoofado_do_body(
        api_module, client, fake_requests, monkeypatch):
    """Técnico tenta atribuir o comentário a OUTRO usuário → vence o perfil real."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.comment"})
    _route_ticket(fake_requests, _ticket())
    _route_comment_writes(fake_requests)

    resp = client.post("/api/chamados/t-1/events",
                       json={"content": "Verifiquei a sala",
                             "author": "Outro Tecnico"},
                       headers=headers)

    assert resp.status_code == 201
    calls = _event_calls(fake_requests)
    assert calls, "evento deveria ter sido gravado"
    payload = calls[0]["kwargs"]["json"]
    assert payload["author"] == "Tecnico"
    assert payload["author"] != "Outro Tecnico"
    assert payload["content"] == "Verifiquei a sala"
    assert payload["ticket_id"] == "t-1"
    assert payload["workspace_id"] == "ws-a"

    audit = _audit_calls(fake_requests)
    assert audit, "auditoria do app deveria ter sido gravada"
    audit_payload = audit[0]["kwargs"]["json"]
    assert audit_payload["actor_id"] == "tech-1"
    assert audit_payload["actor_name"] == "Tecnico"
    assert audit_payload["entity_id"] == "t-1"


def test_comentario_sem_body_author_usa_perfil_autenticado(
        api_module, client, fake_requests, monkeypatch):
    """Sem `author` no payload, o autor continua sendo o perfil da sessão."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.comment"})
    _route_ticket(fake_requests, _ticket())
    _route_comment_writes(fake_requests)

    resp = client.post("/api/chamados/t-1/events",
                       json={"content": "Sem campo author"},
                       headers=headers)

    assert resp.status_code == 201
    payload = _event_calls(fake_requests)[0]["kwargs"]["json"]
    assert payload["author"] == "Tecnico B"


# ── 2. STATUS: author do body NÃO é identidade ───────────────────────────────

def test_status_ignora_author_spoofado_do_body(
        api_module, client, fake_requests, monkeypatch):
    """Transição `aberto → em_atendimento` com `author="Sistema"` no payload.

    O evento de status deve carregar o NOME DO PERFIL AUTENTICADO, nunca o
    valor do body — `Sistema` só aparece quando o perfil não tem nome.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    before = _ticket(status="aberto")
    after = dict(before, status="em_atendimento")
    _route_ticket(fake_requests, before)
    _route_status_writes(fake_requests, after)

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento",
                              "author": "Sistema"},
                        headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["status"] == "em_atendimento"
    calls = _event_calls(fake_requests)
    assert calls, "evento de status deveria ter sido gravado"
    payload = calls[0]["kwargs"]["json"]
    assert payload["type"] == "status"
    assert payload["author"] == "Tecnico"
    assert payload["author"] != "Sistema"
    assert payload["ticket_id"] == "t-1"
    assert payload["workspace_id"] == "ws-a"


# ── 3. DERIVAÇÃO POR USUÁRIO autenticado ─────────────────────────────────────

def test_autor_deriva_do_usuario_autenticado_nao_do_perfil_do_ticket(
        api_module, client, fake_requests, monkeypatch):
    """Dois técnicos distintos geram autores distintos na mesma timeline."""
    for profile, expected in ((TECH, "Tecnico"), (TECH_B, "Tecnico B")):
        headers = _auth_as(api_module, fake_requests, monkeypatch,
                           profile, {"ticket.comment"})
        _route_ticket(fake_requests, _ticket())
        _route_comment_writes(fake_requests)

        resp = client.post("/api/chamados/t-1/events",
                           json={"content": f"comentario de {profile['id']}"},
                           headers=headers)

        assert resp.status_code == 201
        payload = _event_calls(fake_requests)[-1]["kwargs"]["json"]
        assert payload["author"] == expected


# ── 4. ISOLAMENTO de unidade e permissões ────────────────────────────────────

def test_tecnico_fora_do_workspace_nao_comenta_e_nao_grava_evento(
        api_module, client, fake_requests, monkeypatch):
    """Membro de outro campus é barrado (403) e NENHUM evento é gravado."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, OUTSIDER, {"ticket.comment"})
    _route_ticket(fake_requests, _ticket())
    _route_comment_writes(fake_requests)

    resp = client.post("/api/chamados/t-1/events",
                       json={"content": "tentativa", "author": "Qualquer"},
                       headers=headers)

    assert resp.status_code == 403
    assert _event_calls(fake_requests) == []
    assert _audit_calls(fake_requests) == []