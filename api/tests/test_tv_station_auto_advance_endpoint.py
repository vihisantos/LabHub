"""Testes dos endpoints de AUTO-ADVANCE da TV Station (Fase 2.14).

  POST /api/tv/station/auto-advance              — sinal do Desktop (event-driven)
  POST /api/tv/station/auto-advance/backstop     — cron (*/5, cover de falhas)

Cobertura:
  - Device-only: workspace resolvido do vínculo tv_devices.user_id (cliente
    NUNCA manda workspace; payload extra é ignorado).
  - device_id opcional precisa pertencer ao próprio usuário/workspace (403).
  - Rate limit dedicado por {workspace}:{ip}.
  - Mapeamento do RPC: applied/replayed/no_op + 40900 → conflict; erro 502.
  - Backstop: fail-closed (503 sem CRON_SECRET, 401 token errado), varre
    state=eq.playing e agrega tallies por workspace.
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

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"
CRON_SECRET = "cron-secret-test-123456"

WS_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
WS_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
DEVICE_USER_A = "dev-user-a"
DEVICE_A_ID = "11111111-1111-1111-1111-111111111111"
TRACK_ID = "22222222-2222-2222-2222-222222222222"

ENDPOINT_SIGNAL = "/api/tv/station/auto-advance"
ENDPOINT_BACKSTOP = "/api/tv/station/auto-advance/backstop"


# ── Fakes (mesma infraestrutura de test_tv_chamados_display.py) ───────────────

class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (status_code == 200) if ok is None else ok
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepta requests; rotas por substring da URL ou predicado (última vence)."""

    def __init__(self):
        self.calls = []
        self._routes = []
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.append((method, url_part, response, None))

    def route_pred(self, method, predicate, response):
        self._routes.append((method, "", response, predicate))

    def _match(self, method, url, kwargs):
        joined = "&".join(f"{k}={v}" for k, v in (kwargs.get("params") or {}).items())
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

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)


# ── JWT ───────────────────────────────────────────────────────────────────────

def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _token_for(user_id=DEVICE_USER_A):
    return _make_jwt({
        "sub": user_id,
        "iss": f"{SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
    })


def headers_for(user_id=DEVICE_USER_A):
    return {"Authorization": f"Bearer {_token_for(user_id)}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────

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
def tv_client(root_api_module, monkeypatch):
    """Client Flask com Supabase/JWT falsos e rate limit limpo por teste."""
    fake = FakeRequests()
    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fake)
    monkeypatch.setattr(root_api_module, "redis", None)
    monkeypatch.setattr(root_api_module, "_get_client_ip", lambda: "tv-test-ip")

    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")

    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("CRON_SECRET", CRON_SECRET)
    root_api_module._rate_limit_store.clear()
    fake.client = root_api_module.app.test_client()
    return fake


def _setup_auth_routes(fake: FakeRequests, user_id=DEVICE_USER_A):
    fake.route("GET", "rest/v1/profiles", FakeResponse([{
        "id": user_id,
        "email": f"{user_id}@devices.labhub.local",
        "name": "Kiosk",
        "role": "tv_device",
        "is_super_admin": False,
        "status": "active",
    }]))
    fake.route("GET", "rest/v1/memberships", FakeResponse([]))


def _setup_device(fake: FakeRequests, workspace_id=WS_A_ID, user_id=DEVICE_USER_A):
    fake.route("GET", "rest/v1/tv_devices?user_id=", FakeResponse([
        {"id": DEVICE_A_ID, "workspace_id": workspace_id},
    ]))


def _setup_rpc(fake: FakeRequests, response: FakeResponse):
    fake.route("POST", "rest/v1/rpc/station_auto_advance", response)


def _last_rpc(fake: FakeRequests) -> dict:
    for call in reversed(fake.calls):
        if call["method"] == "POST" and "rpc/station_auto_advance" in call["url"]:
            return call["kwargs"].get("json") or {}
    assert False, "nenhuma chamada RPC station_auto_advance encontrada"


# ── Auto-advance (signal) ─────────────────────────────────────────────────────

def test_signal_exige_autenticacao(tv_client):
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={})
    assert res.status_code == 401


def test_signal_sem_dispositivo_valido_fail_closed(tv_client):
    _setup_auth_routes(tv_client)
    # Nenhum tv_devices com user_id => workspace não resolvido => 403.
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    assert res.status_code == 403


def test_signal_ignora_workspace_e_payload_extra_do_cliente(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({"status": "no_op", "reason": "NOT_ELAPSED"}))
    # workspace_id/idempotency_key/request_hash/expected_sequence/next_track
    # vêm do cliente sinalizado — DEVEM ser ignorados (autoridade é o servidor).
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={
        "workspace_id": WS_B_ID,
        "idempotency_key": "hack",
        "request_hash": "hack",
        "expected_sequence": 999,
        "next_track": "hack",
        "current_snapshot_track_id": TRACK_ID,
    }, headers=headers_for())
    assert res.status_code == 200
    assert res.json["status"] == "no_op"
    params = _last_rpc(tv_client)
    assert params["p_workspace"] == WS_A_ID
    assert params["p_current_snapshot_track_id"] == TRACK_ID
    for banned in ("p_idempotency_key", "p_request_hash", "p_expected_sequence", "p_next_track", "p_position"):
        assert banned not in params


def test_signal_applied_retorna_estado(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({
        "status": "applied",
        "result": {
            "result": "ok", "state": "playing", "position_seconds": 0,
            "started_at": "2026-09-14T10:00:00Z", "state_sequence": 7,
            "queue_snapshot_id": WS_A_ID, "current_snapshot_track_id": TRACK_ID,
        },
    }))
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={
        "current_snapshot_track_id": TRACK_ID,
    }, headers=headers_for())
    assert res.status_code == 200
    assert res.json["status"] == "applied"
    assert res.json["result"]["state_sequence"] == 7
    assert res.json["result"]["current_snapshot_track_id"] == TRACK_ID


def test_signal_replayed(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({
        "status": "replayed",
        "result": {
            "result": "ok", "state": "playing", "position_seconds": 0,
            "started_at": "2026-09-14T10:00:00Z", "state_sequence": 7,
            "queue_snapshot_id": WS_A_ID, "current_snapshot_track_id": TRACK_ID,
        },
    }))
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={
        "current_snapshot_track_id": TRACK_ID,
    }, headers=headers_for())
    assert res.status_code == 200
    assert res.json["status"] == "replayed"


def test_signal_conflito_40900_mapeado_para_conflict(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({"code": "40900", "message": "SEQUENCE_CONFLICT"}, status_code=400))
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    assert res.status_code == 200
    assert res.json["status"] == "conflict"


def test_signal_erro_rpc_retorna_502(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({"code": "P0001", "message": "boom"}, status_code=400))
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    assert res.status_code == 502
    assert "error" in res.json


def test_signal_current_track_invalido_400(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={
        "current_snapshot_track_id": "not-a-uuid",
    }, headers=headers_for())
    assert res.status_code == 400


def test_signal_device_id_de_outro_workspace_403(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    # device de OUTRO usuário/workspace: a consulta de validação retorna vazio.
    other = "99999999-9999-9999-9999-999999999999"
    tv_client.route("GET", f"id=eq.{other}", FakeResponse([]))
    res = tv_client.client.post(ENDPOINT_SIGNAL, json={"device_id": other}, headers=headers_for())
    assert res.status_code == 403


def test_signal_rate_limit_por_workspace(tv_client, root_api_module, monkeypatch):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client)
    _setup_rpc(tv_client, FakeResponse({"status": "no_op", "reason": "NOT_ELAPSED"}))
    monkeypatch.setattr(root_api_module, "AUTO_ADVANCE_RATE_LIMIT_PER_HOUR", 2)
    r1 = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    r2 = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    r3 = tv_client.client.post(ENDPOINT_SIGNAL, json={}, headers=headers_for())
    assert r1.status_code == 200 and r2.status_code == 200
    assert r3.status_code == 429


# ── Backstop (cron) ───────────────────────────────────────────────────────────

def _cron_headers():
    return {"Authorization": f"Bearer {CRON_SECRET}"}


def test_backstop_fail_closed_sem_cron_secret(tv_client, monkeypatch):
    monkeypatch.delenv("CRON_SECRET")
    res = tv_client.client.post(ENDPOINT_BACKSTOP, json={}, headers=_cron_headers())
    assert res.status_code == 503


def test_backstop_token_errado_401(tv_client):
    res = tv_client.client.post(ENDPOINT_BACKSTOP, json={},
                                headers={"Authorization": "Bearer wrong"})
    assert res.status_code == 401


def test_backstop_varre_playing_e_agrega_tallies(tv_client):
    _setup_auth_routes(tv_client)
    tv_client.route("GET", "rest/v1/tv_station?state=eq.playing", FakeResponse([
        {"workspace_id": WS_A_ID},
        {"workspace_id": WS_B_ID},
    ]))

    def pred_applied(url, kwargs):
        params = kwargs.get("json") or {}
        return params.get("p_workspace") == WS_A_ID

    tv_client.route("POST", "rest/v1/rpc/station_auto_advance", FakeResponse({"status": "no_op", "reason": "NOT_ELAPSED"}))
    tv_client.route_pred("POST", pred_applied, FakeResponse({
        "status": "applied", "result": {"state_sequence": 3},
    }))

    res = tv_client.client.post(ENDPOINT_BACKSTOP, json={}, headers=_cron_headers())
    assert res.status_code == 200
    body = res.json
    assert body["checked"] == 2
    assert body["applied"] == 1
    assert body["no_op"] == 1
    assert body["replayed"] == 0
    assert body["conflict"] == 0
    assert body["errors"] == 0


def test_backstop_conflito_e_erro_contabilizados(tv_client):
    _setup_auth_routes(tv_client)
    tv_client.route("GET", "rest/v1/tv_station?state=eq.playing", FakeResponse([
        {"workspace_id": WS_A_ID},
        {"workspace_id": WS_B_ID},
    ]))

    def pred_conflict(url, kwargs):
        params = kwargs.get("json") or {}
        return params.get("p_workspace") == WS_B_ID

    tv_client.route("POST", "rest/v1/rpc/station_auto_advance", FakeResponse({"status": "no_op", "reason": "NOT_ELAPSED"}))
    tv_client.route_pred("POST", pred_conflict, FakeResponse({"code": "40900", "message": "SEQUENCE_CONFLICT"}, status_code=400))

    res = tv_client.client.post(ENDPOINT_BACKSTOP, json={}, headers=_cron_headers())
    assert res.status_code == 200
    body = res.json
    assert body["checked"] == 2
    assert body["applied"] == 0
    assert body["no_op"] == 1
    assert body["conflict"] == 1
    assert body["errors"] == 0


def test_backstop_station_list_falha_502(tv_client):
    _setup_auth_routes(tv_client)
    tv_client.route("GET", "rest/v1/tv_station?state=eq.playing", FakeResponse({"code": "P0001"}, status_code=500))
    res = tv_client.client.post(ENDPOINT_BACKSTOP, json={}, headers=_cron_headers())
    assert res.status_code == 502