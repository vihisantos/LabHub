"""Security tests for backend authorization layer (auth.py).

Tests validate that all protected endpoints enforce:
  1. JWT authentication (require_auth)
  2. Super admin role (require_admin)
  3. Module access (require_module)
  4. Workspace membership (require_workspace)
  5. Cron secret (require_cron)
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

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
AUTH_MODULE = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "auth.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepta requests para simular chamadas Supabase."""

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

    def request(self, method, url, **kwargs):
        return self._do(method, url, **kwargs)

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    """Create a valid-looking JWT for testing."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


def _make_expired_jwt(payload: dict) -> str:
    """Create an expired JWT."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) - 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(SUPABASE_JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def reservalab_module():
    """Load the reservalab Flask app module (once per session)."""
    key = "reservalab_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, RESERVALAB_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def root_api_module():
    """Load the root Flask API module (once per session)."""
    key = "root_api"
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


def _patch_supabase_profile(fake_requests, profile):
    """Set up fake_requests to return a user profile when queried."""
    fake_requests.route(
        "GET",
        "/rest/v1/profiles",
        FakeResponse([profile]),
    )


def _patch_workspace(fake_requests, ws=None):
    """Set up fake_requests to return a workspace."""
    ws = ws or {"id": "ws-test", "name": "Test WS", "slug": "test", "disabled_apps": []}
    fake_requests.route(
        "GET",
        "/rest/v1/workspaces",
        FakeResponse([ws]),
    )


@pytest.fixture()
def reservalab_client(reservalab_module, fake_requests, monkeypatch):
    """Test client for the reservalab Flask app."""
    monkeypatch.setattr(reservalab_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(reservalab_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(reservalab_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    return reservalab_module.app.test_client()


@pytest.fixture()
def root_client(root_api_module, fake_requests, monkeypatch):
    """Test client for the root Flask API."""
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


# ── Tests: Authentication ────────────────────────────────────────────────────

class TestRequireAuth:
    """require_auth decorator rejects unauthenticated requests."""

    def test_push_action_no_token_returns_401(self, reservalab_client):
        resp = reservalab_client.post("/api/push/action", json={"action": "approve", "userId": "u1"})
        assert resp.status_code == 401

    def test_push_send_no_token_returns_401(self, reservalab_client):
        resp = reservalab_client.post("/api/push/send", json={"title": "test"})
        assert resp.status_code == 401

    def test_push_test_no_token_returns_401(self, reservalab_client):
        resp = reservalab_client.get("/api/push/test")
        assert resp.status_code == 401

    def test_chamados_list_no_token_returns_401(self, root_client):
        resp = root_client.get("/api/chamados")
        assert resp.status_code == 401

    def test_chamados_manage_no_token_returns_401(self, root_client):
        resp = root_client.get("/api/chamados/fake-id")
        assert resp.status_code == 401

    def test_tv_cloudinary_delete_no_token_returns_401(self, root_client):
        resp = root_client.post("/api/tv/cloudinary/delete", json={"image_url": "https://test.com/img.jpg"})
        assert resp.status_code == 401

    def test_admin_wipe_no_token_returns_401(self, root_client):
        resp = root_client.post("/api/admin/wipe")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, reservalab_client):
        resp = reservalab_client.post(
            "/api/push/action",
            json={"action": "approve", "userId": "u1"},
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, reservalab_client, fake_requests):
        token = _make_expired_jwt({"sub": "user-1"})
        resp = reservalab_client.post(
            "/api/push/action",
            json={"action": "approve", "userId": "u1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_bearer_prefix_required(self, reservalab_client):
        token = _make_jwt({"sub": "user-1"})
        resp = reservalab_client.post(
            "/api/push/action",
            json={"action": "approve", "userId": "u1"},
            headers={"Authorization": token},  # Missing "Bearer " prefix
        )
        assert resp.status_code == 401


# ── Tests: Admin authorization ────────────────────────────────────────────────

class TestRequireAdmin:
    """require_admin rejects non-super-admin users."""

    def _auth_headers(self, fake_requests, is_super_admin=False):
        """Setup auth for a regular user (not admin)."""
        profile = {
            "id": "user-1",
            "email": "test@test.com",
            "name": "Test User",
            "role": "technician",
            "is_super_admin": is_super_admin,
            "workspace_ids": ["ws-test"],
            "status": "active",
        }
        _patch_supabase_profile(fake_requests, profile)
        token = _make_jwt({"sub": "user-1"})
        return {"Authorization": f"Bearer {token}"}

    def test_push_action_non_admin_returns_403(self, reservalab_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests, is_super_admin=False)
        resp = reservalab_client.post("/api/push/action", json={"action": "approve", "userId": "u2"}, headers=headers)
        assert resp.status_code == 403

    def test_push_action_admin_allowed(self, reservalab_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests, is_super_admin=True)
        fake_requests.route(
            "PATCH",
            "/rest/v1/profiles",
            FakeResponse({}, status_code=204, ok=True),
        )
        resp = reservalab_client.post(
            "/api/push/action",
            json={"action": "approve", "userId": "u2", "role": "viewer"},
            headers=headers,
        )
        assert resp.status_code == 200

    def test_push_send_non_admin_returns_403(self, reservalab_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests, is_super_admin=False)
        resp = reservalab_client.post("/api/push/send", json={"title": "test"}, headers=headers)
        assert resp.status_code == 403

    def test_push_test_non_admin_returns_403(self, reservalab_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests, is_super_admin=False)
        resp = reservalab_client.get("/api/push/test", headers=headers)
        assert resp.status_code == 403

    def test_admin_wipe_non_admin_returns_403(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests, is_super_admin=False)
        resp = root_client.post("/api/admin/wipe", headers=headers)
        assert resp.status_code == 403


# ── Tests: Module authorization ───────────────────────────────────────────────

class TestRequireModule:
    """require_module blocks access when module is disabled."""

    def _auth_headers(self, fake_requests):
        profile = {
            "id": "user-1",
            "email": "test@test.com",
            "name": "Test User",
            "role": "technician",
            "is_super_admin": True,
            "workspace_ids": ["ws-test"],
            "status": "active",
        }
        _patch_supabase_profile(fake_requests, profile)
        token = _make_jwt({"sub": "user-1"})
        return {"Authorization": f"Bearer {token}"}

    def test_cloudinary_delete_no_workspace_passes_module_check(self, root_client, fake_requests, monkeypatch):
        """Without workspace context, require_module is a no-op — only auth applies."""
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests)
        resp = root_client.post(
            "/api/tv/cloudinary/delete",
            json={"image_url": "https://test.com/img.jpg"},
            headers=headers,
        )
        assert resp.status_code == 200

    def test_cloudinary_delete_tv_enabled_allowed(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "user-1"})
        headers = self._auth_headers(fake_requests)
        _patch_workspace(fake_requests)
        resp = root_client.post(
            "/api/tv/cloudinary/delete",
            json={"image_url": "https://test.com/img.jpg"},
            headers=headers,
        )
        assert resp.status_code != 403


# ── Tests: Public endpoints remain public ─────────────────────────────────────

class TestPublicEndpoints:
    """Endpoints that should remain public."""

    def test_health_is_public(self, reservalab_client):
        resp = reservalab_client.get("/api/health")
        assert resp.status_code == 200

    def test_reservas_is_public(self, reservalab_client, fake_requests):
        fake_requests.route("GET", "/rest/v1/tablet_reservations", FakeResponse([]))
        resp = reservalab_client.get("/api/reservas")
        assert resp.status_code == 200

    def test_chamados_create_is_public(self, root_client, fake_requests):
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([{"id": "ws-a", "name": "Test", "slug": "test"}]))
        fake_requests.route("POST", "/rest/v1/rpc/", FakeResponse({"ticketNumber": 1}))
        resp = root_client.post("/api/chamados", json={
            "workspace_id": "ws-a",
            "roomName": "Sala 101",
            "reportedBy": "Prof. Test",
            "problemArea": "academica",
            "problemCategory": "Internet",
            "problemDescription": "Test",
        })
        assert resp.status_code != 401

    def test_chamados_workspaces_is_public(self, root_client, fake_requests):
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([]))
        resp = root_client.get("/api/chamados/workspaces")
        assert resp.status_code == 200


# ── Tests: Cron endpoints ────────────────────────────────────────────────────

class TestCronEndpoints:
    """Cron endpoints use _cron_authorized (fail-open without CRON_SECRET)."""

    def test_check_all_no_secret_returns_503(self, reservalab_client, fake_requests, monkeypatch):
        monkeypatch.setenv("CRON_SECRET", "")
        resp = reservalab_client.get("/api/push/check-all")
        assert resp.status_code == 503

    def test_photos_purge_no_cron_secret_returns_503(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setenv("CRON_SECRET", "")
        resp = root_client.post("/api/chamados/photos/purge")
        assert resp.status_code == 503

    def test_photos_purge_wrong_secret_returns_401(self, root_client, fake_requests, monkeypatch):
        monkeypatch.setenv("CRON_SECRET", "correct-secret")
        resp = root_client.post(
            "/api/chamados/photos/purge",
            headers={"Authorization": "Bearer wrong-secret"},
        )
        assert resp.status_code == 401


# ── Tests: Blocked users ─────────────────────────────────────────────────────

class TestBlockedUsers:
    """Blocked users should be rejected even with valid JWT."""

    def test_blocked_user_returns_401(self, reservalab_client, fake_requests):
        profile = {
            "id": "user-blocked",
            "email": "blocked@test.com",
            "name": "Blocked User",
            "role": "technician",
            "is_super_admin": True,
            "workspace_ids": ["ws-test"],
            "status": "blocked",
        }
        _patch_supabase_profile(fake_requests, profile)
        token = _make_jwt({"sub": "user-blocked"})
        resp = reservalab_client.post(
            "/api/push/action",
            json={"action": "approve", "userId": "u2"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401


# ── Tests: Chamados auth enforcement ─────────────────────────────────────────

class TestChamadosAuth:
    """Chamados endpoints require auth for read/write operations."""

    def test_chamados_list_requires_auth(self, root_client):
        resp = root_client.get("/api/chamados")
        assert resp.status_code == 401

    def test_chamados_manage_requires_auth(self, root_client):
        resp = root_client.get("/api/chamados/fake-id")
        assert resp.status_code == 401

    def test_chamados_reports_requires_auth(self, root_client):
        resp = root_client.get("/api/chamados/reports")
        assert resp.status_code == 401

    def test_chamados_events_requires_auth(self, root_client):
        resp = root_client.get("/api/chamados/fake-id/events")
        assert resp.status_code == 401

    def test_chamados_push_test_requires_auth(self, root_client):
        resp = root_client.post("/api/chamados/push/test")
        assert resp.status_code == 401

    def test_chamados_weekly_email_requires_auth(self, root_client):
        resp = root_client.post("/api/chamados/reports/weekly-email")
        assert resp.status_code == 401

    def test_chamados_create_still_public(self, root_client, fake_requests):
        """chamados_create must remain public for professor form."""
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([{"id": "ws-a", "name": "T", "slug": "t"}]))
        resp = root_client.post("/api/chamados", json={
            "workspace_id": "ws-a",
            "roomName": "Sala 101",
            "reportedBy": "Prof. Test",
            "problemArea": "academica",
            "problemCategory": "Internet",
            "problemDescription": "Test",
        })
        assert resp.status_code != 401
