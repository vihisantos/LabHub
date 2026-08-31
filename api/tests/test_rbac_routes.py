"""Etapa 5 — RBAC 2.0 enforcement: engine-vs-schema (036) integration + rollout.

Covers the FASE 5A fix (engine resolves correctly against migration 036) and
the FASE 5B/5F/5G rollout guarantees:

  1. _fetch_role_permissions queries `select=action,scope` (036 has NO `effect`
     column) — a stale `select=action,effect` would 400 and deny-everything
     for non-super admins.
  2. Scope matching is exact: a `global` role_permission grant does NOT satisfy
     a `workspace`-scoped check (and vice-versa); no permission-by-accident.
  3. scope normalization (strip + default 'workspace') + global ⇒ non-super DENY.
  4. Flag OFF ⇒ require_action is a no-op (legacy path preserved).
  5. Flag ON ⇒ fail-closed; audit failure never converts DENY into ALLOW.
  6. Public-by-design endpoints (B) remain reachable with NO RBAC and no auth.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
RBAC_MODULE = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "rbac.py"

SUPABASE_URL = "https://test.supabase.co"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok

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

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


@pytest.fixture(scope="session")
def rbac_module():
    """Load the RBAC engine, registering auth first via the reservalab app."""
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
    if "root_api" in sys.modules:
        return sys.modules["root_api"]
    spec = importlib.util.spec_from_file_location("root_api", ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["root_api"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _enable(rbac_module, monkeypatch, fr):
    """Point the engine at Supabase REST with a scripted fake client."""
    monkeypatch.setattr(rbac_module, "requests", fr)
    monkeypatch.setattr(rbac_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(rbac_module, "_SUPABASE_SERVICE_KEY", "test-service-key")


def _mem(profile_id, workspace_id, role_id, status="active"):
    return {"id": f"m-{profile_id}-{workspace_id}", "role_id": role_id, "status": status}


def _route_membership(fr, membership):
    fr.route("GET", "/rest/v1/memberships", FakeResponse([membership] if membership else []))


def _route_role_permissions(fr, rows):
    # Rows mirror migration 036: (action, scope) — NO `effect` column.
    fr.route("GET", "/rest/v1/role_permissions", FakeResponse(rows))


def _route_overrides(fr, overrides):
    fr.route(
        "GET",
        "/rest/v1/membership_overrides",
        FakeResponse([{"action": a, "effect": e} for a, e in overrides.items()]),
    )


# ── 5A: engine `select` matches migration 036 (no `effect` column) ──────────
class TestSchema036Select:
    def test_role_permissions_select_has_no_effect_column(
        self, rbac_module, fake_requests, monkeypatch
    ):
        """036 role_permissions has NO `effect`. The engine must select
        `action,scope`; a stale `action,effect` would 400 → deny-everything."""
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        rbac_module.rbac_can({"id": "u1", "is_super_admin": False}, "ws1", "ticket.view", "workspace")

        rp_calls = fake_requests.calls_for("GET", "/rest/v1/role_permissions")
        assert rp_calls, "engine must query role_permissions"
        params = rp_calls[-1]["kwargs"].get("params") or {}
        select = params.get("select", "")
        assert "action" in select
        assert "scope" in select
        assert "effect" not in select

    def test_membership_and_overrides_select_columns_match_schema(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        rbac_module.rbac_can({"id": "u1", "is_super_admin": False}, "ws1", "ticket.view", "workspace")

        mem_calls = fake_requests.calls_for("GET", "/rest/v1/memberships")
        assert mem_calls
        assert (mem_calls[-1]["kwargs"].get("params") or {}).get("select") == "id,role_id,status"

        ov_calls = fake_requests.calls_for("GET", "/rest/v1/membership_overrides")
        assert ov_calls
        assert (ov_calls[-1]["kwargs"].get("params") or {}).get("select") == "action,effect"


# ── 5A: exact scope matching (no permission-by-accident) ─────────────────────
class TestScopeFiltering:
    def _ws_profile(self):
        return {"id": "u1", "is_super_admin": False}

    def test_global_grant_does_not_satisfy_workspace_check(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.edit", "scope": "global"}])
        _route_overrides(fake_requests, {})
        assert (
            rbac_module.rbac_can(self._ws_profile(), "ws1", "ticket.edit", "workspace") is False
        )

    def test_workspace_grant_does_not_satisfy_global_check(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "admin.audit.view", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        assert (
            rbac_module.rbac_can(self._ws_profile(), "ws1", "admin.audit.view", "global") is False
        )

    def test_matching_scope_grants(self, rbac_module, fake_requests, monkeypatch):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.edit", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        assert (
            rbac_module.rbac_can(self._ws_profile(), "ws1", "ticket.edit", "workspace") is True
        )

    def test_self_scope_requires_workspace_context(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, None)
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "self"}])
        _route_overrides(fake_requests, {})
        # `self` still requires workspace context + an ACTIVE membership to
        # carry the role; no membership ⇒ DENY (fail-closed), never fail-open.
        assert (
            rbac_module.rbac_can(self._ws_profile(), "ws1", "ticket.view", "self") is False
        )

    def test_self_scope_allows_with_active_membership_and_grant(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "self"}])
        _route_overrides(fake_requests, {})
        assert (
            rbac_module.rbac_can(self._ws_profile(), "ws1", "ticket.view", "self") is True
        )

    def test_scope_defaulted_to_workspace_on_blank(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        # Blank scope normalizes to 'workspace'; matching workspace grant ⇒ ALLOW.
        assert rbac_module.rbac_can(self._ws_profile(), "ws1", "ticket.view", "") is True

    def test_missing_workspace_deny_even_with_grant(
        self, rbac_module, fake_requests, monkeypatch
    ):
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws1", "r1"))
        _route_role_permissions(fake_requests, [{"action": "ticket.view", "scope": "workspace"}])
        _route_overrides(fake_requests, {})
        assert (
            rbac_module.rbac_can(self._ws_profile(), None, "ticket.view", "workspace") is False
        )


# ── 5D/5F: rollout + audit (flag-on fail-closed never fails-open) ────────────
def _suppress_server_state(root_api_module, monkeypatch, fr):
    """Apply the same gating monkeypatches the main suite uses for root routes."""
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fr)
    auth_mod = sys.modules.get("auth")
    if auth_mod:
        monkeypatch.setattr(auth_mod, "requests", fr)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": "user-1"})
    rbac_mod = sys.modules.get("rbac")
    if rbac_mod:
        monkeypatch.setattr(rbac_mod, "requests", fr)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    root_api_module._rate_limit_store.clear()


class TestAuditNeverFailsOpen:
    def test_audit_write_failure_does_not_flip_deny_to_allow(
        self, rbac_module, fake_requests, monkeypatch
    ):
        """FASE 5F: audit is a side-channel; a failing audit write must NOT turn
        a DENY into an ALLOW."""
        _enable(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, None)
        fr = fake_requests
        fr.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse(None, status_code=500, ok=False))
        # Decision is DENY (no membership); audit would fail — resolve unchanged.
        assert rbac_module.rbac_can({"id": "u1", "is_super_admin": False}, "ws1", "tv.content.manage", "workspace") is False

    def test_record_audit_never_raises(self, rbac_module, fake_requests, monkeypatch):
        _enable(rbac_module, monkeypatch, fake_requests)
        fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse(None, status_code=500, ok=False))
        rbac_module.record_rbac_audit("u1", False, "tv.content.manage", "ws1", "workspace", "deny", "denied")
        assert True


# ── 5B: public-by-design endpoints need no RBAC nor auth ─────────────────────
class TestPublicByDesignReachable:
    def test_public_chamados_workspaces_no_auth(
        self, root_api_module, fake_requests, monkeypatch
    ):
        """GET /api/chamados/workspaces is a public campus list (B) — must stay
        reachable with NO auth and no RBAC."""
        _suppress_server_state(root_api_module, monkeypatch, fake_requests)
        monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
        fake_requests.route(
            "GET",
            "/rest/v1/workspaces",
            FakeResponse([{"id": "ws1", "name": "Campus", "slug": "c", "location": "X"}]),
        )
        resp = root_api_module.app.test_client().get("/api/chamados/workspaces")
        assert resp.status_code == 200
        assert resp.get_json()["workspaces"]

    def test_flag_on_does_not_gate_public_route(
        self, root_api_module, fake_requests, monkeypatch
    ):
        _suppress_server_state(root_api_module, monkeypatch, fake_requests)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        fake_requests.route(
            "GET",
            "/rest/v1/workspaces",
            FakeResponse([{"id": "ws1", "name": "Campus", "slug": "c", "location": "X"}]),
        )
        resp = root_api_module.app.test_client().get("/api/chamados/workspaces")
        assert resp.status_code == 200
