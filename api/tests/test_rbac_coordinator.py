"""Security tests for the RBAC 2.0 "Coordenador Multiunidade" role (040).

Covers the enforcement engine resolved for the coordinator role (migration
040 seeds) — the guarantees that matter when ``RBAC_2_ENABLED`` is on:

  1. Coordenador (membership ativa em ws A) recebe as Actions operacionais
     do cargo em ws A (ticket.* exceto os proibidos, stock.export, pcare.export).
  2. Adversário: coordenador em outro workspace (B) ⇒ DENY (isolamento).
  3. Adversário: coordenador tentando Action de plataforma (scope 'global') ⇒
     DENY — nunca alcança o bypass do Super Admin.
  4. Destrutivas/administrativas: ticket.delete, ticket.weeklyEmail, tv.purge,
     tv.device.manage, tv.settings.manage, admin.* ⇒ DENY.
  5. Precedência: override.deny vence a role; override.allow concede sem role;
     default deny; fail-closed on error.
  6. Regressão: Super Admin continua com bypass global; membro de cargo
     leitor (ticket.report/view) não herda ticket.assign.

Mirrors api/tests/test_rbac.py (fakes de requests REST service_role — a suite
roda sem Postgres vivo).
"""

import importlib.util
import sys
from pathlib import Path

import pytest

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
RBAC_MODULE = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "rbac.py"

SUPABASE_URL = "https://test.supabase.co"

# Pelo seed da 040 (coordinator), escopo workspace:
COORD_ACTIONS = [
    "ticket.view",
    "ticket.edit",
    "ticket.status",
    "ticket.assign",
    "ticket.comment",
    "ticket.close",
    "ticket.reopen",
    "ticket.report",
    "ticket.qr",
    "stock.export",
    "pcare.export",
]

# Actions que o coordenador NUNCA pode executar (adversarial):
PROHIBITED = [
    "ticket.delete",
    "ticket.weeklyEmail",
    "tv.purge",
    "tv.device.manage",
    "tv.settings.manage",
    "admin.app.purge",
    "admin.user.edit",
    "admin.audit.view",
    "admin.system.wipe",
    "reservelab.push.manage",
]


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

    def route(self, method, url_part, response, predicate=None):
        self._routes.setdefault(method, []).append((url_part, response, predicate))

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for part, response, predicate in self._routes.get(method, []):
            if part in url and (predicate is None or predicate(kwargs)):
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


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _enable_resolver(rbac_module, monkeypatch, fake_requests):
    monkeypatch.setattr(rbac_module, "requests", fake_requests)
    monkeypatch.setattr(rbac_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(rbac_module, "_SUPABASE_SERVICE_KEY", "test-service-key")


def _mem(profile_id, workspace_id, role_id, status="active"):
    return {"id": f"m-{profile_id}-{workspace_id}", "role_id": role_id, "status": status}


def _route_membership(fr, membership, workspace=None, profile_id="u1"):
    """Roteia por params reais: responde ao (profile_id, workspace_id) exato,
    para permitir testes de isolamento entre workspaces."""
    def predicate(kwargs):
        params = kwargs.get("params") or {}
        if workspace is not None and params.get("workspace_id") != f"eq.{workspace}":
            return False
        if profile_id is not None and params.get("profile_id") != f"eq.{profile_id}":
            return False
        return True

    fr.route("GET", "/rest/v1/memberships", FakeResponse([membership] if membership else []), predicate=predicate)


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


def _coord_profile():
    return {"id": "u1", "is_super_admin": False}


class TestCoordinatorResolver:
    def _setup(self, rbac_module, monkeypatch, fake_requests, perms=None, overrides=None, workspace="ws-a"):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", workspace, "role-coordinator"), workspace=workspace)
        _route_role_permissions(fake_requests, perms or COORD_ACTIONS)
        _route_overrides(fake_requests, overrides or {})

    def test_operational_actions_allowed_in_workspace(self, rbac_module, fake_requests, monkeypatch):
        self._setup(rbac_module, monkeypatch, fake_requests)
        profile = _coord_profile()
        for action in COORD_ACTIONS:
            assert rbac_module.rbac_can(profile, "ws-a", action, "workspace") is True, action
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.view", "workspace") is True

    def test_adversarial_prohibited_actions_denied(self, rbac_module, fake_requests, monkeypatch):
        self._setup(rbac_module, monkeypatch, fake_requests)
        profile = _coord_profile()
        for action in PROHIBITED:
            assert rbac_module.rbac_can(profile, "ws-a", action, "workspace") is False, action
        for action in PROHIBITED:
            assert rbac_module.rbac_can(profile, "ws-a", action, "global") is False, action

    def test_adversarial_other_workspace_deny(self, rbac_module, fake_requests, monkeypatch):
        # Membership ativa apenas em ws-a; coordenador tenta agir em ws-b.
        self._setup(rbac_module, monkeypatch, fake_requests, workspace="ws-a")
        _route_membership(fake_requests, None, workspace="ws-b")
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-b", "ticket.assign", "workspace") is False
        assert rbac_module.rbac_can(profile, "ws-b", "ticket.view", "workspace") is False

    def test_adversarial_global_never_opened_to_coordinator(self, rbac_module, fake_requests, monkeypatch):
        # Escopo 'global': o motor passa apenas para super admin (etapa 1).
        self._setup(rbac_module, monkeypatch, fake_requests)
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "admin.user.edit", "global") is False
        assert rbac_module.rbac_can(profile, "ws-a", "admin.audit.view", "global") is False

    def test_missing_workspace_deny(self, rbac_module, fake_requests, monkeypatch):
        self._setup(rbac_module, monkeypatch, fake_requests)
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, None, "ticket.assign", "workspace") is False

    def test_no_membership_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, None)
        _route_role_permissions(fake_requests, COORD_ACTIONS)
        _route_overrides(fake_requests, {})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is False

    def test_inactive_membership_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws-a", "role-coordinator", status="suspended"))
        _route_role_permissions(fake_requests, COORD_ACTIONS)
        _route_overrides(fake_requests, {})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is False

    def test_override_deny_wins_over_coordinator_role(self, rbac_module, fake_requests, monkeypatch):
        self._setup(rbac_module, monkeypatch, fake_requests, overrides={"ticket.assign": "deny"})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is False

    def test_override_allow_grants_without_role(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws-a", "role-coordinator"))
        _route_role_permissions(fake_requests, [])
        _route_overrides(fake_requests, {"ticket.assign": "allow"})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is True

    def test_scope_row_nao_vaza(self, rbac_module, fake_requests, monkeypatch):
        # Permissão de escopo 'workspace' não autoriza escopo 'global'/'self'.
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws-a", "role-coordinator"))
        _route_role_permissions(fake_requests, COORD_ACTIONS)
        _route_overrides(fake_requests, {})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.view", "self") is False
        assert rbac_module.rbac_can(profile, "ws-a", "stock.export", "global") is False

    def test_fail_closed_on_error_deny(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        fake_requests.route("GET", "/rest/v1/memberships", FakeResponse(None, status_code=500, ok=False))
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is False


class TestCoordinatorSeparation:
    """Super Admin permanece o bypass global; leitor não herda o cargo."""

    def test_super_admin_bypass_preserved(self, rbac_module, fake_requests, monkeypatch):
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        profile = {"id": "u1", "is_super_admin": True}
        assert rbac_module.rbac_can(profile, "ws-a", "admin.user.edit", "global") is True
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.delete", "workspace") is True

    def test_legacy_viewer_regression(self, rbac_module, fake_requests, monkeypatch):
        # Cargo leitor (vis) não herda ticket.assign apenas por ter leitura.
        _enable_resolver(rbac_module, monkeypatch, fake_requests)
        _route_membership(fake_requests, _mem("u1", "ws-a", "role-viewer"))
        viewer_perms = ["ticket.view", "ticket.report", "stock.export", "pcare.export"]
        _route_role_permissions(fake_requests, viewer_perms)
        _route_overrides(fake_requests, {})
        profile = _coord_profile()
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.report", "workspace") is True
        assert rbac_module.rbac_can(profile, "ws-a", "ticket.assign", "workspace") is False