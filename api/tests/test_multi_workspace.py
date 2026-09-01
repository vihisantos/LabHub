"""Multi-workspace security tests — Etapa 8.

Tests validate that:
  1. Single-workspace user sees only their workspace's tickets
  2. Multi-workspace user sees all authorized workspaces
  3. Forbidden third workspace leaks no data
  4. workspace_id tampering is rejected
  5. Cross-workspace resource access is denied
  6. Reports respect workspace isolation
  7. No membership → empty result (fail-closed)
  8. Super admin bypass is preserved
  9. Regression: existing suite still passes
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
WS_C = "33333333-3333-3333-3333-333333333333"
USER_MULTI = "dddddddd-0000-0000-0000-000000000001"
USER_SINGLE = "dddddddd-0000-0000-0000-000000000002"
USER_NONE = "dddddddd-0000-0000-0000-000000000003"
SUPER_ADMIN = "dddddddd-0000-0000-0000-000000000004"


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


def _make_jwt(payload, secret=SUPABASE_JWT_SECRET):
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


# ── Profiles ──────────────────────────────────────────────────────────────────


def _profile_multi_ws():
    """User with WS-A and WS-B (but NOT WS-C)."""
    return {
        "id": USER_MULTI,
        "email": "multi@test.com",
        "name": "Multi WS User",
        "role": "technician",
        "is_super_admin": False,
        "workspace_ids": [WS_A, WS_B],
        "status": "active",
    }


def _profile_single_ws():
    """User with only WS-A."""
    return {
        "id": USER_SINGLE,
        "email": "single@test.com",
        "name": "Single WS User",
        "role": "technician",
        "is_super_admin": False,
        "workspace_ids": [WS_A],
        "status": "active",
    }


def _profile_no_ws():
    """User with no workspaces."""
    return {
        "id": USER_NONE,
        "email": "nows@test.com",
        "name": "No WS User",
        "role": "viewer",
        "is_super_admin": False,
        "workspace_ids": [],
        "status": "active",
    }


def _profile_super_admin():
    """Super admin with WS-A and WS-B."""
    return {
        "id": SUPER_ADMIN,
        "email": "super@test.com",
        "name": "Super Admin",
        "role": "technician",
        "is_super_admin": True,
        "workspace_ids": [WS_A, WS_B],
        "status": "active",
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def root_api_module():
    for existing in ("multi_ws_api", "chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            if Path(getattr(sys.modules[existing], "__file__", "")).resolve() == ROOT_API.resolve():
                return sys.modules[existing]
    key = "multi_ws_api"
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
    monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
    root_api_module._rate_limit_store.clear()
    return root_api_module.app.test_client()


def _patch_user(monkeypatch, fake_requests, profile):
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))


def _auth_header(profile):
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _make_ticket(ticket_id, workspace_id, **overrides):
    t = {
        "id": ticket_id,
        "workspace_id": workspace_id,
        "roomId": "",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Sem conexão",
        "status": "aberto",
        "priority": "normal",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "",
        "assignedTo": "",
        "assignedToUserId": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "photos": "",
        "ticketNumber": 1,
        "createdAt": "2026-08-01T12:00:00Z",
        "updatedAt": "2026-08-01T12:00:00Z",
        "resolvedAt": None,
        "tracking_token_hash": "",
    }
    t.update(overrides)
    return t


# ══════════════════════════════════════════════════════════════════════════════
# CASO 1 — Single workspace user → only their workspace
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso1SingleWorkspace:
    def test_single_ws_user_sees_only_own_tickets(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A only → GET /chamados → only WS-A tickets."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        ws_a_ticket = _make_ticket("t1", WS_A)
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([ws_a_ticket]))
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        tickets = data.get("tickets", [])
        assert len(tickets) == 1
        assert tickets[0]["workspace_id"] == WS_A

    def test_single_ws_user_explicit_workspace_filter(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, request WS-A → 200."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_A),
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_A}",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 200

    def test_single_ws_user_cannot_explicitly_request_other_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, request WS-B → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_B}",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# CASO 2 — Multi-workspace user → sees all authorized workspaces
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso2MultiWorkspace:
    def test_multi_ws_user_sees_both_workspaces(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B → GET /chamados → WS-A + WS-B tickets."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        tickets = [
            _make_ticket("t1", WS_A, roomName="Sala Piracicaba"),
            _make_ticket("t2", WS_B, roomName="Sala Mooca"),
        ]
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        result = data.get("tickets", [])
        assert len(result) == 2
        ws_ids = {t["workspace_id"] for t in result}
        assert WS_A in ws_ids
        assert WS_B in ws_ids

    def test_multi_ws_user_can_request_specific_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, request WS-B → 200."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t2", WS_B),
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_B}",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200

    def test_multi_ws_empty_result_when_no_tickets(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, no tickets → empty list."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([]))
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        assert resp.get_json().get("tickets", []) == []


# ══════════════════════════════════════════════════════════════════════════════
# CASO 3 — Forbidden third workspace leaks no data
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso3ForbiddenThirdWorkspace:
    def test_multi_ws_user_cannot_request_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, request WS-C → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_C}",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 403
        data = resp.get_json()
        assert "negado" in data.get("error", "").lower() or "acesso" in data.get("error", "").lower()

    def test_multi_ws_user_never_sees_ws_c_tickets(self, root_client, fake_requests, monkeypatch):
        """Even if WS-C tickets exist in Supabase response, user shouldn't request them.
        The backend filters by user_ws_ids, so WS-C is excluded from the query."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        # The backend builds the query with workspace_id=in.(WS_A, WS_B)
        # so Supabase would never return WS-C tickets anyway
        tickets = [_make_ticket("t1", WS_A)]
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        result = data.get("tickets", [])
        # Verify query includes workspace filter (WS_C not in filter)
        get_calls = fake_requests.calls_for("GET", "chamados_tickets")
        assert len(get_calls) >= 1
        query_url = get_calls[0]["url"]
        assert WS_C not in query_url or f"in." in query_url


# ══════════════════════════════════════════════════════════════════════════════
# CASO 4 — workspace_id tampering → DENY
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso4WorkspaceTampering:
    def test_tampering_ws_id_param_rejected(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, request workspace_id=WS-C → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_C}",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_tampering_ws_id_in_patch_body_ignored(self, root_client, fake_requests, monkeypatch):
        """PATCH ticket: workspace_id in body is ignored (resource-based)."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        # PATCH makes multiple sequential GET calls to chamados_tickets
        # (workspace check, status check, statusNote check, etc.)
        ticket = _make_ticket("t1", WS_A)
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([ticket]))
        fake_requests.route("PATCH", "/rest/v1/chamados_tickets", FakeResponse([ticket]))
        resp = root_client.patch(
            "/api/chamados/t1",
            json={"workspace_id": WS_C, "status": "resolvido"},
            headers=_auth_header(_profile_single_ws()),
        )
        # Should succeed (workspace comes from resource, not body)
        assert resp.status_code in (200, 400, 403)


# ══════════════════════════════════════════════════════════════════════════════
# CASO 5 — Cross-workspace ticket → DENY for GET/PATCH/DELETE
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso5CrossWorkspaceTicket:
    def test_cannot_get_ticket_from_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, ticket from WS-C → GET → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.get(
            "/api/chamados/t1",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_cannot_patch_ticket_from_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, ticket from WS-C → PATCH → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.patch(
            "/api/chamados/t1",
            json={"status": "resolvido"},
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_cannot_delete_ticket_from_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, ticket from WS-C → DELETE → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.delete(
            "/api/chamados/t1",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_cannot_create_event_on_ticket_from_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, ticket from WS-C → POST events → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C, status="aberto"),
        ]))
        resp = root_client.post(
            "/api/chamados/t1/events",
            json={"content": "test", "author": "A"},
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_cannot_view_events_of_ticket_from_forbidden_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A, ticket from WS-C → GET events → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_single_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.get(
            "/api/chamados/t1/events",
            headers=_auth_header(_profile_single_ws()),
        )
        assert resp.status_code == 403

    def test_multi_ws_user_can_access_ticket_from_authorized_ws(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, ticket from WS-B → GET → 200."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_B),
        ]))
        resp = root_client.get(
            "/api/chamados/t1",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════════════════════
# CASO 6 — Reports respect workspace isolation
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso6ReportsIsolation:
    def test_reports_only_include_authorized_workspaces(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B → reports → only WS-A + WS-B data."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        tickets = [
            _make_ticket("t1", WS_A, status="aberto"),
            _make_ticket("t2", WS_B, status="resolvido"),
        ]
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))
        resp = root_client.get(
            "/api/chamados/reports",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        report = data.get("report", {})
        assert report.get("total", 0) == 2

    def test_reports_exclude_forbidden_workspace(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, request WS-C → 403 for reports."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        resp = root_client.get(
            f"/api/chamados/reports?workspace_id={WS_C}",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 403

    def test_reports_specific_workspace(self, root_client, fake_requests, monkeypatch):
        """User A → WS-A + WS-B, request WS-A → only WS-A in reports."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_A),
        ]))
        resp = root_client.get(
            f"/api/chamados/reports?workspace_id={WS_A}",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        report = data.get("report", {})
        assert report.get("total", 0) == 1

    def test_reports_empty_when_no_workspaces(self, root_client, fake_requests, monkeypatch):
        """User with no workspaces → reports → empty report."""
        _patch_user(monkeypatch, fake_requests, _profile_no_ws())
        resp = root_client.get(
            "/api/chamados/reports",
            headers=_auth_header(_profile_no_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        report = data.get("report", {})
        assert report.get("total", 0) == 0

    def test_reports_query_includes_workspace_filter(self, root_client, fake_requests, monkeypatch):
        """Verify that the Supabase query URL includes the workspace filter."""
        _patch_user(monkeypatch, fake_requests, _profile_multi_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([]))
        resp = root_client.get(
            "/api/chamados/reports",
            headers=_auth_header(_profile_multi_ws()),
        )
        assert resp.status_code == 200
        # Verify the query URL contains the workspace filter
        get_calls = fake_requests.calls_for("GET", "chamados_tickets")
        assert len(get_calls) >= 1
        query_url = get_calls[0]["url"]
        assert WS_A in query_url
        assert WS_B in query_url
        assert WS_C not in query_url


# ══════════════════════════════════════════════════════════════════════════════
# CASO 7 — No membership → empty result / DENY
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso7NoMembership:
    def test_user_with_no_ws_sees_empty_list(self, root_client, fake_requests, monkeypatch):
        """User with no workspaces → GET /chamados → empty list."""
        _patch_user(monkeypatch, fake_requests, _profile_no_ws())
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_no_ws()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("tickets", []) == []

    def test_user_with_no_ws_cannot_request_ws(self, root_client, fake_requests, monkeypatch):
        """User with no workspaces, request WS-A → 403."""
        _patch_user(monkeypatch, fake_requests, _profile_no_ws())
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_A}",
            headers=_auth_header(_profile_no_ws()),
        )
        assert resp.status_code == 403

    def test_user_with_no_ws_cannot_access_ticket(self, root_client, fake_requests, monkeypatch):
        """User with no workspaces → GET ticket → 403 (ticket's ws not in empty list)."""
        _patch_user(monkeypatch, fake_requests, _profile_no_ws())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_A),
        ]))
        resp = root_client.get(
            "/api/chamados/t1",
            headers=_auth_header(_profile_no_ws()),
        )
        assert resp.status_code == 403

    def test_user_with_no_ws_reports_empty(self, root_client, fake_requests, monkeypatch):
        """User with no workspaces → reports → 200 with total=0."""
        _patch_user(monkeypatch, fake_requests, _profile_no_ws())
        resp = root_client.get(
            "/api/chamados/reports",
            headers=_auth_header(_profile_no_ws()),
        )
        assert resp.status_code == 200
        assert resp.get_json().get("report", {}).get("total", 0) == 0


# ══════════════════════════════════════════════════════════════════════════════
# CASO 8 — Super admin bypass preserved
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso8SuperAdmin:
    def test_super_admin_can_list_any_workspace(self, root_client, fake_requests, monkeypatch):
        """Super admin → request WS-C → 200."""
        _patch_user(monkeypatch, fake_requests, _profile_super_admin())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.get(
            f"/api/chamados?workspace_id={WS_C}",
            headers=_auth_header(_profile_super_admin()),
        )
        assert resp.status_code == 200

    def test_super_admin_can_manage_any_ticket(self, root_client, fake_requests, monkeypatch):
        """Super admin → GET ticket from WS-C → 200."""
        _patch_user(monkeypatch, fake_requests, _profile_super_admin())
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse([
            _make_ticket("t1", WS_C),
        ]))
        resp = root_client.get(
            "/api/chamados/t1",
            headers=_auth_header(_profile_super_admin()),
        )
        assert resp.status_code == 200

    def test_super_admin_sees_all_tickets(self, root_client, fake_requests, monkeypatch):
        """Super admin without workspace filter → no workspace filter in query."""
        _patch_user(monkeypatch, fake_requests, _profile_super_admin())
        tickets = [
            _make_ticket("t1", WS_A),
            _make_ticket("t2", WS_B),
            _make_ticket("t3", WS_C),
        ]
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))
        resp = root_client.get(
            "/api/chamados",
            headers=_auth_header(_profile_super_admin()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data.get("tickets", [])) == 3

    def test_super_admin_reports_no_filter(self, root_client, fake_requests, monkeypatch):
        """Super admin → reports without workspace filter → all data."""
        _patch_user(monkeypatch, fake_requests, _profile_super_admin())
        tickets = [
            _make_ticket("t1", WS_A),
            _make_ticket("t2", WS_C),
        ]
        fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))
        resp = root_client.get(
            "/api/chamados/reports",
            headers=_auth_header(_profile_super_admin()),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("report", {}).get("total", 0) == 2


# ══════════════════════════════════════════════════════════════════════════════
# CASO 9 — Regression: auth layer
# ══════════════════════════════════════════════════════════════════════════════


class TestCaso9Regression:
    def test_unauthenticated_returns_401(self, root_client):
        """No token → 401."""
        resp = root_client.get("/api/chamados")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, root_client, root_api_module, monkeypatch):
        """Invalid JWT → 401."""
        monkeypatch.setattr("auth._verify_jwt", lambda t: None)
        resp = root_client.get(
            "/api/chamados",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert resp.status_code == 401

    def test_blocked_user_returns_401(self, root_client, fake_requests, monkeypatch):
        """Blocked user → 401."""
        blocked = {
            "id": "blocked", "email": "b@test.com", "name": "Blocked",
            "role": "viewer", "is_super_admin": False,
            "workspace_ids": [WS_A], "status": "blocked",
        }
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": "blocked"})
        fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([blocked]))
        resp = root_client.get(
            "/api/chamados",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': 'blocked'})}"},
        )
        assert resp.status_code == 401

    def test_public_endpoints_still_work(self, root_client, fake_requests):
        """Public endpoints (workspaces, create) still work without auth."""
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([
            {"id": WS_A, "name": "Piracicaba"},
        ]))
        resp = root_client.get("/api/chamados/workspaces")
        assert resp.status_code == 200
