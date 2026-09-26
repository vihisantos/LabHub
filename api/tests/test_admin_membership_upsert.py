"""Tests: membership por unidade (RBAC 2.0, PR #284, migration 072).

Rotas:
- POST   /api/admin/users/<id>/membership  → admin_upsert_membership
- DELETE /api/admin/users/<id>/membership  → admin_remove_membership
- POST   /api/admin/users/<id>/manager     → admin_set_manager

Super-admin-only; conta precisa estar active para conceder acesso (403);
remoção não exige active. Erros da RPC não vazam SQL (502 genérico).
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

UID_ADMIN = "aaaaaaaa-0000-0000-0000-000000000001"
UID_USER = "bbbbbbbb-0000-0000-0000-000000000002"
WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
M_MGR = "33333333-3333-3333-3333-333333333333"


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

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


@pytest.fixture(scope="session")
def api_module():
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
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
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


def _make_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(SUPABASE_JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _setup(monkeypatch, fake_requests, profile):
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([]))
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


ADMIN_PROFILE = {
    "id": UID_ADMIN, "email": "admin@test.com", "name": "Admin",
    "role": "technician", "is_super_admin": True,
    "workspace_ids": [WS_A], "status": "active",
}

TECH_PROFILE = {
    "id": UID_USER, "email": "t@test.com", "name": "T",
    "role": "technician", "is_super_admin": False,
    "workspace_ids": [WS_A], "status": "active",
}


class TestAdminUpsertMembership:
    def test_sem_token_retorna_401(self, client):
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-technician"})
        assert resp.status_code == 401

    def test_nao_admin_retorna_403_sem_chamar_rpc(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, TECH_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-technician"},
                           headers=headers)
        assert resp.status_code == 403
        assert fake_requests.calls_for("POST", "admin_upsert_membership") == []

    def test_user_id_invalido_retorna_400(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        resp = client.post("/api/admin/users/nao-uuid/membership",
                           json={"workspace_id": WS_A, "role": "role-technician"},
                           headers=headers)
        assert resp.status_code == 400

    def test_workspace_invalido_retorna_400(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": "x", "role": "role-technician"},
                           headers=headers)
        assert resp.status_code == 400
        assert fake_requests.calls_for("POST", "admin_upsert_membership") == []

    def test_cargo_desconhecido_retorna_400_sem_chamar_rpc(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-custom-xyz"},
                           headers=headers)
        assert resp.status_code == 400
        assert fake_requests.calls_for("POST", "admin_upsert_membership") == []

    def test_ok_mapeia_role_para_slug_e_devolve_membership(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        row = {"id": "m-1", "profile_id": UID_USER, "workspace_id": WS_A,
               "role_id": "r-tec", "status": "active", "managed_by": None}
        fake_requests.route("POST", "/rest/v1/rpc/admin_upsert_membership", FakeResponse(row))
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-technician"},
                           headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["membership"] == row
        calls = fake_requests.calls_for("POST", "admin_upsert_membership")
        assert len(calls) == 1
        assert calls[0]["kwargs"]["json"] == {
            "p_user_id": UID_USER, "p_workspace_id": WS_A, "p_role_slug": "tec"}

    def test_profile_not_found_vira_404(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_upsert_membership",
                            FakeResponse({"message": "profile not found: x"}, status_code=400, ok=False))
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-viewer"},
                           headers=headers)
        assert resp.status_code == 404

    def test_conta_pending_vira_403(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_upsert_membership",
                            FakeResponse({"message": "profile is not active (status=pending)"},
                                         status_code=400, ok=False))
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-viewer"},
                           headers=headers)
        assert resp.status_code == 403
        assert "ativa" in resp.get_json()["error"]

    def test_rpc_erro_generico_vira_502_sem_vazar_sql(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_upsert_membership",
                            FakeResponse({"message": "remaining connection slots are reserved"},
                                         status_code=500, ok=False))
        resp = client.post(f"/api/admin/users/{UID_USER}/membership",
                           json={"workspace_id": WS_A, "role": "role-technician"},
                           headers=headers)
        assert resp.status_code == 502
        assert "connection slots" not in resp.get_json()["error"]


class TestAdminRemoveMembership:
    def test_nao_admin_retorna_403_sem_chamar_rpc(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, TECH_PROFILE)
        resp = client.delete(f"/api/admin/users/{UID_USER}/membership",
                             json={"workspace_id": WS_A}, headers=headers)
        assert resp.status_code == 403
        assert fake_requests.calls_for("POST", "admin_remove_membership") == []

    def test_ok_devolve_removed(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_remove_membership", FakeResponse(True))
        resp = client.delete(f"/api/admin/users/{UID_USER}/membership",
                             json={"workspace_id": WS_A}, headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["removed"] is True
        calls = fake_requests.calls_for("POST", "admin_remove_membership")
        assert len(calls) == 1
        assert calls[0]["kwargs"]["json"] == {"p_user_id": UID_USER, "p_workspace_id": WS_A}

    def test_profile_not_found_vira_404(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_remove_membership",
                            FakeResponse({"message": "profile not found: x"}, status_code=400, ok=False))
        resp = client.delete(f"/api/admin/users/{UID_USER}/membership",
                             json={"workspace_id": WS_A}, headers=headers)
        assert resp.status_code == 404


class TestAdminSetManager:
    def test_nao_admin_retorna_403_sem_chamar_rpc(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, TECH_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": M_MGR},
                           headers=headers)
        assert resp.status_code == 403
        assert fake_requests.calls_for("POST", "admin_set_manager") == []

    def test_manager_invalido_retorna_400(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": "x"},
                           headers=headers)
        assert resp.status_code == 400
        assert fake_requests.calls_for("POST", "admin_set_manager") == []

    def test_ok_com_manager_e_com_null(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        row = {"id": "m-1", "profile_id": UID_USER, "workspace_id": WS_A,
               "role_id": "r-tec", "status": "active", "managed_by": M_MGR}
        fake_requests.route("POST", "/rest/v1/rpc/admin_set_manager", FakeResponse(row))
        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": M_MGR},
                           headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["membership"] == row
        calls = fake_requests.calls_for("POST", "admin_set_manager")
        assert calls[0]["kwargs"]["json"] == {
            "p_user_id": UID_USER, "p_workspace_id": WS_A, "p_manager_membership_id": M_MGR}

        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": None},
                           headers=headers)
        assert resp.status_code == 200
        calls = fake_requests.calls_for("POST", "admin_set_manager")
        assert len(calls) == 2
        assert calls[1]["kwargs"]["json"]["p_manager_membership_id"] is None

    def test_gestor_outra_unidade_vira_400(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_set_manager",
                            FakeResponse({"message": "manager must belong to the same workspace"},
                                         status_code=400, ok=False))
        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": M_MGR},
                           headers=headers)
        assert resp.status_code == 400
        assert "Responsável" in resp.get_json()["error"]

    def test_conta_pending_vira_403(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests.route("POST", "/rest/v1/rpc/admin_set_manager",
                            FakeResponse({"message": "profile is not active (status=pending)"},
                                         status_code=400, ok=False))
        resp = client.post(f"/api/admin/users/{UID_USER}/manager",
                           json={"workspace_id": WS_A, "manager_membership_id": M_MGR},
                           headers=headers)
        assert resp.status_code == 403
