"""Isolamento entre unidades (workspaces) nos endpoints de TV/QR da PR #412.

Cenários com duas unidades distintas (A e B):

  1. report-failure: dispositivo vinculado à unidade A gera RPC com
     `p_workspace` = A — payload do cliente (workspace_id de B) é ignorado;
     a estação da unidade B nunca é alterada.
  2. request-qr: QR emitido ao dispositivo de A carrega token verificável
     APENAS como unidade A.
  3. Pedido público: workspace vem SEMPRE do token assinado — body tentando
     injetar workspace_id de B grava na unidade A, com status pending/source qr.
  4. Token adulterado (assinatura de A reaproveitada em payload de B) é
     rejeitado (403) sem nenhuma gravação.
  5. Contexto público reflete somente a unidade do token.

Infraestrutura de fakes baseada em test_tv_station_auto_advance_endpoint.py.
"""
import base64
import hashlib
import hmac
import json
import os
import time

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

from _api_loader import load_api

appmod = load_api()

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

WS_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
WS_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
DEVICE_USER_A = "dev-user-a"
DEVICE_A_ID = "11111111-1111-1111-1111-111111111111"
TRACK_ID = "22222222-2222-2222-2222-222222222222"

YOUTUBE_INFO = {"video_id": "abc12345678", "title": "Faixa teste", "duration_seconds": 180}


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (200 <= status_code < 300) if ok is None else ok
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepta requests; rotas por substring da URL (última vence)."""

    def __init__(self):
        self.calls = []
        self._routes = []
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.append((method, url_part, response))

    def _match(self, method, url):
        for m, part, response in reversed(self._routes):
            if m == method and part in url:
                return response
        return self._default

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        return self._match(method, url)

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)


# ── JWT (mesmo padrão de test_tv_station_auto_advance_endpoint.py) ────────────

def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def headers_for(user_id=DEVICE_USER_A):
    return {"Authorization": f"Bearer {_make_jwt({'sub': user_id, 'iss': f'{SUPABASE_URL}/auth/v1', 'aud': 'authenticated'})}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def tv_client(monkeypatch):
    fake = FakeRequests()
    monkeypatch.setattr(appmod, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(appmod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(appmod, "requests", fake)
    monkeypatch.setattr(appmod, "redis", None)
    monkeypatch.setattr(appmod, "_get_client_ip", lambda: "isolation-test-ip")
    monkeypatch.setattr(appmod, "_youtube_video_info", lambda video_id: dict(YOUTUBE_INFO))
    # Turnstile NÃO configurado no ambiente de teste: verificação opcional.
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)

    auth_mod = __import__("auth")
    monkeypatch.setattr(auth_mod, "requests", fake)
    monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")

    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    appmod._rate_limit_store.clear()
    fake.client = appmod.app.test_client()
    return fake


def _setup_auth_routes(fake, user_id=DEVICE_USER_A):
    fake.route("GET", "rest/v1/profiles", FakeResponse([{
        "id": user_id,
        "email": f"{user_id}@devices.labhub.local",
        "name": "Kiosk",
        "role": "tv_device",
        "is_super_admin": False,
        "status": "active",
    }]))
    fake.route("GET", "rest/v1/memberships", FakeResponse([]))


def _setup_device(fake, workspace_id=WS_A_ID, user_id=DEVICE_USER_A):
    fake.route("GET", "rest/v1/tv_devices?user_id=", FakeResponse([
        {"id": DEVICE_A_ID, "workspace_id": workspace_id},
    ]))


def _qr_token_from_url(url: str) -> str:
    return url.rsplit("/pedir-musica/", 1)[1]


# ── 1. report-failure: dispositivo de A nunca altera a unidade B ──────────────

def test_report_failure_usa_workspace_do_dispositivo(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client, workspace_id=WS_A_ID)
    tv_client.route("POST", "rest/v1/rpc/station_report_track_failure",
                    FakeResponse({"status": "reported", "failures": 1}))

    res = tv_client.client.post(
        "/api/tv/station/report-failure",
        json={"current_snapshot_track_id": TRACK_ID, "workspace_id": WS_B_ID},
        headers=headers_for(),
    )

    assert res.status_code == 200
    assert res.json["status"] == "reported"
    rpcs = [c for c in tv_client.calls
            if c["method"] == "POST" and "rpc/station_report_track_failure" in c["url"]]
    assert len(rpcs) == 1
    params = rpcs[0]["kwargs"]["json"]
    assert params["p_workspace"] == WS_A_ID
    assert params["p_workspace"] != WS_B_ID
    assert params["p_snapshot_track_id"] == TRACK_ID


def test_report_failure_exige_dispositivo_valido(tv_client):
    """Sem vínculo tv_devices (unidade indefinida) => fail-closed 403."""
    _setup_auth_routes(tv_client)
    res = tv_client.client.post(
        "/api/tv/station/report-failure",
        json={"current_snapshot_track_id": TRACK_ID},
        headers=headers_for(),
    )
    assert res.status_code == 403
    assert not [c for c in tv_client.calls if "rpc/station_report_track_failure" in c["url"]]


# ── 2. request-qr: token emitido pertence somente à unidade do dispositivo ────

def test_request_qr_vincula_token_a_unidade_do_dispositivo(tv_client):
    _setup_auth_routes(tv_client)
    _setup_device(tv_client, workspace_id=WS_A_ID)

    res = tv_client.client.get("/api/tv/request-qr", headers=headers_for())

    assert res.status_code == 200
    token = _qr_token_from_url(res.json["url"])
    verified = appmod._verify_request_token(token, expected_workspace=WS_A_ID)
    assert verified is not None
    # O mesmo token NÃO vale para a unidade B.
    assert appmod._verify_request_token(token, expected_workspace=WS_B_ID) is None


# ── 3. pedido público: workspace vem do token, nunca do body ──────────────────

def _token_for(workspace_id):
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS)
    token, _ = appmod._sign_request_token(workspace_id, bucket)
    return token


def _post_public_request(tv_client, token, workspace_id, extra_body=None):
    body = {
        "token": token,
        "youtube_url": "https://youtu.be/abc12345678",
        "nickname": "Aluno",
        # form_issued_at assinado há 5s (tempo mínimo de página já decorrido)
        "form_issued_at_signed": appmod._sign_form_issued(workspace_id, int(time.time()) - 5),
    }
    body.update(extra_body or {})
    return tv_client.client.post("/api/tv/public/request", json=body)


def test_pedido_publico_grava_na_unidade_do_token(tv_client):
    tv_client.route("GET", "rest/v1/tv_music_requests", FakeResponse([]))
    tv_client.route("POST", "rest/v1/tv_music_requests", FakeResponse([], status_code=201))

    res = _post_public_request(tv_client, _token_for(WS_A_ID), WS_A_ID, {"workspace_id": WS_B_ID})

    assert res.status_code == 200
    inserts = [c for c in tv_client.calls
               if c["method"] == "POST" and "rest/v1/tv_music_requests" in c["url"]]
    assert len(inserts) == 1
    sent = inserts[0]["kwargs"]["json"]
    assert sent["workspace_id"] == WS_A_ID
    assert sent["workspace_id"] != WS_B_ID
    assert sent["status"] == "pending"
    assert sent["source"] == "qr"
    assert sent["requested_by"] is None


# ── 4. token adulterado entre unidades é rejeitado sem gravação ───────────────

def test_assinatura_de_A_nao_valida_payload_de_B(tv_client):
    payload_b = json.dumps(
        {"workspace_id": WS_B_ID, "bucket": int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS)},
        separators=(",", ":"),
    ).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_b).rstrip(b"=")
    sig_a = _token_for(WS_A_ID).split(".", 1)[1]  # assinatura válida para payload de A
    forged = (payload_b64 + b"." + sig_a.encode()).decode()

    assert appmod._verify_request_token(forged) is None

    tv_client.route("GET", "rest/v1/tv_music_requests", FakeResponse([]))
    res = _post_public_request(tv_client, forged, WS_A_ID)
    assert res.status_code == 403
    assert not [c for c in tv_client.calls
                if c["method"] == "POST" and "rest/v1/tv_music_requests" in c["url"]]


# ── 5. contexto público reflete somente a unidade do token ────────────────────

def test_contexto_publico_mostra_apenas_unidade_do_token(tv_client):
    tv_client.route("GET", f"rest/v1/workspaces?id=eq.{WS_A_ID}",
                    FakeResponse([{"name": "Unidade A"}]))
    tv_client.route("GET", f"rest/v1/workspaces?id=eq.{WS_B_ID}",
                    FakeResponse([{"name": "Unidade B"}]))

    res = tv_client.client.get("/api/tv/public/request/context?token=" + _token_for(WS_A_ID))

    assert res.status_code == 200
    assert res.json["workspace_name"] == "Unidade A"
    assert res.json["workspace_name"] != "Unidade B"
