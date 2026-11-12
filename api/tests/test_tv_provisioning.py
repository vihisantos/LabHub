"""Provisionamento de identidade do kiosk TV (PR 1).

Cobre /api/tv/activation/redeem e /api/tv/devices/provision:
criação de usuário GoTrue sem senha, geração de token_hash, vínculo em
tv_devices, consumo single-use do código e autorização do fluxo com login.
"""
import base64
import hashlib
import hmac
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

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
    # All API tests share the canonical root_api module because the Flask app
    # imported by api/app.py is a process-wide singleton.
    from _api_loader import load_api
    return load_api()


@pytest.fixture()
def fake_requests():
    return FakeRequests()


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    monkeypatch.setattr(api_module, "_get_client_ip", lambda: "test-ip")
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
            "id": "dev-user-1",
            "action_link": (
                f"{SUPABASE_URL}/auth/v1/verify"
                f"?token={TOKEN_HASH}&type=magiclink&redirect_to=https://x"
            ),
        }),
    )
    fake_requests.route("POST", "/rest/v1/tv_devices", FakeResponse([]))
    fake_requests.route("PATCH", "tv_activation_codes?id=eq.", FakeResponse([]))


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
    token_payload = {"sub": profile["id"], "session_id": SESSION_ID, "exp": int(time.time()) + 3600}
    monkeypatch.setattr("auth._verify_jwt", lambda t: dict(token_payload))
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    fake_requests.route("GET", "/auth/v1/user", FakeResponse({"id": profile["id"]}))
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    fake_requests.route("POST", "/rpc/labhub_auth_session_is_active", FakeResponse(True))
    return {"Authorization": f"Bearer {_make_jwt(token_payload)}"}


def _route_session_context(fake_requests, workspace_id="ws-a", revision=1):
    fake_requests._routes.setdefault("POST", []).insert(0, (
        "/rpc/labhub_get_session_workspace_context",
        FakeResponse([{"workspace_id": workspace_id, "revision": revision}]),
    ))


def _route_activation_insert(fake_requests, workspace_id="ws-a", code="AB23CD"):
    from datetime import datetime, timedelta, timezone
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    fake_requests._routes.setdefault("POST", []).insert(0, (
        "/rpc/labhub_create_tv_activation_for_context",
        FakeResponse([{
            "code": code, "expires_at": expires,
            "workspace_id": workspace_id, "device_name": None,
        }]),
    ))


def _route_workspace(fake_requests, workspace_id="ws-a", disabled_apps=None):
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([{
        "id": workspace_id, "name": workspace_id, "slug": workspace_id,
        "disabled_apps": disabled_apps if disabled_apps is not None else [],
    }]))


def _route_session_active(fake_requests, active: bool):
    fake_requests._routes.setdefault("POST", []).insert(0, (
        "/rpc/labhub_auth_session_is_active", FakeResponse(active),
    ))


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
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    _route_provision_backend(fake_requests)
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert res.status_code == 200


def test_provision_with_login_member_other_workspace_forbidden(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
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


# ── Provision/activation decidem por memberships (9.2-D.1-TV) ─────────────────

def _memberships(fake_requests, uid, ws_ids):
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([
        {"profile_id": uid, "workspace_id": w, "status": "active"} for w in ws_ids
    ]))


def test_provision_segue_memberships_nao_a_coluna(client, fake_requests, monkeypatch):
    """Legado diz ws-a, membership ativa é ws-b → ws-b permite, ws-a nega."""
    profile = dict(MEMBER_PROFILE, workspace_ids=["ws-a"])
    headers = _setup_auth(fake_requests, monkeypatch, profile)
    _memberships(fake_requests, profile["id"], ["ws-b"])
    _route_provision_backend(fake_requests)
    ok = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-b", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert ok.status_code == 200
    denied = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert denied.status_code == 403


def test_provision_sem_membership_nega_mesmo_com_coluna(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], [])
    res = client.post(
        "/api/tv/devices/provision",
        json={"workspace_id": "ws-a", "device_id": DEVICE_ID},
        headers=headers,
    )
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/auth/v1/admin/users")


def test_activation_create_workspace_validado_por_membership(client, fake_requests, monkeypatch):
    """O workspace da sessão é usado e o código mantém contrato desktop."""
    profile = dict(MEMBER_PROFILE, workspace_ids=["ws-legado"])
    headers = _setup_auth(fake_requests, monkeypatch, profile)
    _memberships(fake_requests, profile["id"], ["ws-b"])
    _route_session_context(fake_requests, "ws-b", 4)
    _allow_tv_manage(monkeypatch)
    fake_requests.route(
        "GET", "/rest/v1/workspaces",
        FakeResponse([{"id": "ws-b", "name": "WS B", "slug": "b", "disabled_apps": []}]),
    )
    _route_activation_insert(fake_requests, "ws-b")
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-b", "revision": 4}, headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data["workspace_id"] == "ws-b"
    assert data["code"] == "AB23CD"
    assert len(data["code"]) == 6 and data["code"].upper() == data["code"]
    expiry = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
    assert 23 * 3600 < (expiry - datetime.now(timezone.utc)).total_seconds() <= 24 * 3600
    posts = fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")
    assert posts and posts[0]["kwargs"]["json"]["p_expected_workspace_id"] == "ws-b"
    assert posts[0]["kwargs"]["json"]["p_expected_revision"] == 4


def test_activation_create_sem_membership_retorna_403(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _route_workspace(fake_requests)
    _memberships(fake_requests, MEMBER_PROFILE["id"], [])
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a"}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def _allow_tv_manage(monkeypatch, allowed=True):
    rbac_module = sys.modules.get("rbac")
    assert rbac_module is not None
    # Exercita rbac_can real: só os leitores dos registros RBAC são dublados.
    # Assim o decorator continua precisando resolver ação/scope, membership e
    # a precedência de overrides definida pelo mecanismo central.
    monkeypatch.setattr(
        rbac_module, "_fetch_membership",
        lambda _profile_id, _workspace_id: {
            "id": "membership-test", "role_id": "role-test", "status": "active",
        },
    )
    monkeypatch.setattr(
        rbac_module, "_fetch_role_permissions",
        lambda _role_id, _scope: {"tv.manage"} if allowed else set(),
    )
    monkeypatch.setattr(rbac_module, "_fetch_overrides", lambda _membership_id: {})
    monkeypatch.setattr(rbac_module, "record_rbac_audit", lambda **_kwargs: None)


def test_activation_create_requires_authentication(client):
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a"})
    assert res.status_code == 401


def test_activation_create_rejeita_sem_tv_manage(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    _allow_tv_manage(monkeypatch, False)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps=[])]))
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 1}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_rejeita_modulo_tv_desabilitado_inclusive_superadmin(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _allow_tv_manage(monkeypatch, True)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps=["tv"])]))
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 1}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_falha_fechado_com_disabled_apps_invalido(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    _allow_tv_manage(monkeypatch, True)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps="valor-invalido")]))
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 1}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_member_nao_pode_escolher_outro_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_session_context(fake_requests, "ws-b", 2)
    _route_workspace(fake_requests, "ws-b")
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-b"])
    _allow_tv_manage(monkeypatch, True)
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 2}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_member_com_multiplas_memberships_so_usa_contexto_ativo(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a", "ws-b"])
    _route_session_context(fake_requests, "ws-b", 8)
    _allow_tv_manage(monkeypatch, True)
    _route_workspace(fake_requests, "ws-b")

    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 8}, headers=headers)

    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_superadmin_com_tv_habilitada(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _allow_tv_manage(monkeypatch, True)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps=[])]))
    _route_activation_insert(fake_requests, "ws-a")
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 1}, headers=headers)
    assert res.status_code == 200
    posts = fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")
    assert posts[0]["kwargs"]["json"]["p_expected_workspace_id"] == "ws-a"


def test_activation_create_superadmin_nao_pode_alterar_workspace_no_payload(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 6)
    _route_workspace(fake_requests)
    _allow_tv_manage(monkeypatch, True)
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-b", "revision": 6}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_rejeita_revisao_divergente_sem_inserir(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 6)
    _route_workspace(fake_requests)
    _allow_tv_manage(monkeypatch, True)
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-a", "revision": 5}, headers=headers)
    assert res.status_code == 409
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


@pytest.mark.parametrize("session_id", [None, "not-a-uuid"])
def test_activation_create_rejeita_session_id_ausente_ou_invalido(client, fake_requests, monkeypatch, session_id):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    monkeypatch.setattr("auth._verify_jwt", lambda _token: {
        "sub": SUPER_ADMIN_PROFILE["id"], "exp": int(time.time()) + 3600,
        **({"session_id": session_id} if session_id is not None else {}),
    })
    res = client.post("/api/tv/activation/create", json={"revision": 1}, headers=headers)
    assert res.status_code == 401
    assert not fake_requests.calls_for("POST", "/rpc/labhub_auth_session_is_active")
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_activation_create_rejeita_token_expirado_e_sessao_revogada(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    monkeypatch.setattr("auth._verify_jwt", lambda _token: {
        "sub": SUPER_ADMIN_PROFILE["id"], "session_id": SESSION_ID,
        "exp": int(time.time()) - 5,
    })
    _route_session_active(fake_requests, False)
    res = client.post("/api/tv/activation/create", json={"revision": 1}, headers=headers)
    assert res.status_code == 401
    assert not fake_requests.calls_for("POST", "/rpc/labhub_get_session_workspace_context")
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_contexto_e_isolado_por_duas_sessoes_do_mesmo_usuario(client, fake_requests, monkeypatch):
    headers_a = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 2)
    _allow_tv_manage(monkeypatch, True)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps=[])]))
    _route_activation_insert(fake_requests, "ws-a", code="AB23CD")
    first = client.post("/api/tv/activation/create", json={"revision": 2}, headers=headers_a)
    assert first.status_code == 200

    second_session = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
    monkeypatch.setattr("auth._verify_jwt", lambda _token: {
        "sub": SUPER_ADMIN_PROFILE["id"], "session_id": second_session,
        "exp": int(time.time()) + 3600,
    })
    _route_session_context(fake_requests, "ws-a", 9)
    _route_activation_insert(fake_requests, "ws-a", code="CD34EF")
    headers_b = {"Authorization": f"Bearer {_make_jwt({'sub': SUPER_ADMIN_PROFILE['id'], 'session_id': second_session})}"}
    second = client.post("/api/tv/activation/create", json={"revision": 9}, headers=headers_b)
    assert second.status_code == 200

    calls = fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")
    assert [call["kwargs"]["json"]["p_session_id"] for call in calls] == [SESSION_ID, second_session]


def test_activation_create_superadmin_sem_workspace_explicito_rejeitado(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    res = client.post("/api/tv/activation/create", json={"revision": 1}, headers=headers)
    assert res.status_code == 404
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


def test_workspace_context_switch_persists_only_validated_session_and_returns_revision(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE)]))
    fake_requests.route("POST", "/rpc/labhub_set_session_workspace_context", FakeResponse({
        "session_id": SESSION_ID, "workspace_id": "ws-a", "revision": 11,
    }))

    res = client.put("/api/workspace/active-context", json={"workspace_id": "ws-a"}, headers=headers)

    assert res.status_code == 200
    assert res.get_json()["workspace"]["id"] == "ws-a"
    assert res.get_json()["revision"] == 11
    params = fake_requests.calls_for("POST", "/rpc/labhub_set_session_workspace_context")[0]["kwargs"]["json"]
    assert params["p_session_id"] == SESSION_ID
    assert params["p_user_id"] == MEMBER_PROFILE["id"]
    assert params["p_workspace_id"] == "ws-a"


def test_workspace_context_switch_rejeita_workspace_sem_membership(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    res = client.put("/api/workspace/active-context", json={"workspace_id": "ws-b"}, headers=headers)
    assert res.status_code == 403
    assert not fake_requests.calls_for("POST", "/rpc/labhub_set_session_workspace_context")


def test_activation_create_nao_aceita_workspace_somente_na_query(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    _route_session_context(fake_requests, "ws-a", 1)
    _allow_tv_manage(monkeypatch, True)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([dict(WORKSPACE, disabled_apps=[])]))
    _route_activation_insert(fake_requests, "ws-a")
    res = client.post("/api/tv/activation/create?workspace_id=ws-b", json={"revision": 1}, headers=headers)
    assert res.status_code == 200
    insert = fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")
    assert insert[0]["kwargs"]["json"]["p_expected_workspace_id"] == "ws-a"


def test_activation_create_workspace_inexistente_rejeitado(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _route_session_context(fake_requests, "ws-missing", 1)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-missing"])
    res = client.post("/api/tv/activation/create", json={"workspace_id": "ws-missing", "revision": 1}, headers=headers)
    assert res.status_code == 404
    assert not fake_requests.calls_for("POST", "/rpc/labhub_create_tv_activation_for_context")


# ── Lista de TVs por workspace ─────────────────────────────────────────────────

def test_devices_list_returns_workspace_tvs(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    fake_requests.route("GET", "tv_devices?", FakeResponse([
        {"id": DEVICE_ID, "name": "TV Recepção", "workspace_id": "ws-a",
         "last_seen": None, "created_at": "2026-01-01T00:00:00Z"},
    ]))
    res = client.get("/api/tv/devices?workspace_id=ws-a", headers=headers)
    assert res.status_code == 200
    devices = (res.get_json() or {}).get("devices") or []
    assert devices[0]["id"] == DEVICE_ID
    assert devices[0]["workspace_id"] == "ws-a"


def test_devices_list_member_same_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    fake_requests.route("GET", "tv_devices?", FakeResponse([]))
    res = client.get("/api/tv/devices?workspace_id=ws-a", headers=headers)
    assert res.status_code == 200
    assert (res.get_json() or {}).get("devices") == []


def test_devices_list_member_other_workspace_forbidden(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a"])
    res = client.get("/api/tv/devices?workspace_id=ws-outro", headers=headers)
    assert res.status_code == 403


def test_devices_list_all_own_workspaces_member(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], ["ws-a", "ws-b"])
    fake_requests.route("GET", "tv_devices?", FakeResponse([
        {"id": "dev-a", "name": "TV A", "workspace_id": "ws-a"},
        {"id": "dev-b", "name": "TV B", "workspace_id": "ws-b"},
    ]))
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([
        {"id": "ws-a", "name": "Anhembi A"},
        {"id": "ws-b", "name": "Anhembi B"},
    ]))
    res = client.get("/api/tv/devices", headers=headers)
    assert res.status_code == 200
    devices = (res.get_json() or {}).get("devices") or []
    assert [d["id"] for d in devices] == ["dev-a", "dev-b"]
    assert devices[0]["workspace_name"] == "Anhembi A"
    assert "workspace_id=in." in fake_requests.calls_for("GET", "tv_devices?")[0]["url"]


def test_devices_list_super_admin_sees_all_without_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, SUPER_ADMIN_PROFILE)
    fake_requests.route("GET", "tv_devices?", FakeResponse([
        {"id": "dev-x", "name": "TV X", "workspace_id": "ws-z"},
    ]))
    res = client.get("/api/tv/devices", headers=headers)
    assert res.status_code == 200
    devices = (res.get_json() or {}).get("devices") or []
    assert len(devices) == 1
    assert not any("workspace_id=in." in c["url"] for c in fake_requests.calls_for("GET", "tv_devices?"))


def test_devices_list_member_sem_workspaces_retorna_vazio(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch, MEMBER_PROFILE)
    _memberships(fake_requests, MEMBER_PROFILE["id"], [])
    res = client.get("/api/tv/devices", headers=headers)
    assert res.status_code == 200
    assert (res.get_json() or {}).get("devices") == []
    assert not fake_requests.calls_for("GET", "tv_devices?")


def test_devices_list_requires_auth(client):
    assert client.get("/api/tv/devices").status_code == 401
    assert client.get("/api/tv/devices?workspace_id=ws-a").status_code == 401
