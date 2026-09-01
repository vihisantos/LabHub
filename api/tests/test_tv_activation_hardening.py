"""Etapa 9.7 — TV Activation Code Hardening.

Cobre o fluxo /api/tv/activation/redeem em relação a:
- brute-force / lockout por código (além do rate limit por IP);
- lockout expira após a janela;
- respostas uniformes (anti-oracle de existência de código);
- consumo atômico (duas requisições concorrentes => um único device);
- isolamento por workspace;
- código nunca vazado em plaintext (logs/audit/payload de auditoria);
- redeem bem-sucedido gera exatamente um provisioning.
"""
import base64
import hashlib
import hmac
import importlib.util
import json
import sys
import time
from datetime import datetime, timezone
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
                if callable(response):
                    return response(url, **kwargs)
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


@pytest.fixture(scope="module")
def api_module():
    for existing in ("chamados_api", "root_api", "reservalab_api", "tv_revoke_api"):
        if existing in sys.modules and getattr(sys.modules[existing], "app", None) is not None:
            return sys.modules[existing]
    spec = importlib.util.spec_from_file_location("tv_hardening_api", API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["tv_hardening_api"] = mod
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
    monkeypatch.setattr(api_module, "redis", None)
    api_module._rate_limit_store.clear()
    api_module._ACTIVATION_FAILURES.clear()
    api_module._ACTIVATION_LOCKS.clear()
    return api_module.app.test_client()


# ── Rotas fake padrão ──

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


def _route_happy_path(fake_requests, row=None, patch_payload=None):
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([row or ACTIVATION_ROW]))
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
    if patch_payload is None:
        patch_payload = [dict(ACTIVATION_ROW, status="used")]
    fake_requests.route("PATCH", "tv_activation_codes?id=eq.", FakeResponse(patch_payload))


def _redeem(client, code="ABC234", device_id=DEVICE_ID, device_name="TV Lab 2"):
    return client.post("/api/tv/activation/redeem", json={
        "code": code,
        "device_id": device_id,
        "device_name": device_name,
    })


def _now_ts(api_module):
    return datetime.now(timezone.utc).timestamp()


# ── 1. Redeem válido continua funcionando ──

def test_redeem_valid_still_works(client, fake_requests):
    _route_happy_path(fake_requests)
    res = _redeem(client)
    assert res.status_code == 200
    assert res.get_json()["success"] is True
    assert len(fake_requests.calls_for("POST", "/rest/v1/tv_devices")) == 1
    assert len(fake_requests.calls_for("PATCH", "tv_activation_codes")) == 1


# ── 2. Código expirado é rejeitado ──

def test_redeem_expired_rejected(client, fake_requests):
    expired = dict(ACTIVATION_ROW, expires_at="2020-01-01T00:00:00+00:00")
    _route_happy_path(fake_requests, row=expired, patch_payload=[])
    res = _redeem(client)
    assert res.status_code == 400
    assert not fake_requests.calls_for("POST", "/rest/v1/tv_devices")
    assert not fake_requests.calls_for("PATCH", "tv_activation_codes")


# ── 3. Código usado é rejeitado ──

def test_redeem_used_rejected(client, fake_requests):
    used = dict(ACTIVATION_ROW, status="used")
    _route_happy_path(fake_requests, row=used, patch_payload=[])
    res = _redeem(client)
    assert res.status_code == 400
    assert not fake_requests.calls_for("POST", "/rest/v1/tv_devices")


# ── 4. Código inválido é rejeitado ──

def test_redeem_invalid_rejected(client, fake_requests):
    _route_happy_path(fake_requests, row=None, patch_payload=[])  # GET devolve []
    fake_requests._routes["GET"] = [("tv_activation_codes?code=eq.", FakeResponse([]))]
    res = _redeem(client, code="ZZZZZZ")
    assert res.status_code == 400
    assert not fake_requests.calls_for("POST", "/rest/v1/tv_devices")


# ── 5. Rate limit por IP continua funcionando ──

def test_redeem_ip_rate_limit(client, api_module):
    _now = _now_ts(api_module)
    api_module._rate_limit_store["tv-redeem:test-ip"] = [_now] * api_module.RATE_LIMIT_MAX_REQUESTS
    res = _redeem(client)
    assert res.status_code == 429


# ── 6. Tentativas repetidas contra o mesmo código são limitadas (lockout) ──

def test_activation_repeated_attempts_lockout(client, api_module, fake_requests):
    # Código legítimo MAS com falhas repetidas (ex.: digitação errada) acabam
    # bloqueando até o lockout — mesmo que depois o código correto seja usado.
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([]))  # sempre "inválido"
    api_module.redis = None
    for _ in range(api_module.ACTIVATION_LOCK_MAX_ATTEMPTS):
        res = _redeem(client, code="ABC234")
        assert res.status_code == 400

    # Próxima tentativa entra em lockout (429), mesmo sendo um "código" diferente
    # na mesma chave? Não — lockout é por hash do código. Repetimos o MESMO código.
    res = _redeem(client, code="ABC234")
    assert res.status_code == 429


# ── 7. Lockout expira corretamente ──

def test_activation_lockout_expires(client, api_module, fake_requests):
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([]))
    digest = api_module._activation_digest("ABC234")
    for _ in range(api_module.ACTIVATION_LOCK_MAX_ATTEMPTS):
        _redeem(client, code="ABC234")

    # Força expiração simulando janela antiga no fallback em memória.
    api_module._ACTIVATION_FAILURES[digest] = [
        api_module._ACTIVATION_FAILURES[digest][0]
        - api_module.ACTIVATION_LOCK_WINDOW
        - 1
    ]
    api_module._rate_limit_store.clear()
    res = _redeem(client, code="ABC234")
    assert res.status_code != 429
    # Como o GET ainda devolve [], o redeem falha como inválido (400) — não
    # bloqueado por lockout, provando que o lockout expirou.
    assert res.status_code == 400


# ── 8. Respostas não permitem enumeração indevida ──

def test_activation_no_enumeration_oracle(client, api_module, fake_requests):
    scenarios = [
        (FakeResponse([]), "nonexistent"),
        (FakeResponse([dict(ACTIVATION_ROW, status="used")]), "used"),
        (FakeResponse([dict(ACTIVATION_ROW, expires_at="2020-01-01T00:00:00+00:00")]), "expired"),
    ]
    messages = set()
    codes = set()
    for get_resp, label in scenarios:
        fake_requests._routes.clear()
        fake_requests.route("GET", "tv_activation_codes?code=eq.", get_resp)
        fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([WORKSPACE]))
        api_module._rate_limit_store.clear()
        api_module._ACTIVATION_FAILURES.clear()
        api_module._ACTIVATION_LOCKS.clear()
        res = _redeem(client, code="ABC234")
        assert res.status_code == 400
        messages.add(res.get_json()["error"])
        codes.add(res.status_code)
    # Todas as falhas devolvem a MESMA mensagem E o MESMO status → não há oracle.
    assert len(messages) == 1
    assert len(codes) == 1
    assert "Código de ativação inválido ou expirado." in messages


# ── 9. Consumo atômico / concorrência — mesmo código não gera dois devices ──

def test_activation_lock_refused_while_concurrent_holder(client, api_module, fake_requests):
    # Simula uma requisição em andamento para o mesmo código: o lock por código
    # está "segurado" (concorrente detém o processamento). Uma nova requisição
    # com o MESMO código é recusada ANTES de qualquer provisionamento.
    _route_happy_path(fake_requests)
    digest = api_module._activation_digest("ABC234")
    api_module._ACTIVATION_LOCKS[digest] = datetime.now(timezone.utc).timestamp() + 600
    res = _redeem(client, code="ABC234")
    assert res.status_code == 429
    # Nenhum provisioning nem consumo ocorreu.
    assert not fake_requests.calls_for("POST", "/rest/v1/tv_devices")
    assert not fake_requests.calls_for("POST", "/auth/v1/admin/users")
    assert not fake_requests.calls_for("PATCH", "tv_activation_codes")
    api_module._ACTIVATION_LOCKS.clear()


def test_activation_guarded_consume_single_winner(client, fake_requests):
    # Cenário mais profundo do modelo de ameaça: duas requisições conseguem
    # passar pelo lock (janela mínima / coerência Redis incompleta). A garantia
    # final é o consumo ATÔMICO verificável: PATCH ...&status=eq.pending com
    # return=representation. O fake modela o Postgres de forma stateful: o
    # primeiro PATCH casa e devolve a linha "used"; os seguintes devolvem [].
    state = {"consumed": False}

    def patch_handler(url, **kwargs):
        if "tv_activation_codes?id=" in url and state["consumed"]:
            return FakeResponse([])  # já usado -> sem linhas
        if "tv_activation_codes?id=" in url:
            state["consumed"] = True
            return FakeResponse([dict(ACTIVATION_ROW, status="used")])
        return FakeResponse([])

    def get_handler(url, **kwargs):
        if state["consumed"]:
            return FakeResponse([dict(ACTIVATION_ROW, status="used")])
        return FakeResponse([ACTIVATION_ROW])

    fake_requests.route("GET", "tv_activation_codes?code=eq.", get_handler)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([WORKSPACE]))
    fake_requests.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fake_requests.route(
        "POST", "/auth/v1/admin/generate_link",
        FakeResponse({
            "properties": {"action_link": f"{SUPABASE_URL}/auth/v1/verify?token={TOKEN_HASH}"},
            "user": {"id": "dev-user-1"},
        }),
    )
    fake_requests.route("POST", "/rest/v1/tv_devices", FakeResponse([]))
    fake_requests.route("PATCH", "tv_activation_codes?id=eq.", patch_handler)

    # Primeira requisição: vence e devolve sucesso.
    r1 = _redeem(client, code="ABC234")
    assert r1.status_code == 200

    # Segunda requisição (mesmo código, já consumido): não vence; sem sucesso.
    r2 = _redeem(client, code="ABC234")
    assert r2.status_code == 400
    assert r2.get_json().get("success") is not True

    # Apenas UMA requisição retornou sucesso.
    assert r1.status_code == 200
    assert r2.status_code != 200
    # Exatamente um consumidor do código (PATCH que casou) e um device.
    assert state["consumed"] is True


def test_activation_real_threads_never_double_success(client, api_module, fake_requests):
    # Smoke test com threads reais: sob o lock (agora thread-safe no fallback),
    # requisições concorrentes para o MESMO código nunca produzem 2 sucessos.
    from threading import Barrier, Thread

    state = {"consumed": False}

    def patch_handler(url, **kwargs):
        if "tv_activation_codes?id=" in url and state["consumed"]:
            return FakeResponse([])
        if "tv_activation_codes?id=" in url:
            state["consumed"] = True
            return FakeResponse([dict(ACTIVATION_ROW, status="used")])
        return FakeResponse([])

    def get_handler(url, **kwargs):
        return FakeResponse([] if state["consumed"] else [ACTIVATION_ROW])

    fake_requests.route("GET", "tv_activation_codes?code=eq.", get_handler)
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([WORKSPACE]))
    fake_requests.route("POST", "/auth/v1/admin/users", FakeResponse({"id": "dev-user-1"}))
    fake_requests.route(
        "POST", "/auth/v1/admin/generate_link",
        FakeResponse({
            "properties": {"action_link": f"{SUPABASE_URL}/auth/v1/verify?token={TOKEN_HASH}"},
            "user": {"id": "dev-user-1"},
        }),
    )
    fake_requests.route("POST", "/rest/v1/tv_devices", FakeResponse([]))
    fake_requests.route("PATCH", "tv_activation_codes?id=eq.", patch_handler)

    n = 6
    barrier = Barrier(n)
    results = []

    def worker():
        barrier.wait()
        results.append(_redeem(client, code="ABC234").status_code)

    threads = [Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # No máximo UM sucesso; nenhum lock residuaria (ou seria liberado no finally).
    assert results.count(200) <= 1
    assert api_module._ACTIVATION_LOCKS == {}


# ── 10. Cross-workspace continua bloqueado (código de A não provisiona em B) ──

def test_activation_cross_workspace_blocked(client, api_module, fake_requests):
    # O workspace vem SEMPRE do registro server-side. Mesmo que o device envie
    # um workspace no body, o backend usa o do código. Tentamos um código que
    # pertence ao ws-a; o device "tenta" forçar ws-b no body — segue ws-a.
    row_ws_a = dict(ACTIVATION_ROW, workspace_id="ws-a")
    _route_happy_path(fake_requests, row=row_ws_a)
    res = client.post("/api/tv/activation/redeem", json={
        "code": "ABC234",
        "device_id": DEVICE_ID,
        "device_name": "TV X",
        "workspace_id": "ws-b",  # tentativa de injeção — ignorada
    })
    assert res.status_code == 200
    ups = fake_requests.calls_for("POST", "/rest/v1/tv_devices")
    assert len(ups) == 1
    assert ups[0]["kwargs"]["json"]["workspace_id"] == "ws-a"

    # Código de outro workspace não é localizável para um device que tenta ws-b.
    fake_requests._routes.clear()
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([]))
    api_module._rate_limit_store.clear()
    api_module._ACTIVATION_FAILURES.clear()
    api_module._ACTIVATION_LOCKS.clear()
    res2 = client.post("/api/tv/activation/redeem", json={
        "code": "WSBCOD", "device_id": DEVICE_ID, "workspace_id": "ws-b",
    })
    assert res2.status_code == 400


# ── 11. Código NÃO aparece em plaintext em logs/audit ──

def test_activation_code_not_leaked_in_audit(client, api_module, fake_requests):
    captured = {}
    fake_audit = []
    fake_requests.route("GET", "tv_activation_codes?code=eq.", FakeResponse([]))

    def fake_record(**kwargs):
        fake_audit.append(kwargs)

    monkeypatch_holder = []
    import unittest.mock
    patcher = unittest.mock.patch.object(api_module, "rbac_record_audit", fake_record)
    patcher.start()
    try:
        res = _redeem(client, code="ABC234")
        assert res.status_code == 400
    finally:
        patcher.stop()

    assert fake_audit, "auditoria deve registrar a tentativa inválida"
    serialized = json.dumps(fake_audit)
    assert "ABC234" not in serialized
    assert "code_row" not in serialized  # id do registro não é vazado
    # Porém o hash de correlação deve estar presente (permite investigação).
    digest = api_module._activation_digest("ABC234")
    assert digest in serialized


# ── 12. Redeem bem-sucedido gera exatamente um provisioning válido ──

def test_activation_success_single_provision(client, fake_requests):
    _route_happy_path(fake_requests)
    res = _redeem(client)
    assert res.status_code == 200
    data = res.get_json()
    assert data["token_hash"] == TOKEN_HASH
    # Exatamente um usuário GoTrue criado, um link gerado, um device vinculado,
    # e o código consumido exatamente uma vez.
    assert len(fake_requests.calls_for("POST", "/auth/v1/admin/users")) == 1
    assert len(fake_requests.calls_for("POST", "/auth/v1/admin/generate_link")) == 1
    assert len(fake_requests.calls_for("POST", "/rest/v1/tv_devices")) == 1
    assert len(fake_requests.calls_for("PATCH", "tv_activation_codes")) == 1
