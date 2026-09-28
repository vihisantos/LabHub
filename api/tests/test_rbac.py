"""Security tests for the RBAC 2.0 backend enforcement engine (Etapa 3).

Covers:
  1. rbac_can resolver — deterministic order:
     super_admin ⇒ ALLOW; não membro ⇒ DENY; role permission ⇒ base;
     override.deny ⇒ DENY; override.allow ⇒ ALLOW; default deny. Fail-closed.
  2. require_action decorator — always enforces the Action (401/403/allow);
     no feature flag, no legacy no-op path.
  3. _require_workspace_app_manager — RBAC 2.0 is the only authority
     (admin.app.purge via membership/role_permissions; profile.role is NOT
     consulted — F2-C removed the legacy fallback).
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


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


@pytest.fixture(scope="session")
def rbac_module():
    """Load the RBAC engine (registering auth first via reservalab app)."""
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


@pytest.fixture()
def fake_requests():
    return FakeRequests()


# ── Resolver unit tests ───────────────────────────────────────────────────────

def _enable_resolver(rbac_module, monkeypatch, fake_requests):
    """Configure the rbac module for DB-backed resolution."""
    monkeypatch.setattr(rbac_module, "requests", fake_requests)
    monkeypatch.setattr(rbac_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(rbac_module, "_SUPABASE_SERVICE_KEY", "test-service-key")

def _mem(profile_id, workspace_id, role_id, status="active"):
    return {"id": f"m-{profile_id}-{workspace_id}", "role_id": role_id, "status": status}


def _route_membership(fr, membership):
    fr.route("GET", "/rest/v1/memberships", FakeResponse([membership] if membership else []))


def _route_role_permissions(fr, perms):
    fr.route(
        "GET",
        "/rest/v1/role_permissions",
        FakeResponse([{"action": a, "effect": "allow"} for a in perms]),
    )


def _route_overrides(fr, overrides):
    fr.route(
        "GET",
        "/rest/v1/membership_overrides",
        FakeResponse([{"action": a, "effect": e} for a, e in overrides.items()]),
    )


class TestRBACResolver:
    def test_super_admin_bypass(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        profile = {"id": "u1", "is_super_admin": True}
        assert rbac_module.rbac_can(profile, "ws1", "any.action", "workspace") is True

    def test_no_membership_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, None)
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is False

    def test_inactive_membership_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1", status="invited"))
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is False

    def test_role_permission_allow(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, ["tv.content.manage", "ticket.create"])
        _route_overrides(fake_requests, {})
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is True

    def test_no_permission_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, ["ticket.create"])
        _route_overrides(fake_requests, {})
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is False

    def test_override_deny_wins_over_role(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, ["tv.content.manage"])
        _route_overrides(fake_requests, {"tv.content.manage": "deny"})
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is False

    def test_override_allow_wins_without_role(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [])
        _route_overrides(fake_requests, {"tv.content.manage": "allow"})
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is True

    def test_missing_workspace_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, None, "tv.content.manage", "workspace") is False

    def test_global_non_super_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "admin.audit.view", "global") is False

    def test_fail_closed_on_error_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        fake_requests.route("GET", "/rest/v1/memberships", FakeResponse(None, status_code=500, ok=False))
        profile = {"id": "u1", "is_super_admin": False}
        assert rbac_module.rbac_can(profile, "ws1", "tv.content.manage", "workspace") is False

    def test_audit_best_effort_does_not_raise(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse(None, status_code=500, ok=False))
        rbac_module.record_rbac_audit(
            "u1", False, "tv.content.manage", "ws1", "workspace", "deny", "deny"
        )
        assert True


# ── Decorator tests (HTTP) ────────────────────────────────────────────────────

def _patch_supabase_profile(fr, profile):
    fr.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    fr.route("GET", "/rest/v1/memberships", FakeResponse([
        {"profile_id": profile.get("id"), "workspace_id": w, "status": "active"}
        for w in (profile.get("workspace_ids") or [])
    ]))


def _patch_workspace(fr, ws=None):
    ws = ws or {"id": "ws-test", "name": "Test WS", "slug": "test", "disabled_apps": []}
    fr.route("GET", "/rest/v1/workspaces", FakeResponse([ws]))


def _auth_headers():
    token = _make_jwt({"sub": "user-1"})
    return {"Authorization": f"Bearer {token}"}


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
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": "user-1"})
    rbac_mod = sys.modules.get("rbac")
    if rbac_mod:
        monkeypatch.setattr(rbac_mod, "requests", fake_requests)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    root_api_module._rate_limit_store.clear()
    return root_api_module.app.test_client()


class TestRequireActionDecorator:
    def _profile(self, is_super=False, role="technician"):
        return {
            "id": "user-1",
            "email": "test@test.com",
            "name": "Test User",
            "role": role,
            "is_super_admin": is_super,
            "workspace_ids": ["ws-test"],
            "status": "active",
        }

    def test_action_allowed_passes(self, root_client, fake_requests, monkeypatch, rbac_module):
        """Action permitida ⇒ decorator deixa passar (RBAC 2.0 sempre ativo)."""
        _patch_supabase_profile(fake_requests, self._profile(is_super=True))
        _patch_workspace(fake_requests)
        monkeypatch.setattr(rbac_module, "rbac_can", lambda *a, **k: True)
        resp = root_client.post(
            "/api/tv/cloudinary/delete",
            json={"workspace_id": "ws-test", "image_url": "https://test.com/img.jpg"},
            headers=_auth_headers(),
        )
        assert resp.status_code == 200

    def test_action_absent_deny_403(self, root_client, fake_requests, monkeypatch, rbac_module):
        """Action ausente ⇒ 403, independentemente de qualquer env var."""
        _patch_supabase_profile(fake_requests, self._profile(is_super=False))
        _patch_workspace(fake_requests)
        monkeypatch.setattr(rbac_module, "rbac_can", lambda *a, **k: False)
        resp = root_client.post(
            "/api/tv/cloudinary/delete",
            json={"workspace_id": "ws-test", "image_url": "https://test.com/img.jpg"},
            headers=_auth_headers(),
        )
        assert resp.status_code == 403
        body = resp.get_json() or {}
        assert body.get("error") == "Permissão insuficiente"

    def test_action_absent_records_audit(self, root_client, fake_requests, monkeypatch, rbac_module):
        _patch_supabase_profile(fake_requests, self._profile(is_super=False))
        _patch_workspace(fake_requests)
        monkeypatch.setattr(rbac_module, "rbac_can", lambda *a, **k: False)
        resp = root_client.post(
            "/api/tv/cloudinary/delete",
            json={"workspace_id": "ws-test", "image_url": "https://test.com/img.jpg"},
            headers=_auth_headers(),
        )
        assert resp.status_code == 403
        audit_calls = fake_requests.calls_for("POST", "/rest/v1/rbac_audit_logs")
        assert len(audit_calls) == 1


class TestRequireWorkspaceAppManager:
    """Gateway de describe/purge de dados do app do workspace (RBAC 2.0 ON-only).

    Protege os RPCs SECURITY DEFINER purge_tv_app_data / describe_tv_app_data.
    A autoridade é apenas `admin.app.purge` (workspace) via membership +
    role_permissions, ou super admin (bypass). profile.role == 'admin' NÃO
    concede mais nada (F2-C removeu o fallback legacy).
    """

    def _profile(self, role="technician", is_super=False):
        return {
            "id": "user-1",
            "email": "test@test.com",
            "name": "Test User",
            "role": role,
            "is_super_admin": is_super,
            "workspace_ids": ["ws-test"],
            "status": "active",
        }

    def _describe(self, root_client, fake_requests, headers, ws, role_id=None, perms=()):
        fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([ws]))
        if role_id:
            fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([
                {"id": "m-user-1-ws-test", "profile_id": "user-1",
                 "workspace_id": "ws-test", "role_id": role_id, "status": "active"}
            ]))
            fake_requests.route("GET", "/rest/v1/role_permissions", FakeResponse(perms))
            fake_requests.route("GET", "/rest/v1/membership_overrides", FakeResponse([]))
        else:
            fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([
                {"profile_id": ws.get("id"), "workspace_id": w, "status": "active"}
                for w in (ws.get("workspace_ids") or [])
            ]))
        _patch_workspace(fake_requests)
        return root_client.post(
            "/api/admin/app-data/describe",
            json={"workspace_id": "ws-test", "appId": "tv"},
            headers=headers,
        )

    def test_non_action_member_deny_403(self, root_client, fake_requests, monkeypatch):
        """Membro ativo sem a Action ⇒ 403 (default deny)."""
        resp = self._describe(
            root_client, fake_requests,
            _auth_headers(),
            self._profile(role="technician"),
        )
        assert resp.status_code == 403

    def test_role_admin_without_action_deny_403(self, root_client, fake_requests, monkeypatch):
        """O caso mais importante do F2-C: role='admin' no perfil NÃO concede
        describe — só a Action `admin.app.purge` (membership/role_permissions)."""
        resp = self._describe(
            root_client, fake_requests,
            _auth_headers(),
            self._profile(role="admin"),
            role_id="r-admin",
            perms=[],
        )
        assert resp.status_code == 403

    def test_role_with_purge_action_allowed(self, root_client, fake_requests, monkeypatch):
        """Role com Action admin.app.purge (workspace) ⇒ PERMITIR."""
        fake_requests.route(
            "POST", "/rest/v1/rpc/describe_tv_app_data",
            FakeResponse({"tables": {}, "total": 0}),
        )
        resp = self._describe(
            root_client, fake_requests,
            _auth_headers(),
            self._profile(role="admin"),
            role_id="r-admin",
            perms=[{"action": "admin.app.purge", "scope": "workspace"}],
        )
        assert resp.status_code == 200

    def test_global_scope_purge_does_not_grant_workspace(self, root_client, fake_requests, monkeypatch):
        """Grant scope=global não satisfaz o check workspace ⇒ fail-closed."""
        resp = self._describe(
            root_client, fake_requests,
            _auth_headers(),
            self._profile(role="admin"),
            role_id="r-admin",
            perms=[{"action": "admin.app.purge", "scope": "global"}],
        )
        assert resp.status_code == 403

    def test_super_admin_bypass_allowed(self, root_client, fake_requests, monkeypatch):
        """Super admin mantém o bypass (não depende de membership/Action)."""
        fake_requests.route(
            "POST", "/rest/v1/rpc/describe_tv_app_data",
            FakeResponse({"tables": {}, "total": 0}),
        )
        resp = self._describe(
            root_client, fake_requests,
            _auth_headers(),
            self._profile(role="viewer", is_super=True),
        )
        assert resp.status_code == 200
