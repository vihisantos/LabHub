"""Etapa 9.8 — TV Source Fetch RBAC Enforcement.

Valida que POST /api/tv/source/fetch:
- continua funcional com RBAC desativado (flag off);
- é protegido por tv.content.manage quando flag está ON;
- workspace é avaliado no contexto server-side (require_workspace → g.workspace_id);
- payload e comportamento HTTP permanecem compatíveis;
- todas as proteções existentes (auth, module, rate limit, SSRF) seguem intactas.
"""
import importlib.util
import json
import hashlib
import hmac
import base64
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests as requests_lib

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
RBAC_MODULE = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "rbac.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"
PUBLIC_IP = "93.184.216.34"
WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
SRC_URL = "https://files.example.com/planilha.xlsx"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (status_code == 200) if ok is None else ok
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        return self._payload


class FakeDownload:
    """Response de download externo com streaming (semelhante a test_tv_source)."""
    def __init__(self, content=b"", status_code=200):
        self.status_code = status_code
        self.ok = status_code == 200
        self.headers = {}
        self._chunks = [content]

    def iter_content(self, chunk_size=65536):
        for chunk in self._chunks:
            yield chunk

    def close(self):
        pass


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

AUTH_HEADERS = lambda uid="u1": {"Authorization": f"Bearer {_make_jwt({'sub': uid, 'iss': f'{SUPABASE_URL}/auth/v1', 'aud': 'authenticated'})}"}


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def root_api_module():
    key = "root_api"
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


_SETTINGS_A = {
    "eventSource": {"enabled": True, "type": "sharepoint_excel", "url": SRC_URL},
    "display": {"refreshIntervalSeconds": 300},
}


def _setup_auth(fr, profile=None, ws_list=None):
    """Set up auth + workspace + settings routes."""
    profile = profile or _profile()
    fr.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    ws_list = ws_list or [_workspace(WS_A), _workspace(WS_B, "WS B", "b")]
    fr.route_pred("GET", lambda url, kw: "/rest/v1/workspaces" in url, FakeResponse(ws_list))
    fr.route_pred(
        "GET",
        lambda url, kw: "workspace_app_settings" in url,
        FakeResponse([{"settings": _SETTINGS_A}]),
    )


def _setup_rbac(fr, *, memberships=None, permissions=None, overrides=None):
    """Set up RBAC engine routes. memberships: None → no row (DENY), list → rows."""
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
    """Membership active + tv.content.manage granted → ALLOW."""
    _setup_rbac(fr,
        memberships={"id": "mem-u1", "role_id": "role-admin", "status": "active"},
        permissions=[{"action": "tv.content.manage", "scope": "workspace"}],
        overrides=[],
    )


def _safe_dns(monkeypatch):
    def fake_getaddrinfo(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, 0))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _client(fr, root_api_module, monkeypatch):
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fr)
    monkeypatch.setattr(root_api_module, "redis", None)
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


def _fetch(client, ws_id=WS_A, headers=None):
    return client.post("/api/tv/source/fetch", json={"workspace_id": ws_id}, headers=headers)


# ── 1. RBAC desativado (flag off) — comportamento preservado ─────────────────

class TestRBACFlagOff:
    def test_flag_off_no_403(self, root_api_module, fr, monkeypatch):
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code != 403


# ── 2–10. RBAC flag ON — enforcement ────────────────────────────────────────

class TestRBACFlagOn:

    def test_allowed_user_can_fetch(self, root_api_module, fr, monkeypatch):
        """2. User with tv.content.manage → 200 (or non-403)"""
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code != 403

    def test_denied_user_without_perm(self, root_api_module, fr, monkeypatch):
        """3. User without tv.content.manage → 403"""
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        _setup_rbac(fr,
            memberships={"id": "m-u1", "role_id": "r-noperm", "status": "active"},
            permissions=[],
        )
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code == 403
        body = resp.get_json()
        assert "Permissão" in body.get("error", "") or "insuficiente" in body.get("message", "")

    def test_action_evaluated_in_workspace_scope(self, root_api_module, fr, monkeypatch):
        """4. Action is evaluated at scope='workspace' — grant with wrong scope
        does not satisfy the check."""
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        _setup_rbac(fr,
            memberships={"id": "m-u1", "role_id": "r-wrong", "status": "active"},
            permissions=[{"action": "tv.content.manage", "scope": "global"}],
        )
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code == 403

    def test_workspace_a_perm_denied_in_b(self, root_api_module, fr, monkeypatch):
        """5. Perms in A don't apply to B: user is member of both, but only
        has tv.content.manage in A's role. Fetch with B → denied."""
        _safe_dns(monkeypatch)
        _setup_auth(fr, profile=_profile(ws_ids=[WS_A, WS_B]))

        def mem_a(url, kw):
            return "memberships" in url and WS_A in (kw.get("params") or {}).get("workspace_id", "")
        def mem_b(url, kw):
            return "memberships" in url and WS_B in (kw.get("params") or {}).get("workspace_id", "")
        def rp_a(url, kw):
            return "role_permissions" in url and "ra" in (kw.get("params") or {}).get("role_id", "")
        def rp_b(url, kw):
            return "role_permissions" in url and "rb" in (kw.get("params") or {}).get("role_id", "")

        fr.route_pred("GET", mem_a, FakeResponse([{"id": "m-a", "role_id": "ra", "status": "active"}]))
        fr.route_pred("GET", mem_b, FakeResponse([{"id": "m-b", "role_id": "rb", "status": "active"}]))
        fr.route_pred("GET", rp_a, FakeResponse([{"action": "tv.content.manage", "scope": "workspace"}]))
        fr.route_pred("GET", rp_b, FakeResponse([]))
        fr.route("GET", "membership_overrides", FakeResponse([]))
        fr.route("POST", "rbac_audit_logs", FakeResponse([]))

        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")

        assert _fetch(client, ws_id=WS_A, headers=AUTH_HEADERS()).status_code != 403
        assert _fetch(client, ws_id=WS_B, headers=AUTH_HEADERS()).status_code == 403

    def test_body_workspace_id_cannot_bypass_rbac(self, root_api_module, fr, monkeypatch):
        """6. Workspace from body → require_workspace validates membership,
        but RBAC evaluates tv.content.manage in that workspace. No bypass."""
        _safe_dns(monkeypatch)
        _setup_auth(fr, profile=_profile(ws_ids=[WS_A, WS_B]))

        def mem_a(url, kw):
            return "memberships" in url and WS_A in (kw.get("params") or {}).get("workspace_id", "")
        def mem_b(url, kw):
            return "memberships" in url and WS_B in (kw.get("params") or {}).get("workspace_id", "")

        fr.route_pred("GET", mem_a, FakeResponse([{"id": "m-a", "role_id": "ra", "status": "active"}]))
        fr.route_pred("GET", mem_b, FakeResponse([{"id": "m-b", "role_id": "rb", "status": "active"}]))
        fr.route_pred("GET", lambda url, kw: "ra" in (kw.get("params") or {}).get("role_id", ""),
                       FakeResponse([{"action": "tv.content.manage", "scope": "workspace"}]))
        fr.route_pred("GET", lambda url, kw: "rb" in (kw.get("params") or {}).get("role_id", ""),
                       FakeResponse([]))
        fr.route("GET", "membership_overrides", FakeResponse([]))
        fr.route("POST", "rbac_audit_logs", FakeResponse([]))

        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = client.post("/api/tv/source/fetch", json={"workspace_id": WS_B}, headers=AUTH_HEADERS())
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, root_api_module, fr, monkeypatch):
        """7. No auth → 401 regardless of RBAC flag."""
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers={})
        assert resp.status_code == 401

    def test_rate_limit_still_works(self, root_api_module, fr, monkeypatch):
        """8. Rate limit persists with flag ON."""
        _safe_dns(monkeypatch)
        _setup_auth(fr)
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        root_api_module._rate_limit_store["test-ip"] = [
            datetime.now(timezone.utc).timestamp()] * root_api_module.RATE_LIMIT_MAX_REQUESTS
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code == 429

    def test_module_disabled_still_blocks(self, root_api_module, fr, monkeypatch):
        """9. Module disabled → 403 persists regardless of RBAC."""
        _safe_dns(monkeypatch)
        _setup_auth(fr, ws_list=[_workspace(WS_A, disabled=["tv"])])
        _setup_rbac_allow(fr)
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code == 403

    def test_payload_compatible_when_allowed(self, root_api_module, fr, monkeypatch):
        """10. Successful fetch payload shape is unchanged by RBAC."""
        _safe_dns(monkeypatch)
        from openpyxl import Workbook
        import io
        wb = Workbook(); ws = wb.active
        ws.append(["Título", "Data", "Local"])
        ws.append(["Feira", "2026-09-01", "Ginásio"])
        buf = io.BytesIO(); wb.save(buf)
        xlsx = buf.getvalue()

        _setup_auth(fr)
        _setup_rbac_allow(fr)
        fr.route_pred("GET", lambda url, kw: "example.com" in url or "planilha" in url, FakeDownload(xlsx))
        client = _client(fr, root_api_module, monkeypatch)
        monkeypatch.setenv("RBAC_2_ENABLED", "1")
        resp = _fetch(client, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("ok") is True
        assert "events" in data
        assert "validCount" in data
