"""ETAPA 6 — RBAC 2.0 enforcement final em Chamados + Push.

Cobre (OFF/ON):
- GET/DELETE/PATCH /api/chamados/<id> por operação;
- GET/POST /api/chamados/<id>/events;
- POST /api/chamados/reports/weekly-email;
- POST /api/push/send;
- segurança: workspace derivado do recurso (não do cliente), atomicidade do
  PATCH misto, audit failure não vira allow, deny-by-default, sem wildcard.
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

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
RBAC_MODULE = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "rbac.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = str(payload)

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


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


@pytest.fixture(scope="session")
def rbac_module():
    key = "reservalab_api"
    if key not in sys.modules:
        spec = importlib.util.spec_from_file_location(key, RESERVALAB_API)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[key] = mod
        spec.loader.exec_module(mod)
    rkey = "rbac"
    if rkey in sys.modules:
        return sys.modules[rkey]
    rspec = importlib.util.spec_from_file_location(rkey, RBAC_MODULE)
    rmod = importlib.util.module_from_spec(rspec)
    sys.modules[rkey] = rmod
    rspec.loader.exec_module(rmod)
    return rmod


@pytest.fixture(scope="session")
def root_api_module():
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


def _patch_supabase_profile(fr, profile):
    fr.route("GET", "/rest/v1/profiles", FakeResponse([profile]))


def _auth_headers(user_id="user-1"):
    return {"Authorization": f"Bearer {_make_jwt({'sub': user_id})}"}


def _profile(is_super=False, role="technician", ws=None):
    return {
        "id": "user-1",
        "email": "test@test.com",
        "name": "Test User",
        "role": role,
        "is_super_admin": is_super,
        "workspace_ids": ws or ["ws-test"],
        "status": "active",
    }


def _ticket_row(ws="ws-test"):
    return {
        "id": "t-1",
        "workspace_id": ws,
        "status": "aberto",
        "statusNote": "",
        "assignedToUserId": "",
        "problemDescription": "desc",
        "priority": "normal",
    }


@pytest.fixture()
def client(root_api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": "user-1"})
    rbac_mod = sys.modules.get("rbac")
    if rbac_mod:
        monkeypatch.setattr(rbac_mod, "requests", fake_requests)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
    root_api_module._rate_limit_store.clear()
    return root_api_module.app.test_client()


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _capture_can(monkeypatch, rbac_module, decisions=None, default=True):
    calls = []
    root_mod = sys.modules.get("root_api")

    def fake(profile, workspace_id, action, scope="workspace"):
        calls.append({"workspace_id": workspace_id, "action": action, "scope": scope})
        if decisions is not None:
            return decisions.get(action, False)
        return default

    # Decorator path (weekly-email, push/send) => require_action_rbac internamente
    # usa sys.modules["rbac"].rbac_can.
    monkeypatch.setattr(rbac_module, "rbac_can", fake)
    # In-handler path (Chamados <id>) => _require_action_in_handler usa o nome
    # vinculado rbac_two_can no módulo root.
    if root_mod is not None:
        monkeypatch.setattr(root_mod, "rbac_two_can", fake)
    return calls


def _ticket_url(id_):
    return f"/api/chamados/{id_}"


# ── Chamados GET <id> ─────────────────────────────────────────────────────────
class TestChamadosGet:
    def test_get_allowed(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.view": True})
        resp = client.get(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[-1]["action"] == "ticket.view"
        assert calls[-1]["scope"] == "workspace"

    def test_get_denied(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"ticket.view": False})
        resp = client.get(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "Permissão insuficiente"

    def test_get_off_preserves_legacy(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.view": False})
        resp = client.get(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 200
        assert calls == []

    def test_get_workspace_derived_from_resource(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile(ws=["ws-real"]))
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row(ws="ws-real")]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.view": True})
        resp = client.get(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[-1]["workspace_id"] == "ws-real"


# ── Chamados DELETE <id> ──────────────────────────────────────────────────────
class TestChamadosDelete:
    def test_delete_allowed(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([{"workspace_id": "ws-test", "photos": ""}]))
        fake_requests.route("DELETE", "/rest/v1/chamados_tickets", FakeResponse([], status_code=204))
        fake_requests.route("GET", "/rest/v1/ticket_events", FakeResponse([]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.delete": True})
        resp = client.delete(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[-1]["action"] == "ticket.delete"

    def test_delete_denied_before_side_effect(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([{"workspace_id": "ws-test", "photos": ""}]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"ticket.delete": False})
        resp = client.delete(_ticket_url("t-1"), headers=_auth_headers())
        assert resp.status_code == 403
        assert not fake_requests.calls_for("DELETE", "/rest/v1/chamados_tickets")


# ── Chamados PATCH <id> (mixed-operation, atomic) ────────────────────────────
class TestChamadosPatch:
    def _p(self, client, fake_requests, monkeypatch, rbac_module, body, decisions):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("PATCH", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("GET", "/rest/v1/ticket_events", FakeResponse([]))
        fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, decisions)
        resp = client.patch(_ticket_url("t-1"), json=body, headers=_auth_headers())
        return resp, calls

    def test_patch_status_requires_ticket_status(self, client, fake_requests, monkeypatch, rbac_module):
        resp, calls = self._p(client, fake_requests, monkeypatch, rbac_module,
                              {"status": "em_atendimento"}, {"ticket.status": True})
        assert resp.status_code == 200
        assert {"ticket.status"} == {c["action"] for c in calls}

    def test_patch_assign_requires_ticket_assign(self, client, fake_requests, monkeypatch, rbac_module):
        resp, calls = self._p(client, fake_requests, monkeypatch, rbac_module,
                              {"assignedToUserId": "u-9", "assignedTo": "Ana"}, {"ticket.assign": True})
        assert resp.status_code == 200
        assert {"ticket.assign"} == {c["action"] for c in calls}

    def test_patch_edit_requires_ticket_edit(self, client, fake_requests, monkeypatch, rbac_module):
        resp, calls = self._p(client, fake_requests, monkeypatch, rbac_module,
                              {"problemDescription": "novo"}, {"ticket.edit": True})
        assert resp.status_code == 200
        assert {"ticket.edit"} == {c["action"] for c in calls}

    def test_patch_mixed_requires_both(self, client, fake_requests, monkeypatch, rbac_module):
        resp, calls = self._p(client, fake_requests, monkeypatch, rbac_module,
                              {"status": "resolvido", "assignedToUserId": "u-9"},
                              {"ticket.status": True, "ticket.assign": True})
        assert resp.status_code == 200
        assert {"ticket.status", "ticket.assign"} == {c["action"] for c in calls}

    def test_patch_mixed_one_denied_403_no_mutation(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module,
                     {"ticket.status": True, "ticket.assign": False})
        resp = client.patch(_ticket_url("t-1"),
                            json={"status": "em_atendimento", "assignedToUserId": "u-9"},
                            headers=_auth_headers())
        assert resp.status_code == 403
        assert not fake_requests.calls_for("PATCH", "/rest/v1/chamados_tickets")

    def test_patch_off_preserves_legacy(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("PATCH", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("GET", "/rest/v1/ticket_events", FakeResponse([]))
        calls = _capture_can(monkeypatch, rbac_module, {}, default=True)
        resp = client.patch(_ticket_url("t-1"), json={"status": "em_atendimento"}, headers=_auth_headers())
        assert resp.status_code == 200
        assert calls == []


# ── Chamados events ───────────────────────────────────────────────────────────
class TestChamadosEvents:
    def _route(self, fake_requests):
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("GET", "/rest/v1/ticket_events", FakeResponse([]))
        fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))

    def test_get_events_allowed(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        self._route(fake_requests)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.view": True})
        resp = client.get(f"/api/chamados/t-1/events", headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[-1]["action"] == "ticket.view"

    def test_get_events_denied(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        self._route(fake_requests)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"ticket.view": False})
        resp = client.get(f"/api/chamados/t-1/events", headers=_auth_headers())
        assert resp.status_code == 403

    def test_post_events_allowed(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        self._route(fake_requests)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.comment": True})
        resp = client.post(f"/api/chamados/t-1/events",
                           json={"content": "comentario"}, headers=_auth_headers())
        assert resp.status_code == 201
        assert calls and calls[-1]["action"] == "ticket.comment"

    def test_post_events_denied_no_event(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        self._route(fake_requests)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"ticket.comment": False})
        resp = client.post(f"/api/chamados/t-1/events",
                           json={"content": "comentario"}, headers=_auth_headers())
        assert resp.status_code == 403
        assert not fake_requests.calls_for("POST", "/rest/v1/ticket_events")


# ── Push /send + weekly-email (scope=global, action literal) ─────────────────
class TestProtectedGlobal:
    def test_push_send_action_gate_on_super_denied_by_action(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        # require_admin precede require_action (outer→inner). Usamos super admin
        # (passa no require_admin) e mockamos rbac_can→False p/ provar que a rota
        # é gated por `reservelab.push.manage` scope=global.
        _patch_supabase_profile(fake_requests, _profile(is_super=True))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {}, default=False)
        resp = client.post("/api/push/send", json={"title": "x", "body": "y"}, headers=_auth_headers())
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "Permissão insuficiente"
        assert calls and calls[0]["action"] == "reservelab.push.manage"
        assert calls[0]["scope"] == "global"

    def test_push_send_off_preserves_legacy_nonsuper_gate(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        # OFF ⇒ require_action é no-op; require_admin (legado, super-only) governa.
        _patch_supabase_profile(fake_requests, _profile(is_super=False))
        calls = _capture_can(monkeypatch, rbac_module, {})
        resp = client.post("/api/push/send", json={"title": "x", "body": "y"}, headers=_auth_headers())
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "Super admin access required"
        assert calls == []

    def test_push_send_allowed_when_action_allowed(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        # require_action passa (mock True) e super passa no require_admin ⇒ o gate
        # RBAC NÃO bloqueia (handler pode seguir; redis não configurado no teste
        # geraria 500 fora do escopo RBAC — aqui só provamos a permissão).
        _patch_supabase_profile(fake_requests, _profile(is_super=True))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"reservelab.push.manage": True})
        resp = client.post("/api/push/send", json={"title": "x", "body": "y"}, headers=_auth_headers())
        assert resp.status_code != 403

    def test_weekly_email_denied_super_but_action_gate(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        _patch_supabase_profile(fake_requests, _profile(is_super=True))
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.weeklyEmail": False})
        resp = client.post("/api/chamados/reports/weekly-email",
                           json={"workspace_id": "ws-test"}, headers=_auth_headers())
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "Permissão insuficiente"
        assert calls and calls[0]["action"] == "ticket.weeklyEmail"
        assert calls[0]["scope"] == "global"

    def test_weekly_email_allowed_super_on(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile(is_super=True))
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([]))
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        monkeypatch.setattr(sys.modules["root_api"], "_send_email_via_resend", lambda *a, **k: (True, ""))
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.weeklyEmail": True})
        resp = client.post("/api/chamados/reports/weekly-email",
                           json={"workspace_id": "ws-test", "to": "x@y.com"}, headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[0]["action"] == "ticket.weeklyEmail"


# ── Segurança / auditoria ─────────────────────────────────────────────────────
class TestSecurity:
    def test_audit_failure_does_not_flip_deny(self, client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, _profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row()]))
        fake_requests.route("POST", "/rest/v1/rbac_audit_logs",
                            FakeResponse(None, status_code=500, ok=False))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        _capture_can(monkeypatch, rbac_module, {"ticket.view": False})
        resp = client.get(_ticket_url("t-1"), headers=_auth_headers())
        # audit falhou, mas a decisão DENY permanece 403.
        assert resp.status_code == 403

    def test_client_workspace_cannot_override_resource_ws(
        self, client, fake_requests, monkeypatch, rbac_module
    ):
        # O cliente envia workspace_id, mas o workspace DERIVADO é o do recurso (ws-real).
        _patch_supabase_profile(fake_requests, _profile(ws=["ws-real"]))
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([_ticket_row(ws="ws-real")]))
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        calls = _capture_can(monkeypatch, rbac_module, {"ticket.view": True})
        resp = client.get(_ticket_url("t-1"),
                          query_string={"workspace_id": "ws-fake-other"}, headers=_auth_headers())
        assert resp.status_code == 200
        assert calls and calls[-1]["workspace_id"] == "ws-real"
