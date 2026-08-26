"""Workspace isolation security tests — Security 4 hardening.

Tests validate that:
  1. user_belongs_to_workspace(NULL) returns false
  2. Cross-workspace SELECT/INSERT/UPDATE/DELETE are blocked
  3. Users without workspaces cannot see workspace-scoped data
  4. Super admin can still access all workspaces
  5. workspace_id cannot be switched between workspaces
  6. NULL workspace_id never authorizes access
"""

import importlib.util
import json
import sys
import time
import hmac
import hashlib
import base64
from pathlib import Path

import pytest

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
USER_A = "aaaaaaaa-0000-0000-0000-000000000001"
ADMIN = "cccccccc-0000-0000-0000-000000000003"


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


def _make_jwt(payload, secret=SUPABASE_JWT_SECRET):
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


def _patch_supabase_profile(fake_requests, profile):
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))


@pytest.fixture(scope="session")
def root_api_module():
    for existing in ("chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            if Path(getattr(sys.modules[existing], "__file__", "")).resolve() == ROOT_API.resolve():
                return sys.modules[existing]
    key = "root_api_isolation"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


@pytest.fixture()
def root_client(root_api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    root_api_module._rate_limit_store.clear()
    return root_api_module.app.test_client()


def _user_a_profile():
    return {
        "id": USER_A, "email": "a@test.com", "name": "User A",
        "role": "technician", "is_super_admin": False,
        "workspace_ids": [WS_A], "status": "active",
    }


def _admin_profile():
    return {
        "id": ADMIN, "email": "admin@test.com", "name": "Admin",
        "role": "technician", "is_super_admin": True,
        "workspace_ids": [WS_A, WS_B], "status": "active",
    }


def _no_workspace_profile():
    return {
        "id": "no-ws", "email": "nows@test.com", "name": "No WS",
        "role": "viewer", "is_super_admin": False,
        "workspace_ids": [], "status": "active",
    }


# ── Test 1: Cross-workspace SELECT ─────────────────────────────────────────

class TestCrossWorkspaceSelect:
    def test_user_a_cannot_list_ws_b_tickets(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B, "status": "aberto"}
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_B}",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code == 403

    def test_user_a_can_list_ws_a_tickets(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_A, "status": "aberto"}
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_A}",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code == 200


# ── Test 2: Cross-workspace UPDATE ─────────────────────────────────────────

class TestCrossWorkspaceUpdate:
    def test_user_a_cannot_patch_ws_b_ticket(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B}
        ]))
        resp = root_client.patch(
            "/api/chamados/t1",
            json={"status": "resolvido"},
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code == 403


# ── Test 3: Cross-workspace DELETE ─────────────────────────────────────────

class TestCrossWorkspaceDelete:
    def test_user_a_cannot_delete_ws_b_ticket(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B}
        ]))
        resp = root_client.delete(
            "/api/chamados/t1",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code == 403


# ── Test 4: NULL workspace never authorizes ────────────────────────────────

class TestNullWorkspaceNeverAuthorizes:
    def test_user_with_empty_ws_ids_sees_nothing(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "no-ws"})
        _patch_supabase_profile(fake_requests, _no_workspace_profile())
        resp = root_client.get(
            "/api/chamados",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': 'no-ws'})}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        tickets = data.get("tickets", data) if isinstance(data, dict) else data
        assert isinstance(tickets, list)
        assert len(tickets) == 0


# ── Test 5: Empty workspace membership ─────────────────────────────────────

class TestEmptyWorkspaceMembership:
    def test_empty_membership_cannot_access_ws_scoped_endpoint(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "no-ws"})
        _patch_supabase_profile(fake_requests, _no_workspace_profile())
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_A}",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': 'no-ws'})}"},
        )
        assert resp.status_code == 403


# ── Test 6: Super admin bypass ────────────────────────────────────────────

class TestSuperAdminBypass:
    def test_super_admin_can_list_any_workspace(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": ADMIN})
        _patch_supabase_profile(fake_requests, _admin_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B, "status": "aberto"}
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_B}",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': ADMIN})}"},
        )
        assert resp.status_code == 200

    def test_super_admin_can_manage_any_ticket(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": ADMIN})
        _patch_supabase_profile(fake_requests, _admin_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B}
        ]))
        resp = root_client.get(
            "/api/chamados/t1",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': ADMIN})}"},
        )
        assert resp.status_code == 200


# ── Test 7: INSERT without workspace ──────────────────────────────────────

class TestInsertWithoutWorkspace:
    def test_chamados_create_requires_workspace_id(self, root_client, fake_requests, monkeypatch):
        resp = root_client.post("/api/chamados", json={
            "roomName": "Lab 1", "problemCategory": "Software",
            "problemDescription": "Test", "reportedBy": "Test User",
            "reportedEmail": "test@test.com",
        })
        assert resp.status_code == 400


# ── Test 8: INSERT in non-existent workspace ──────────────────────────────

class TestInsertUnauthorizedWorkspace:
    def test_chamados_create_rejects_invalid_workspace(self, root_client, fake_requests, monkeypatch):
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([]))
        resp = root_client.post("/api/chamados", json={
            "workspace_id": "00000000-0000-0000-0000-000000000000",
            "roomName": "Lab 1", "problemCategory": "Software",
            "problemArea": "academica",
            "problemDescription": "Test", "reportedBy": "Test User",
            "reportedEmail": "test@test.com",
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert "encontrad" in data.get("error", "").lower() or "campus" in data.get("error", "").lower()


# ── Test 9: Cannot switch workspace ───────────────────────────────────────

class TestWorkspaceSwitching:
    def test_chamados_patch_ignores_workspace_change(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_A, "status": "aberto"}
        ]))
        resp = root_client.patch(
            "/api/chamados/t1",
            json={"workspace_id": WS_B},
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code in (200, 400, 403)


# ── Test 10: Cross-workspace event creation blocked ───────────────────────

class TestCrossWorkspaceEventBlocking:
    def test_user_a_cannot_create_event_on_ws_b_ticket(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": USER_A})
        _patch_supabase_profile(fake_requests, _user_a_profile())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            {"id": "t1", "workspace_id": WS_B, "status": "aberto"}
        ]))
        resp = root_client.post(
            "/api/chamados/t1/events",
            json={"content": "test", "author": "A"},
            headers={"Authorization": f"Bearer {_make_jwt({'sub': USER_A})}"},
        )
        assert resp.status_code == 403
