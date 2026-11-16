"""Regressão do fechamento automático de chamados resolvidos (issue #472)."""

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


def _make_jwt(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url(json.dumps({"exp": int(time.time()) + 3600, **payload}).encode())
    signing_input = f"{header}.{body}".encode()
    signature = _b64url(hmac.new(SUPABASE_JWT_SECRET.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{signature}"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.routes = []
        self.calls = []

    def route(self, method, url_part, response):
        self.routes.append((method, url_part, response))

    def _match(self, method, url, kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for expected_method, part, response in self.routes:
            if expected_method == method and part in url:
                return response
        return FakeResponse([], status_code=404, ok=False)

    def get(self, url, **kwargs):
        return self._match("GET", url, kwargs)

    def post(self, url, **kwargs):
        return self._match("POST", url, kwargs)


@pytest.fixture(scope="session")
def api_module():
    for name, module in list(sys.modules.items()):
        if getattr(module, "__file__", None) and Path(module.__file__).resolve() == API_FILE.resolve():
            if getattr(module, "app", None) is not None:
                return module
    spec = importlib.util.spec_from_file_location("chamados_auto_archive_api", API_FILE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["chamados_auto_archive_api"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def fake_requests():
    return FakeRequests()


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    monkeypatch.setattr(api_module, "record_app_audit", lambda **kwargs: None)
    for name in ("auth", "rbac"):
        module = sys.modules.get(name)
        if module is not None:
            monkeypatch.setattr(module, "requests", fake_requests)
            monkeypatch.setattr(module, "_SUPABASE_URL", SUPABASE_URL)
            monkeypatch.setattr(module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


def _auth(client, fake_requests, monkeypatch, profile, allowed_actions):
    auth_module = sys.modules.get("auth")
    if auth_module is not None:
        monkeypatch.setattr(auth_module, "_verify_jwt", lambda token: {"sub": profile["id"]})
    fake_requests.route(
        "GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile])
    )
    fake_requests.route(
        "GET",
        f"/rest/v1/memberships",
        FakeResponse([
            {"profile_id": profile["id"], "workspace_id": workspace_id, "status": "active"}
            for workspace_id in profile.get("workspace_ids", [])
        ]),
    )
    monkeypatch.setattr(
        client.application.view_functions["chamados_auto_archive"].__globals__,
        "rbac_two_can",
        lambda user, workspace_id, action, scope: action in allowed_actions,
    )
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _tech(**overrides):
    profile = {
        "id": "tech-1",
        "email": "tech@test.com",
        "name": "Técnico",
        "role": "technician",
        "is_super_admin": False,
        "workspace_ids": ["ws-a", "ws-b"],
        "status": "active",
    }
    profile.update(overrides)
    return profile


def test_auto_archive_requires_view_and_close_actions(client, fake_requests, monkeypatch):
    profile = _tech()
    headers = _auth(client, fake_requests, monkeypatch, profile, {"ticket.view"})
    response = client.post("/api/chamados/auto-archive", headers=headers)

    assert response.status_code == 200
    assert response.get_json() == {"archivedCount": 0}
    assert not [call for call in fake_requests.calls if "/rpc/auto_archive_resolved_tickets" in call["url"]]


def test_auto_archive_only_passes_workspaces_with_both_actions(client, fake_requests, monkeypatch):
    profile = _tech()
    headers = _auth(client, fake_requests, monkeypatch, profile, {"ticket.view", "ticket.close"})
    fake_requests.route(
        "POST",
        "/rest/v1/rpc/auto_archive_resolved_tickets",
        FakeResponse([{"id": "ticket-1", "workspace_id": "ws-a", "ticketNumber": 7, "roomName": "Sala 101"}]),
    )
    # A autorização por workspace é verificada pelo backend; o teste restringe
    # explicitamente a unidade B para simular override/permissão diferente.
    monkeypatch.setattr(
        client.application.view_functions["chamados_auto_archive"].__globals__,
        "rbac_two_can",
        lambda user, workspace_id, action, scope: (
            workspace_id == "ws-a" and action in {"ticket.view", "ticket.close"}
        ),
    )
    response = client.post("/api/chamados/auto-archive", headers=headers)

    assert response.status_code == 200
    assert response.get_json() == {"archivedCount": 1}
    rpc_calls = [call for call in fake_requests.calls if "/rpc/auto_archive_resolved_tickets" in call["url"]]
    assert len(rpc_calls) == 1
    assert rpc_calls[0]["kwargs"]["json"] == {"p_workspace_ids": ["ws-a"]}


def test_super_admin_runs_system_check_without_client_workspace_scope(client, fake_requests, monkeypatch):
    profile = _tech(is_super_admin=True, workspace_ids=[])
    headers = _auth(client, fake_requests, monkeypatch, profile, set())
    fake_requests.route("POST", "/rest/v1/rpc/auto_archive_resolved_tickets", FakeResponse([]))

    response = client.post("/api/chamados/auto-archive", headers=headers)

    assert response.status_code == 200
    rpc_calls = [call for call in fake_requests.calls if "/rpc/auto_archive_resolved_tickets" in call["url"]]
    assert len(rpc_calls) == 1
    assert rpc_calls[0]["kwargs"]["json"] == {"p_workspace_ids": None}


def test_auto_archive_rpc_failure_returns_502(client, fake_requests, monkeypatch):
    profile = _tech()
    headers = _auth(client, fake_requests, monkeypatch, profile, {"ticket.view", "ticket.close"})
    fake_requests.route(
        "POST",
        "/rest/v1/rpc/auto_archive_resolved_tickets",
        FakeResponse([], status_code=500, ok=False, text="database unavailable"),
    )

    response = client.post("/api/chamados/auto-archive", headers=headers)

    assert response.status_code == 502
