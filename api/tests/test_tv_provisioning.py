"""Provisionamento de identidade do kiosk TV (PR 1).

Cobre /api/tv/activation/redeem e /api/tv/devices/provision:
criação de usuário GoTrue sem senha, geração de token_hash, vínculo em
tv_devices, consumo single-use do código e autorização do fluxo com login.
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

API_FILE = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"
DEVICE_ID = "11111111-2222-3333-4444-555555555555"
TOKEN_HASH = "hashed-token-abc123"


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    """Mesma infraestrutura de test_chamados.py (roteio por substring da URL)."""

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


@pytest.fixture(scope="session")
def api_module():
    for existing in ("chamados_api", "root_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            if Path(getattr(sys.modules[existing], "__file__", "")) == API_FILE:
                return sys.modules[existing]
    spec = importlib.util.spec_from_file_location("chamados_api", API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["chamados_api"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    monkeypatch.setattr(api_module, "_get_client_ip", lambda: "test-ip")
    monkeypatch.delenv("RBAC_2_ENABLED", raising=False)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


# ── Rotas fake padrão do fluxo de ativação ──

ACTIVATION_ROW = {
    "id": "code-row-1",
    "code": "ABC234",
    "workspace_id": "ws-a",
    "user_id": "human-user",
    "device_name": "TV Recepção",
    "status": "pending",
    "expires_at": None,
}

WORKSPACE = {"id": "ws-a", "name": "Anhembi Piracicaba", "slug": "piracicaba"}


def _route_happy_path(fake_requests):
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([ACTIVATION_ROW]))
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([WORKSPACE]))
    fake_requests.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fake_requests.route(
        "POST",
        "/auth/v1/admin/generate_link",
        FakeResponse({
            "properties": {
                "action_link": (
                    f"{SUPABASE_URL}/auth/v1/verify"
                    f"?token={TOKEN_HASH}&type=magiclink&redirect_to=https://x"
                )
            },
            "user": {"id": "dev-user-1"},
        }),
    )
    fake_requests.route("POST", "/rest/v1/tv_devices", FakeResponse([]))
    fake_requests.route(
        "PATCH", "tv_activation_codes?id=eq.",
        FakeResponse([dict(ACTIVATION_ROW, status="used")]),
    )


# ── Redeem (fluxo anon do desktop) ──

def test_redeem_provisions_device_session(client, fake_requests):
    _route_happy_path(fake_requests)
    res = client.post("/api/tv/activation/redeem", json={
        "code": "ABC234",
        "device_id": DEVICE_ID,
        "device_name": "TV Lab 2",
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["token_hash"] == TOKEN_HASH
    assert data["workspace"]["id"] == "ws-a"
    assert data["device_name"] == "TV Lab 2"

    # Usuário GoTrue criado SEM senha e marcado como device
    create_calls = fake_requests.calls_for("POST", "/auth/v1/admin/users")
    assert len(create_calls) == 1
    sent = create_calls[0]["kwargs"]["json"]
    assert sent["email"] == f"kiosk-{DEVICE_ID}@devices.labhub.local"
    assert sent["email_confirm"] is True
    assert "password" not in sent
    assert sent["user_metadata"]["role"] == "tv_device"

    # Magic link gerado para o mesmo e-mail
    link_calls = fake_requests.calls_for("POST", "/auth/v1/admin/generate_link")
    assert len(link_calls) == 1
    assert link_calls[0]["kwargs"]["json"]["type"] == "magiclink"

    # Device vinculado ao usuário gerado e ao workspace do código
    upserts = fake_requests.calls_for("POST", "/rest/v1/tv_devices")
    assert len(upserts) == 1
    up = upserts[0]["kwargs"]["json"]
    assert up["id"] == DEVICE_ID
    assert up["user_id"] == "dev-user-1"
    assert up["workspace_id"] == "ws-a"

    # Código consumido (uso único)
    assert len(fake_requests.calls_for("PATCH", "tv_activation_codes")) == 1


def test_redeem_rejects_invalid_device_id(client, fake_requests):
    res = client.post("/api/tv/activation/redeem", json={
        "code": "ABC234",
        "device_id": "não-sou-uuid'; DROP--",
    })
    assert res.status_code == 400
    assert not fake_requests.calls_for("POST", "/auth/v1/admin")


def test_redeem_code_already_used_never_provisions(client, fake_requests):
    used = dict(ACTIVATION_ROW, status="used")
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([used]))
    res = client.post("/api/tv/activation/redeem", json={
        "code": "ABC234",
        "device_id": DEVICE_ID,
    })
    assert res.status_code == 400
    assert not fake_requests.calls_for("POST", "/auth/v1/admin/users")
    assert not fake_requests.calls_for("POST", "/rest/v1/tv_devices")


def test_redeem_provision_failure_does_not_consume_code(client, fake_requests):
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([ACTIVATION_ROW]))
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([WORKSPACE]))
    fake_requests.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fake_requests.route(
        "POST", "/auth/v1/admin/generate_link",
        FakeResponse({}, status_code=500, ok=False),
    )
    res = client.post("/api/tv/activation/redeem", json={
        "code": "ABC234",
        "device_id": DEVICE_ID,
    })
    assert res.status_code == 502
    assert "token_hash" not in (res.get_json() or {})
    assert not fake_requests.calls_for("PATCH", "tv_activation_codes")


def test_redeem_rate_limited(client, api_module):
    now = datetime_now_ts()
    api_module._rate_limit_store["tv-redeem:test-ip"] = [now] * api_module.RATE_LIMIT_MAX_REQUESTS
    res = client.post("/api/tv/activation/redeem", json={"code": "ABC234", "device_id": DEVICE_ID})
    assert res.status_code == 429


def datetime_now_ts():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).timestamp()


# ── Provision com login humano (painel web) ──

SUPER_ADMIN_PROFILE = {
    "id": "user-1",
    "email": "admin@test.com",
    "is_super_admin": True,
    "workspace_ids": ["ws-a"],
}

MEMBER_PROFILE = {
    "id": "user-2",
    "email": "tecnico@test.com",
    "is_super_admin": False,
    "workspace_ids": ["ws-a"],
}


def _setup_auth(fake_requests, monkeypatch, profile):
    auth_mod = sys.modules.get("auth")
    monkeypatch.setattr(auth_mod, "requests", fake_requests)
    monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    fake_requests.route("GET", "/auth/v1/user", FakeResponse({"id": profile["id"]}))
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _route_provision_backend(fake_requests):
    fake_requests.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fake_requests.route(
        "POST",
        "/auth/v1/admin/generate_link",
        FakeResponse({
            "properties": {
                "action_link": (
                    f"{SUPABASE_URL}/auth/v1/verify"
                    f"?token={TOKEN_HASH}&type=magiclink&redirect_to=https://x"
                )
            },
            "user": {"id": "dev-user-1"},
        }),
    )
    fake_requests.route(
        "GET", "/rest/v1/workspaces",
        FakeResponse([{"id": "ws-a", "name": "Anhembi Piracicaba", "slug": "piracicaba"}]),
    )
    fake_requests.route("POST", "/rest/v1/tv_devices", FakeResponse([]))


def test_provision_with_login_super_admin(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_provision_backend(fake_requests)
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID, "device_name": "TV Auditório"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["token_hash"] == TOKEN_HASH
    up = fake_requests.calls_for("POST", "/rest/v1/tv_devices")[0]["kwargs"]["json"]
    assert up["user_id"] == "dev-user-1"


def test_provision_with_login_member_of_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_provision_backend(fake_requests)
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert res.status_code == 200


def test_provision_with_login_member_other_workspace_forbidden(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-outro", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/auth/v1/admin/users")


def test_provision_requires_auth(client):
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID},
    )
    assert res.status_code == 401
