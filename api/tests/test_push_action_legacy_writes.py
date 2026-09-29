"""Tests: `/api/push/action` com as escritas legadas fechadas (PR-4D-A).

A rota é o atalho usado pela notificação (super admin) para aprovar/rejeitar um
usuário pendente. Sem OPÇÃO de botão no SW, ela segue exigindo `require_auth` +
`require_admin`. As duas escritas em `profiles` foram fechadas:

  · approve → grava SOMENTE `status='active'`. NÃO escreve `role`, `app_access`,
    `workspace_ids` nem cria membership (cargo/override virão via RBAC 2.0);
  · reject → NÃO apaga o `profiles` (DELETE nunca revogou a sessão Auth).
    Transição condicional `pending -> rejected` (a condição mora no próprio
    UPDATE, via PostgREST `id` + `status` na mesma instrução — sem corrida) +
    ban da identidade Auth (PUT /auth/v1/admin/users/<id>) + auditoria
    `account_rejected`. Já rejeitado é idempotente; fora de `pending` é 409;
    falha do ban compensa (502); sem compensação possível o `rejected` permanece
    e o `require_auth` já o nega (fail-closed).
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

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

UID_ADMIN = "aaaaaaaa-0000-0000-0000-000000000001"
UID_PENDING = "bbbbbbbb-0000-0000-0000-000000000002"

ADMIN_PROFILE = {
    "id": UID_ADMIN, "email": "admin@test.com", "name": "Admin",
    "role": "technician", "is_super_admin": True,
    "workspace_ids": ["ws-test"], "status": "active",
}


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    """Fake que distingue leituras de `profiles` pelo parâmetro `id` (needle)."""

    def __init__(self):
        self.calls = []
        self._routes = {}
        self._param_routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def replace(self, method, url_part, response):
        self._routes[method] = [
            (p, r) for (p, r) in self._routes.get(method, []) if p != url_part
        ]
        self._routes[method].append((url_part, response))

    def route_param(self, method, url_part, param_needle, response):
        self._param_routes.setdefault(method, []).append(
            (url_part, param_needle, response)
        )

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for part, response in self._routes.get(method, []):
            if part in url:
                return response() if callable(response) else response
        params = str(kwargs.get("params") or "")
        for part, needle, response in self._param_routes.get(method, []):
            if part in url and needle in params:
                return response
        return self._default

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._do("PATCH", url, **kwargs)

    def put(self, url, **kwargs):
        return self._do("PUT", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


def seq(*responses):
    """Respostas SEQUENCIAIS: 1ª chamada, 2ª, ... (última se repete)."""
    state = {"i": 0}

    def _next():
        idx = min(state["i"], len(responses) - 1)
        state["i"] += 1
        return responses[idx]

    return _next


@pytest.fixture(scope="session")
def reservalab_module():
    key = "reservalab_api_push_action"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, RESERVALAB_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


def _make_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    sig_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(SUPABASE_JWT_SECRET.encode(), sig_input.encode(), hashlib.sha256).digest()
    return f"{sig_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


@pytest.fixture()
def client(reservalab_module, fake_requests, monkeypatch):
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": UID_ADMIN})
    monkeypatch.setattr(reservalab_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(reservalab_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(reservalab_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    # require_auth -> perfil do ator (params com id=nós). O alvo usa o needle próprio.
    fake_requests.route_param("GET", "/rest/v1/profiles", f"eq.{UID_ADMIN}",
                              FakeResponse([ADMIN_PROFILE]))
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([]))
    return reservalab_module.app.test_client()


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _setup_target(fake_requests, status="pending", exists=True):
    target = [] if not exists else [
        {"id": UID_PENDING, "email": "p@test.com", "name": "P", "status": status}
    ]
    fake_requests.route_param("GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
                              FakeResponse(target))
    fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([{"id": UID_PENDING}]))
    fake_requests.route("PUT", "/auth/v1/admin/users", FakeResponse({"id": UID_PENDING}))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse({"id": "log-1"}))
    return fake_requests


def _admin_headers():
    return {"Authorization": f"Bearer {_make_jwt({'sub': UID_ADMIN})}"}


class TestApproveSomenteStatus:
    def test_approve_grava_so_status_ignora_role_e_app_access(self, client, fake_requests):
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse(None, status_code=204))
        resp = client.post(
            "/api/push/action",
            json={"action": "approve", "userId": UID_PENDING,
                  "role": "admin", "app_access": {"reservalab": "full"}},
            headers=_admin_headers(),
        )
        assert resp.status_code == 200
        assert resp.get_json() == {"status": "approved"}
        patch_calls = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert len(patch_calls) == 1
        payload = patch_calls[0]["kwargs"]["json"]
        assert set(payload) == {"status", "updated_at"}
        assert payload["status"] == "active"
        assert "role" not in payload
        assert "app_access" not in payload
        assert "workspace_ids" not in payload
        assert fake_requests.calls_for("DELETE", "/rest/v1/profiles") == []

    def test_approve_sem_role_e_app_access_mantem_semantica(self, client, fake_requests):
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse(None, status_code=204))
        resp = client.post(
            "/api/push/action",
            json={"action": "approve", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 200
        payload = fake_requests.calls_for("PATCH", "/rest/v1/profiles")[0]["kwargs"]["json"]
        assert set(payload) == {"status", "updated_at"}


class TestRejectEstadoEBan:
    def test_reject_pending_rejected_com_ban_e_auditoria(self, client, fake_requests):
        _setup_target(fake_requests, status="pending")
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 200
        assert resp.get_json() == {"status": "rejected", "auth_disabled": True}

        patch_calls = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert len(patch_calls) == 1
        assert patch_calls[0]["kwargs"]["json"]["status"] == "rejected"
        assert "eq.pending" in str(patch_calls[0]["kwargs"]["params"])

        ban_calls = fake_requests.calls_for("PUT", "/auth/v1/admin/users")
        assert len(ban_calls) == 1
        assert ban_calls[0]["kwargs"]["json"]["ban_duration"] == "876000h"

        audit = fake_requests.calls_for("POST", "/rest/v1/app_audit_logs")
        assert len(audit) == 1
        assert audit[0]["kwargs"]["json"]["action"] == "account_rejected"
        assert audit[0]["kwargs"]["json"]["meta"]["new_status"] == "rejected"

    def test_reject_nao_apaga_profile(self, client, fake_requests):
        _setup_target(fake_requests, status="pending")
        client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert fake_requests.calls_for("DELETE", "/rest/v1/profiles") == []
        assert fake_requests.calls_for("DELETE", "/auth/v1/admin/users") == []

    def test_reject_ja_rejeitado_e_idempotente(self, client, fake_requests):
        _setup_target(fake_requests, status="rejected")
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 200
        assert resp.get_json() == {"status": "rejected", "idempotent": True}
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []

    def test_reject_conta_ativa_retorna_409_sem_escrita(self, client, fake_requests):
        _setup_target(fake_requests, status="active")
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 409
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []

    def test_reject_conta_inexistente_404(self, client, fake_requests):
        _setup_target(fake_requests, status="pending", exists=False)
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 404

    def test_ban_falha_compensa_e_retorna_502(self, client, fake_requests):
        _setup_target(fake_requests, status="pending")
        fake_requests.replace("PUT", "/auth/v1/admin/users",
                              FakeResponse({}, status_code=500, ok=False))
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["rolled_back"] is True
        patches = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert patches[0]["kwargs"]["json"]["status"] == "rejected"
        assert "eq.pending" in str(patches[0]["kwargs"]["params"])
        assert patches[1]["kwargs"]["json"]["status"] == "pending"
        assert "eq.rejected" in str(patches[1]["kwargs"]["params"])

    def test_ban_falha_e_compensacao_falha_fail_closed(self, client, fake_requests):
        _setup_target(fake_requests, status="pending")
        fake_requests.replace("PUT", "/auth/v1/admin/users",
                              FakeResponse({}, status_code=500, ok=False))
        fake_requests.replace("PATCH", "/rest/v1/profiles",
                              seq(FakeResponse([{"id": UID_PENDING}]), FakeResponse([])))
        resp = client.post(
            "/api/push/action",
            json={"action": "reject", "userId": UID_PENDING},
            headers=_admin_headers(),
        )
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["rolled_back"] is False