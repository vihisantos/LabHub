"""Tests for POST /api/tv/source/fetch (PR 4 — TV source Excel/SharePoint).

Cobertura: auth/workspace/module, SSRF em profundidade, parser XLSX,
cache por workspace com invalidação e isolamento crítico A↔B.
"""

import importlib.util
import json
import hashlib
import hmac
import base64
import io
import socket
import sys
import time
from pathlib import Path

import pytest
import requests as requests_lib
from openpyxl import Workbook

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"
PUBLIC_IP = "93.184.216.34"


# ── Fakes ─────────────────────────────────────────────────────────────────────

class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (status_code == 200) if ok is None else ok
        if isinstance(payload, (bytes, bytearray)):
            self.text = ""
        else:
            self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        if isinstance(self._payload, (bytes, bytearray)):
            raise ValueError("not json")
        return self._payload


class FakeDownload:
    """Resposta de download externo com streaming controlável."""

    def __init__(self, content=b"", status_code=200, chunks=None):
        self.status_code = status_code
        self.ok = status_code == 200
        self.headers = {}
        self._chunks = chunks if chunks is not None else [content]

    def iter_content(self, chunk_size=64 * 1024):
        for chunk in self._chunks:
            yield chunk

    def close(self):
        pass


class FakeRequests:
    """Intercepta requests; rotas por substring de URL ou predicado.

    A última rota registrada vence (permite sobrepor comportamento no meio
    do teste, ex.: fonte passa a falhar).
    """

    exceptions = requests_lib.exceptions

    def __init__(self):
        self.calls = []
        self._routes = []
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.append((method, url_part, response, None))

    def route_pred(self, method, predicate, response):
        self._routes.append((method, "", response, predicate))

    def reset_external(self):
        self._routes = [
            r for r in self._routes
            if r[1] and ("rest/v1" in r[1] or "planilha" in r[1])
        ]

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

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._do("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    def external_calls(self):
        return [
            c for c in self.calls
            if SUPABASE_URL not in c["url"]
        ]


# ── JWT ───────────────────────────────────────────────────────────────────────

def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _token_for(user_id="u1"):
    return _make_jwt({
        "sub": user_id,
        "iss": f"{SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
    })


AUTH_HEADERS = lambda tok=None: {"Authorization": f"Bearer {tok or _token_for()}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def root_api_module():
    """Carrega a API raiz UMA vez por sessão (mesma chave dos demais testes:
    re-executar registraria rotas no mesmo app Flask após a 1ª request)."""
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def safe_dns(root_api_module, monkeypatch):
    """Resolve qualquer hostname para um IP público (testes sem rede real)."""
    def fake_getaddrinfo(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, 0))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


@pytest.fixture()
def tv_env(root_api_module, safe_dns, monkeypatch, tmp_path):
    """Client do Flask com Supabase/cache/DNS falsos e limpo por teste."""
    fake = FakeRequests()

    class AuthMod:
        pass

    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fake)
    monkeypatch.setattr(root_api_module, "redis", None)

    def fake_cache_path(cache_key):
        digest = hashlib.sha256(str(cache_key).encode("utf-8")).hexdigest()[:24]
        return str(tmp_path / f".cache_{digest}.json")

    monkeypatch.setattr(root_api_module, "_cache_path", fake_cache_path)

    auth_name = "auth"
    auth_mod = sys.modules.get(auth_name)
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")

    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    root_api_module._rate_limit_store.clear()
    return fake


@pytest.fixture()
def tv_client(tv_env, root_api_module):
    return root_api_module.app.test_client()


WS_A_ID = "11111111-1111-1111-1111-111111111111"
WS_B_ID = "22222222-2222-2222-2222-222222222222"
URL_A = "https://files.example.com/planilha-a.xlsx"
URL_B = "https://files.example.com/planilha-b.xlsx"

SETTINGS_A = {
    "eventSource": {"enabled": True, "type": "sharepoint_excel", "url": URL_A},
    "display": {"refreshIntervalSeconds": 300},
}
SETTINGS_B = {
    "eventSource": {"enabled": True, "type": "sharepoint_excel", "url": URL_B},
    "display": {"refreshIntervalSeconds": 1200},
}


def _xlsx(rows, sheet_title="Eventos"):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


XLSX_A = _xlsx([
    ["Título", "Data", "Local"],
    ["Feira de ciências", "2026-09-01", "Ginásio"],
    ["Show de talentos", "01/10/2026", "Auditório"],
])

XLSX_B = _xlsx([
    ["Título", "Data"],
    ["Evento exclusivo do workspace B", "2026-09-05"],
])


def install_happy_world(fake):
    """Usuário membro de A; settings distintos por workspace; XLSX distintos."""
    fake.route("GET", "/rest/v1/profiles", FakeResponse([{
        "id": "u1", "status": "active", "is_super_admin": False,
        "workspace_ids": [WS_A_ID],
    }]))
    fake.route_pred(
        "GET",
        lambda url, kw: "/rest/v1/workspaces" in url,
        FakeResponse([{"id": WS_A_ID, "name": "WS A", "slug": "a", "disabled_apps": []}]),
    )
    fake.route(
        "GET",
        f"workspace_id=eq.{WS_A_ID}&app_id=eq.tv",
        FakeResponse([{"settings": SETTINGS_A}]),
    )
    fake.route(
        "GET",
        f"workspace_id=eq.{WS_B_ID}&app_id=eq.tv",
        FakeResponse([{"settings": SETTINGS_B}]),
    )
    fake.route("GET", "planilha-a.xlsx", FakeDownload(XLSX_A))
    fake.route("GET", "planilha-b.xlsx", FakeDownload(XLSX_B))


# ── Auth / autorização ────────────────────────────────────────────────────────

class TestAuth:
    def test_sem_token_retorna_401(self, tv_client, tv_env):
        install_happy_world(tv_env)
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID})
        assert resp.status_code == 401

    def test_usuario_de_outro_workspace_retorna_403(self, tv_client, tv_env):
        tv_env.route("GET", "/rest/v1/profiles", FakeResponse([{
            "id": "u1", "status": "active", "is_super_admin": False,
            "workspace_ids": ["99999999-9999-9999-9999-999999999999"],
        }]))
        tv_env.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/workspaces" in url,
            FakeResponse([]),
        )
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 403

    def test_app_tv_desabilitado_retorna_403(self, tv_client, tv_env):
        tv_env.route("GET", "/rest/v1/profiles", FakeResponse([{
            "id": "u1", "status": "active", "is_super_admin": False,
            "workspace_ids": [WS_A_ID],
        }]))
        tv_env.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/workspaces" in url,
            FakeResponse([{
                "id": WS_A_ID, "name": "WS A", "slug": "a",
                "disabled_apps": ["tv"],
            }]),
        )
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 403
        assert resp.get_json()["error"].startswith('Module "tv"')

    def test_workspace_correto_com_tv_habilitada_permite(self, tv_client, tv_env):
        install_happy_world(tv_env)
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True
        assert body["freshness"] == "fresh"
        assert body["validCount"] == 2


# ── Isolamento crítico A ↔ B ─────────────────────────────────────────────────

class TestWorkspaceIsolation:
    def test_requestar_outro_workspace_retorna_403(self, tv_client, tv_env):
        install_happy_world(tv_env)
        resp = tv_client.post("/api/tv/source/fetch", json={
            "workspace_id": WS_B_ID,
        }, headers=AUTH_HEADERS())
        assert resp.status_code == 403
        assert tv_env.external_calls() == [], "nenhum download deve ocorrer em 403"

    def test_parametros_tamperados_nao_mudam_a_fonte(self, tv_client, tv_env):
        install_happy_world(tv_env)
        resp = tv_client.post("/api/tv/source/fetch", json={
            "workspace_id": WS_A_ID,
            "workspace": "b",
            "app_id": "tv",
            "url": URL_B,
        }, headers=AUTH_HEADERS())

        assert resp.status_code == 200
        body = resp.get_json()
        # Dados refletem SOMENTE os settings persistidos do workspace autenticado (A)
        titles = [e["title"] for e in body["events"]]
        assert titles and "Evento exclusivo do workspace B" not in titles
        externals = [c["url"] for c in tv_env.external_calls()]
        assert not any("planilha-b" in u for u in externals), "buscou planilha B!"
        settings_reads = [c["url"] for c in tv_env.calls if "workspace_app_settings" in c["url"]]
        assert all(WS_B_ID not in u for u in settings_reads)

    def test_cache_e_settings_nunca_cruzam_entre_workspaces(self, tv_client, tv_env, root_api_module):
        install_happy_world(tv_env)
        r_a = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert r_a.get_json()["validCount"] == 2

        key_a = root_api_module._tv_cache_key(WS_A_ID, SETTINGS_A["eventSource"])
        key_b = root_api_module._tv_cache_key(WS_B_ID, SETTINGS_B["eventSource"])
        assert key_a != key_b

        fresh_a, _ = root_api_module._tv_cache_read(key_a, 300)
        fresh_b, _ = root_api_module._tv_cache_read(key_b, 300)
        assert fresh_b is None, "workspace B recebeu cache de A"
        assert fresh_a["validCount"] == 2


# ── SSRF ──────────────────────────────────────────────────────────────────────

class TestSsrf:
    @pytest.mark.parametrize("url", [
        "http://files.example.com/a.xlsx",          # HTTP puro
        "https://localhost/a.xlsx",
        "https://127.0.0.1/a.xlsx",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.8/a.xlsx",
        "https://172.16.0.9/a.xlsx",
        "https://192.168.0.10/a.xlsx",
        "https://[::1]/a.xlsx",
        "https://[fc00::1]/a.xlsx",
        "https://[fe80::1]/a.xlsx",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://host/a.xlsx",
    ])
    def test_urls_bloqueadas_sem_rede(self, root_api_module, monkeypatch, url):
        monkeypatch.delenv("http_proxy", raising=False)
        called = {"n": 0}
        real_get = root_api_module.requests.get

        def counting_get(*args, **kwargs):
            called["n"] += 1
            return real_get(*args, **kwargs)

        monkeypatch.setattr(root_api_module.requests, "get", counting_get)
        content, err = root_api_module._tv_fetch_source_bytes(url)
        assert content is None
        assert err and "SSRF" in err
        assert called["n"] == 0, "requisição saiu apesar do bloqueio!"

    def test_dns_resolvendo_para_ip_privado_e_bloqueado(self, root_api_module, monkeypatch):
        def evil_dns(host, *args, **kwargs):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.50", 0))]
        monkeypatch.setattr(socket, "getaddrinfo", evil_dns)
        ok = root_api_module._tv_validate_source_url("https://attacker.example.com/x.xlsx")
        assert ok is False

    def test_redirect_para_ip_privado_e_bloqueado(self, tv_env, root_api_module):
        tv_env.route("GET", "redirector.example.com", FakeDownload(status_code=302))
        tv_env.calls[-1:] = []

        def redirect_response(*args, **kwargs):
            resp = FakeDownload(status_code=302)
            resp.headers = {"Location": "https://169.254.169.254/meta"}
            tv_env.calls.append({"method": "GET", "url": args[0], "kwargs": kwargs})
            return resp

        monkey_target = root_api_module
        original_get = monkey_target.requests.get
        monkey_target.requests.get = redirect_response  # type: ignore[assignment]
        try:
            content, err = root_api_module._tv_fetch_source_bytes(
                "https://redirector.example.com/f"
            )
        finally:
            monkey_target.requests.get = original_get  # type: ignore[assignment]
        assert content is None
        assert "SSRF" in err
        assert not any("169.254" in c["url"] for c in tv_env.calls[1:])

    def test_timeout_vira_erro_controlado(self, tv_env, root_api_module):
        import requests as requests_lib

        def timeout_get(*args, **kwargs):
            raise requests_lib.exceptions.Timeout()
        monkey_patch = root_api_module
        original = monkey_patch.requests.get
        monkey_patch.requests.get = timeout_get  # type: ignore[assignment]
        try:
            content, err = root_api_module._tv_fetch_source_bytes(
                "https://slow.example.com/a.xlsx"
            )
        finally:
            monkey_patch.requests.get = original  # type: ignore[assignment]
        assert content is None
        assert "Tempo esgotado" in err

    def test_arquivo_acima_do_limite_e_rejeitado(self, tv_env, root_api_module):
        chunk = b"x" * (1024 * 1024)  # 1 MB
        tv_env.route("GET", "big.example.com", FakeDownload(chunks=[chunk] * 9))
        content, err = root_api_module._tv_fetch_source_bytes("https://big.example.com/a.xlsx")
        assert content is None
        assert "limite" in err

    def test_url_configurada_insegura_retorna_400_no_endpoint(self, tv_client, tv_env):
        install_happy_world(tv_env)
        insecure = {**SETTINGS_A, "eventSource": {**SETTINGS_A["eventSource"], "url": "http://insecure.example.com/a.xlsx"}}
        tv_env.route(
            "GET",
            f"workspace_id=eq.{WS_A_ID}&app_id=eq.tv",
            FakeResponse([{"settings": insecure}]),
        )
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 400
        assert "SSRF" in resp.get_json()["error"]


# ── Parser XLSX ───────────────────────────────────────────────────────────────

class TestParser:
    def parse(self, root_api_module, content, **kw):
        return root_api_module._tv_parse_events_xlsx(content, **kw)

    def test_xlsx_valido_normalizado_com_hash_deterministico(self, root_api_module):
        result = self.parse(root_api_module, XLSX_A)
        assert result["validCount"] == 2
        assert result["ignoredCount"] == 0
        ev = result["events"][0]
        assert ev["title"] == "Feira de ciências"
        assert ev["date"] == "2026-09-01"
        assert ev["location"] == "Ginásio"
        assert ev["origin"] == "sharepoint_excel"
        assert len(ev["externalId"]) == 16
        again = self.parse(root_api_module, XLSX_A)
        assert again["events"][0]["externalId"] == ev["externalId"]

    def test_sheet_vazia(self, root_api_module):
        content = _xlsx([["Título", "Data"]])
        result = self.parse(root_api_module, content)
        assert result["validCount"] == 0 and result["ignoredCount"] == 0

    def test_sheet_inexistente(self, root_api_module):
        result = self.parse(root_api_module, XLSX_A, sheet_name="Não Existe")
        assert "não encontrada" in result["error"]

    def test_coluna_obrigatoria_ausente_vira_ignorado(self, root_api_module):
        content = _xlsx([["Título", "Local"], ["Sem data", "Sala 1"]])
        result = self.parse(root_api_module, content)
        assert result["validCount"] == 0
        assert result["ignoredCount"] == 1

    def test_data_invalidada_vira_ignorado(self, root_api_module):
        content = _xlsx([["Título", "Data"], ["Formatura", "32/13/2026"], ["OK", "2026-05-05"]])
        result = self.parse(root_api_module, content)
        assert result["validCount"] == 1
        assert result["ignoredCount"] == 1

    def test_duplicadas_contabilizadas_como_ignoradas(self, root_api_module):
        content = _xlsx([
            ["Título", "Data", "Local"],
            ["Hackathon", "2026-09-10", "Lab"],
            ["Hackathon", "2026-09-10", "Lab"],
        ])
        result = self.parse(root_api_module, content)
        assert result["validCount"] == 1
        assert result["ignoredCount"] == 1

    def test_linhas_vazias_sao_puladas_sem_contar(self, root_api_module):
        content = _xlsx([
            ["Título", "Data"],
            ["Aula aberta", "2026-09-12"],
            [None, None],
            ["", ""],
        ])
        result = self.parse(root_api_module, content)
        assert result["validCount"] == 1
        assert result["ignoredCount"] == 0

    def test_field_map_customiza_colunas(self, root_api_module):
        content = _xlsx([["Evento", "Quando"], ["Palestra", "2026-08-30"]])
        result = self.parse(root_api_module, content, field_map={"title": "Evento", "date": "Quando"})
        assert result["validCount"] == 1
        assert result["events"][0]["title"] == "Palestra"

    def test_workbook_invalido(self, root_api_module):
        result = self.parse(root_api_module, b"isto nao e um xlsx")
        assert "inválido" in result["error"]

    def test_arquivo_grande_respeita_cap_de_linhas(self, root_api_module):
        n = root_api_module.TV_SOURCE_PARSE_ROW_CAP + 20
        rows = [["Título", "Data"]] + [[f"Ev {i}", "2026-09-15"] for i in range(n)]
        result = self.parse(root_api_module, _xlsx(rows))
        assert result["validCount"] == root_api_module.TV_SOURCE_PARSE_ROW_CAP - 1


# ── Cache ─────────────────────────────────────────────────────────────────────

class TestCache:
    def test_segunda_chamada_dentro_do_ttl_usa_cache(self, tv_client, tv_env):
        install_happy_world(tv_env)
        r1 = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert r1.get_json()["freshness"] == "fresh"
        before = len(tv_env.external_calls())
        r2 = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        after = len(tv_env.external_calls())
        assert r2.get_json()["freshness"] == "fresh"
        assert after == before, "baixou novamente dentro do TTL"

    def test_configuracao_alterada_invlida_o_cache(self, tv_client, tv_env):
        install_happy_world(tv_env)
        tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        before = len(tv_env.external_calls())

        changed = {
            "eventSource": {**SETTINGS_A["eventSource"], "sheetName": "Eventos"},
            "display": SETTINGS_A["display"],
        }
        tv_env.route(
            "GET",
            f"workspace_id=eq.{WS_A_ID}&app_id=eq.tv",
            FakeResponse([{"settings": changed}]),
        )
        r2 = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert len(tv_env.external_calls()) > before, "troca de config deveria invalidar cache"
        assert r2.get_json()["freshness"] == "fresh"

    def test_falha_na_fonte_serve_stale(self, tv_client, tv_env, root_api_module):
        install_happy_world(tv_env)
        r1 = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert r1.get_json()["ok"] is True

        # Envelhece o cache além do TTL (continua servível como stale)
        key = root_api_module._tv_cache_key(WS_A_ID, SETTINGS_A["eventSource"])
        path = root_api_module._cache_path(key)
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        payload["timestamp"] = time.time() - 4000
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)

        # Fonte passa a falhar (última rota registrada vence)
        tv_env.route("GET", "planilha-a.xlsx", FakeDownload(status_code=500))
        r2 = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())

        body = r2.get_json()
        assert body["ok"] is True
        assert body["freshness"] == "stale"
        assert body["warning"]
        assert body["validCount"] == 2

    def test_cache_nao_ultrapassa_ttl(self, root_api_module, tmp_path):
        payload_path = tmp_path / ".cache_ttl.json"
        old = time.time() - 4000
        payload_path.write_text(json.dumps({
            "data": {"validCount": 9}, "timestamp": old,
        }), encoding="utf-8")

        original = root_api_module._cache_path
        root_api_module._cache_path = lambda key: str(payload_path)  # type: ignore[assignment]
        try:
            fresh, stale = root_api_module._tv_cache_read("qualquer", 300)
        finally:
            root_api_module._cache_path = original  # type: ignore[assignment]
        assert fresh is None, "expirado não pode vir como fresh"
        assert stale == {"validCount": 9}, "expirado ainda serve como stale"

    def test_ttl_da_resposta_limitado_as_constantes(self, root_api_module):
        assert root_api_module.TV_REFRESH_MIN == 60
        assert root_api_module.TV_REFRESH_MAX == 3600
        clamped_low = max(root_api_module.TV_REFRESH_MIN, min(root_api_module.TV_REFRESH_MAX, 5))
        clamped_high = max(root_api_module.TV_REFRESH_MIN, min(root_api_module.TV_REFRESH_MAX, 99999))
        assert clamped_low == 60 and clamped_high == 3600


# ── Fonte não configurada ─────────────────────────────────────────────────────

class TestFonteNaoConfigurada:
    def _install_base(self, fake, settings_rows):
        fake.route("GET", "/rest/v1/profiles", FakeResponse([{
            "id": "u1", "status": "active", "is_super_admin": False,
            "workspace_ids": [WS_A_ID],
        }]))
        fake.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/workspaces" in url,
            FakeResponse([{"id": WS_A_ID, "name": "WS A", "slug": "a", "disabled_apps": []}]),
        )
        fake.route(
            "GET",
            f"workspace_id=eq.{WS_A_ID}&app_id=eq.tv",
            FakeResponse(settings_rows),
        )

    def test_sem_settings_retorna_400(self, tv_client, tv_env):
        self._install_base(tv_env, [])
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 400
        assert "não configurada" in resp.get_json()["error"]

    def test_fonte_desabilitada_retorna_400(self, tv_client, tv_env):
        disabled = {**SETTINGS_A, "eventSource": {**SETTINGS_A["eventSource"], "enabled": False}}
        self._install_base(tv_env, [{"settings": disabled}])
        resp = tv_client.post("/api/tv/source/fetch", json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 400
        assert "não configurada" in resp.get_json()["error"]
