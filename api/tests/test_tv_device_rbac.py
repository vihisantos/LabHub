"""Etapa 9.9 — TV Device Management RBAC Enforcement.

Valida que POST /api/tv/activation/create e POST /api/tv/devices/provision:
- continuam funcionais com RBAC desativado (flag off);
- são protegidos por tv.device.manage quando flag está ON;
- workspace é avaliado no contexto server-side (require_workspace → g.workspace_id);
- e o workspace_id do body NUNCA é autoridade (não há bypass de RBAC);
- payload e comportamento HTTP permanecem compatíveis;
- proteções existentes (auth, module, rate limit) seguem intactas.
"""
import importlib.util
import json
import hashlib
import hmac
import base64
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests as requests_lib

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"
WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
DEVICE_ID = "33333333-4444-5555-6666-777777777777"
TOKEN_HASH = "hashed-token-xyz987"

CREATE_URL = "/api/tv/activation/create"
PROVISION_URL = "/api/tv/devices/provision"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (status_code == 200) if ok is None else ok
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepts requests; routes by substring/predicate. Last match wins."""
    exceptions = requests_lib.exceptions

    def __init__(self):
        self.calls = []
        self._routes = []
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.append((method, url_part, response, None))

    def route_pred(self, method, predicate, response):
        self._routes.append((method, "", response, predicate))

    def _match(self, method, url, kwargs):
        hay_params = kwargs.get("params") or {}
        joined = "&".join(f"{k}={v}" for k, v in hay_params.items())
        for m, part, response, pred in reversed(self._routes):
            if m != method:
                continue
            if pred is not None:
                if pred(url, kwargs):
                    return response
            elif part and (part in url or part in joined):
                return response
        return self._default

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        return self._match(method, url, kwargs)

    def get(self, url, **kwargs):   return self._do("GET", url, **kwargs)
    def post(self, url, **kwargs):  return self._do("POST", url, **kwargs)
    def patch(self, url, **kwargs): return self._do("PATCH", url, **kwargs)


# ── JWT helper ───────────────────────────────────────────────────────────────

def _make_jwt(payload, secret=SUPABASE_JWT_SECRET):
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    sig_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), sig_input.encode(), hashlib.sha256).digest()
    return f"{sig_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


AUTH_HEADERS = lambda uid="u1": {
    "Authorization": f"Bearer {_make_jwt({'sub': uid, 'iss': f'{SUPABASE_URL}/auth/v1', 'aud': 'authenticated'})}"
}


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def root_api_module():
    for existing in list(sys.modules.values()):
        if getattr(existing, "app", None) is not None:
            existing_file = getattr(existing, "__file__", "") or ""
            if existing_file:
                if Path(existing_file).resolve() == ROOT_API.resolve():
                    return existing
    key = "root_api_devmgmt"
    if key in sys.modules and getattr(sys.modules[key], "app", None) is not None:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fr():
    return FakeRequests()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _profile(uid="u1", ws_ids=None):
    return {"id": uid, "status": "active", "is_super_admin": False,
            "workspace_ids": ws_ids or [WS_A],
            "email": f"{uid}@test.com", "name": uid, "role": "admin"}


def _workspace(ws_id, name="WS A", slug="a", disabled=None):
    return {"id": ws_id, "name": name, "slug": slug, "disabled_apps": disabled or []}


def _setup_auth(fr, profile=None, ws_list=None):
    profile = profile or _profile()
    fr.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    fr.route("GET", "/auth/v1/user", FakeResponse({"id": profile["id"]}))
    ws_list = ws_list or [_workspace(WS_A), _workspace(WS_B, "WS B", "b")]
    fr.route_pred("GET", lambda url, kw: "/rest/v1/workspaces" in url, FakeResponse(ws_list))


def _setup_rbac(fr, *, memberships=None, permissions=None, overrides=None):
    if memberships is not None:
        fr.route("GET", "memberships", FakeResponse(memberships if isinstance(memberships, list) else [memberships]))
    else:
        fr.route("GET", "memberships", FakeResponse([]))
    fr.route("GET", "role_permissions", FakeResponse(permissions or []))
    fr.route("GET", "membership_overrides", FakeResponse(
        [{"action": a, "effect": e} for a, e in overrides.items()] if isinstance(overrides, dict) else overrides or []
    ))
    fr.route("POST", "rbac_audit_logs", FakeResponse([]))


def _setup_rbac_allow(fr):
    _setup_rbac(fr,
        memberships={"id": "mem-u1", "role_id": "role-admin", "status": "active"},
        permissions=[{"action": "tv.device.manage", "scope": "workspace"}],
        overrides=[],
    )


def _setup_create_happy_path(fr):
    fr.route("POST", "tv_activation_codes", FakeResponse([{
        "code": "ABC999",
        "expires_at": "2026-09-02T00:00:00+00:00",
        "workspace_id": WS_A,
        "device_name": "TV Teste",
    }]))


def _setup_provision_happy_path(fr):
    fr.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fr.route("POST", "/auth/v1/admin/generate_link", FakeResponse({
        "properties": {"action_link": f"{SUPABASE_URL}/auth/v1/verify?token={TOKEN_HASH}"},
        "user": {"id": "dev-user-1"},
    }))
    fr.route("POST", "/rest/v1/tv_devices", FakeResponse([]))


def _client(fr, root_api_module, monkeypatch):
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fr)
    monkeypatch.setattr(root_api_module, "_get_client_ip", lambda: "test-ip")
    auth_mod = sys.modules.get("auth")
    if auth_mod:
        monkeypatch.setattr(auth_mod, "requests", fr)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    rbac_mod = sys.modules.get("rbac")
    if rbac_mod:
        monkeypatch.setattr(rbac_mod, "requests", fr)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(rbac_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    root_api_module._rate_limit_store.clear()
    return root_api_module.app.test_client()


def _create(client, ws_id=WS_A, headers=None):
    return client.post(CREATE_URL, json={"workspace_id": ws_id, "device_name": "TV Teste"},
                       headers=headers or AUTH_HEADERS())


def _provision(client, ws_id=WS_A, headers=None):
    return client.post(PROVISION_URL, json={"workspace_id": ws_id, "device_id": DEVICE_ID, "device_name": "TV Teste"},
                       headers=headers or AUTH_HEADERS())


# Cada rota (create + provision) valida os mesmos 10 casos de RBAC.
def _run_cases(ctx):
    root_api_module, fr, monkeypatch, call = ctx
    out = []

    def case_flag_off_no_403():
        _setup_auth(fr)
        _setup_create_happy_path(fr)
        _setup_provision_happy_path(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
        return call(client).status_code != 403

    def case_allowed_user():
        _setup_auth(fr)
        _setup_create_happy_path(fr)
        _setup_provision_happy_path(fr)
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        return call(client).status_code != 403

    def case_denied_user():
        _setup_auth(fr)
        _setup_rbac(fr,
            memberships={"id": "m-u1", "role_id": "r-noperm", "status": "active"},
            permissions=[],
        )
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = call(client)
        return resp.status_code == 403

    def case_wrong_scope_denied():
        _setup_auth(fr)
        _setup_rbac(fr,
            memberships={"id": "m-u1", "role_id": "r-wrong", "status": "active"},
            permissions=[{"action": "tv.device.manage", "scope": "global"}],
        )
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        return call(client).status_code == 403

    def case_perm_in_a_denied_in_b():
        _setup_auth(fr, profile=_profile(ws_ids=[WS_A, WS_B]))
        _setup_create_happy_path(fr)
        _setup_provision_happy_path(fr)
        fr.route_pred("GET", lambda url, kw: "memberships" in url and WS_A in (kw.get("params") or {}).get("workspace_id", ""),
                      FakeResponse([{"id": "m-a", "role_id": "ra", "status": "active"}]))
        fr.route_pred("GET", lambda url, kw: "memberships" in url and WS_B in (kw.get("params") or {}).get("workspace_id", ""),
                      FakeResponse([{"id": "m-b", "role_id": "rb", "status": "active"}]))
        fr.route_pred("GET", lambda url, kw: "role_permissions" in url and "ra" in (kw.get("params") or {}).get("role_id", ""),
                      FakeResponse([{"action": "tv.device.manage", "scope": "workspace"}]))
        fr.route_pred("GET", lambda url, kw: "role_permissions" in url and "rb" in (kw.get("params") or {}).get("role_id", ""),
                      FakeResponse([]))
        fr.route("GET", "membership_overrides", FakeResponse([]))
        fr.route("POST", "rbac_audit_logs", FakeResponse([]))
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        ok_a = call(client, ws_id=WS_A).status_code == 200
        denied_b = call(client, ws_id=WS_B).status_code == 403
        return ok_a and denied_b

    def case_body_workspace_no_bypass():
        _setup_auth(fr, profile=_profile(ws_ids=[WS_A, WS_B]))
        fr.route_pred("GET", lambda url, kw: "memberships" in url and WS_A in (kw.get("params") or {}).get("workspace_id", ""),
                      FakeResponse([{"id": "m-a", "role_id": "ra", "status": "active"}]))
        fr.route_pred("GET", lambda url, kw: "memberships" in url and WS_B in (kw.get("params") or {}).get("workspace_id", ""),
                      FakeResponse([{"id": "m-b", "role_id": "rb", "status": "active"}]))
        fr.route_pred("GET", lambda url, kw: "ra" in (kw.get("params") or {}).get("role_id", ""),
                      FakeResponse([{"action": "tv.device.manage", "scope": "workspace"}]))
        fr.route_pred("GET", lambda url, kw: "rb" in (kw.get("params") or {}).get("role_id", ""),
                      FakeResponse([]))
        fr.route("GET", "membership_overrides", FakeResponse([]))
        fr.route("POST", "rbac_audit_logs", FakeResponse([]))
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        return call(client, ws_id=WS_B).status_code == 403

    def case_unauthenticated():
        _setup_auth(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        return call(client, headers={}).status_code == 401

    def case_rate_limit():
        _setup_auth(fr)
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        root_api_module._rate_limit_store["test-ip"] = [
            datetime.now(timezone.utc).timestamp()] * root_api_module.RATE_LIMIT_MAX_REQUESTS
        return call(client).status_code == 429

    def case_module_disabled():
        _setup_auth(fr, ws_list=[_workspace(WS_A, disabled=["tv"])])
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        return call(client).status_code == 403

    def case_payload_compatible():
        _setup_auth(fr)
        _setup_rbac_allow(fr)
        _setup_create_happy_path(fr)
        _setup_provision_happy_path(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = call(client)
        if resp.status_code != 200:
            return False
        data = resp.get_json()
        return data.get("success") is True

    out.append(("flag_off_no_403", case_flag_off_no_403))
    out.append(("allowed_user", case_allowed_user))
    out.append(("denied_user", case_denied_user))
    out.append(("wrong_scope_denied", case_wrong_scope_denied))
    out.append(("perm_in_a_denied_in_b", case_perm_in_a_denied_in_b))
    out.append(("body_workspace_no_bypass", case_body_workspace_no_bypass))
    out.append(("unauthenticated", case_unauthenticated))
    out.append(("rate_limit", case_rate_limit))
    out.append(("module_disabled", case_module_disabled))
    out.append(("payload_compatible", case_payload_compatible))
    return out


# ── 1–10. POST /api/tv/activation/create ────────────────────────────────────

class TestCreateRBAC:
    pass


def _gen_create_tests():
    def make(name):
        def test(self, root_api_module, fr, monkeypatch):
            ctx = (root_api_module, fr, monkeypatch, _create)
            results = _run_cases(ctx)
            for n, outcome in results:
                if n == name:
                    assert outcome, f"create case '{n}' failed"
                    return
            raise AssertionError(f"case '{name}' not found")
        test.__name__ = f"test_create_{name}"
        return test

    for name in ["flag_off_no_403", "allowed_user", "denied_user", "wrong_scope_denied",
                 "perm_in_a_denied_in_b", "body_workspace_no_bypass", "unauthenticated",
                 "rate_limit", "module_disabled", "payload_compatible"]:
        setattr(TestCreateRBAC, f"test_create_{name}", make(name))


_gen_create_tests()


# ── 11–20. POST /api/tv/devices/provision ───────────────────────────────────

class TestProvisionRBAC:
    pass


def _gen_provision_tests():
    def make(name):
        def test(self, root_api_module, fr, monkeypatch):
            ctx = (root_api_module, fr, monkeypatch, _provision)
            results = _run_cases(ctx)
            for n, outcome in results:
                if n == name:
                    assert outcome, f"provision case '{n}' failed"
                    return
            raise AssertionError(f"case '{name}' not found")
        test.__name__ = f"test_provision_{name}"
        return test

    for name in ["flag_off_no_403", "allowed_user", "denied_user", "wrong_scope_denied",
                 "perm_in_a_denied_in_b", "body_workspace_no_bypass", "unauthenticated",
                 "rate_limit", "module_disabled", "payload_compatible"]:
        setattr(TestProvisionRBAC, f"test_provision_{name}", make(name))


_gen_provision_tests()
