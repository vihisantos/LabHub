"""Tests for GET /api/tv/chamados/display (PR 7 — snapshot TV-safe de chamados).

Cobertura: gate device-only (JWT → tv_devices → workspace), isolamento A↔B,
projeção allowlist sem PII (dados deliberadamente contaminados), arquivados,
limite server-side, rate limit dedicado a polling e erros sem vazamento.
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

WS_A_ID = "11111111-1111-1111-1111-111111111111"
WS_B_ID = "22222222-2222-2222-2222-222222222222"
DEVICE_USER_A = "dev-user-a"
DEVICE_USER_B = "dev-user-b"

ENDPOINT = "/api/tv/chamados/display"


# ── Fakes (mesma infraestrutura de test_tv_source.py) ────────────────────────

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


def _token_for(user_id="u1"):
    return _make_jwt({
        "sub": user_id,
        "iss": f"{SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
    })


def headers_for(user_id):
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
    root_api_module._rate_limit_store.clear()
    fake.client = root_api_module.app.test_client()
    return fake


# ── Dados fake ────────────────────────────────────────────────────────────────

TICKET_COLS = (
    "ticketNumber,roomName,problemArea,problemCategory,priority,status,createdAt,resolvedAt"
)

# Chamado deliberadamente CONTAMINADO com todos os campos proibidos preenchidos:
# se qualquer um vazar para a projeção, o valor único aparece na resposta.
CONTAMINATED_TICKET_A = {
    "id": "leak-canary-id-0001",
    "ticketNumber": 101,
    "roomName": "Lab 204",
    "roomId": "leak-canary-room-1",
    "problemArea": "Computador",
    "problemCategory": "Hardware",
    "priority": "alta",
    "status": "aberto",
    "createdAt": "2026-08-20T08:00:00+00:00",
    "resolvedAt": None,
    "reportedBy": "LEAK-Joao-Silva",
    "reportedByEmail": "LEAK-joao.silva@escola.com",
    "problemDescription": "LEAK-descricao-livre-do-professor",
    "assetPatrimony": "LEAK-PAT-12345",
    "assetId": "LEAK-asset-1",
    "photos": "LEAK-http://img.example/1.jpg",
    "statusNote": "LEAK-nota-interna",
    "assignedTo": "LEAK-Maria-Souza",
    "assignedToUserId": "LEAK-user-maria",
    "feedbackRating": 5,
    "feedbackComment": "LEAK-comentario-feedback",
    "closedBy": "LEAK-tecnico",
}

TICKET_A_2 = {
    "ticketNumber": 102,
    "roomName": "Lab 101",
    "problemArea": "academica",
    "problemCategory": "Software",
    "priority": "normal",
    "status": "em_atendimento",
    "createdAt": "2026-08-19T10:00:00+00:00",
    "resolvedAt": None,
}

RESOLVED_WINDOW_ROW = {
    "status": "resolvido",
    "priority": "baixa",
    "createdAt": "2026-08-01T09:00:00+00:00",
    "resolvedAt": "2026-08-01T11:00:00+00:00",  # 2h
    "feedbackRating": 4,
}


def install_device(fake, user_id, workspace_id):
    """Profile do kiosk (trigger cria com workspace_ids vazio) + linha em tv_devices."""
    fake.route_pred(
        "GET",
        lambda url, kw: "/rest/v1/profiles" in url,
        FakeResponse([{"id": user_id, "email": f"kiosk-x@devices.labhub.local",
                       "role": "viewer", "status": "pending", "is_super_admin": False,
                       "workspace_ids": []}]),
    )
    fake.route_pred(
        "GET",
        lambda url, kw: "/rest/v1/tv_devices" in url and f"user_id=eq.{user_id}" in url,
        FakeResponse([{"id": "device-row", "workspace_id": workspace_id}]),
    )


def install_tickets(fake, workspace_id, active_rows, window_rows=None):
    """Rotas das duas consultas (fila ativa e janela de métricas)."""
    ws = f"workspace_id=eq.{workspace_id}"
    fake.route(
        "GET",
        f"{ws}&archived=eq.false&status=in.",
        FakeResponse(active_rows),
    )
    fake.route(
        "GET",
        f"{ws}&archived=eq.false&createdAt=gte.",
        FakeResponse(window_rows if window_rows is not None else []),
    )


# ── Autorização: gate device-only ─────────────────────────────────────────────

class TestDeviceOnlyGate:
    def test_sem_token_retorna_401(self, tv_client):
        resp = tv_client.client.get(ENDPOINT)
        assert resp.status_code == 401

    def test_token_invalido_retorna_401(self, tv_client):
        resp = tv_client.client.get(ENDPOINT, headers={"Authorization": "Bearer abc.def.ghi"})
        assert resp.status_code == 401

    def test_usuario_humano_sem_device_retorna_403(self, tv_client):
        # Humano autenticado válido, mas sem linha em tv_devices
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/profiles" in url,
            FakeResponse([{"id": "human-1", "status": "active", "is_super_admin": False,
                           "workspace_ids": [WS_A_ID]}]),
        )
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/tv_devices" in url,
            FakeResponse([]),
        )
        resp = tv_client.client.get(ENDPOINT, headers=headers_for("human-1"))
        assert resp.status_code == 403
        # Nenhuma consulta de chamados pode ter ocorrido antes da autorização
        assert not any("chamados_tickets" in c["url"] for c in tv_client.calls)

    def test_admin_sem_device_tambem_e_rejeitado(self, tv_client):
        """Decisão explícita: endpoint é DEVICE-ONLY. Super admin não herda acesso."""
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/profiles" in url,
            FakeResponse([{"id": "admin-1", "status": "active", "is_super_admin": True,
                           "workspace_ids": [WS_A_ID]}]),
        )
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/tv_devices" in url,
            FakeResponse([]),
        )
        resp = tv_client.client.get(ENDPOINT, headers=headers_for("admin-1"))
        assert resp.status_code == 403

    def test_device_registrado_sem_workspace_retorna_403(self, tv_client):
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/profiles" in url,
            FakeResponse([{"id": DEVICE_USER_A, "status": "active", "is_super_admin": False,
                           "workspace_ids": []}]),
        )
        tv_client.route_pred(
            "GET",
            lambda url, kw: "/rest/v1/tv_devices" in url,
            FakeResponse([{"id": "device-row", "workspace_id": None}]),
        )
        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        assert resp.status_code == 403


# ── Isolamento crítico A ↔ B ──────────────────────────────────────────────────

class TestWorkspaceIsolation:
    def test_device_a_recebe_somente_chamados_de_a(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [CONTAMINATED_TICKET_A])
        install_device(tv_client, DEVICE_USER_B, WS_B_ID)
        install_tickets(tv_client, WS_B_ID, [{
            "ticketNumber": 999, "roomName": "Sala B", "problemArea": "X",
            "problemCategory": "Y", "priority": "normal", "status": "aberto",
            "createdAt": "2026-08-20T08:00:00+00:00", "resolvedAt": None,
        }])

        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        assert resp.status_code == 200
        numbers = [t["ticketNumber"] for t in resp.get_json()["tickets"]]
        assert numbers == [101]

    def test_device_b_recebe_somente_chamados_de_b(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [CONTAMINATED_TICKET_A])
        install_device(tv_client, DEVICE_USER_B, WS_B_ID)
        b_ticket = {
            "ticketNumber": 999, "roomName": "Sala B exclusiva", "problemArea": "X",
            "problemCategory": "Y", "priority": "urgente", "status": "aberto",
            "createdAt": "2026-08-20T08:00:00+00:00", "resolvedAt": None,
        }
        install_tickets(tv_client, WS_B_ID, [b_ticket])

        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_B))
        assert resp.status_code == 200
        numbers = [t["ticketNumber"] for t in resp.get_json()["tickets"]]
        assert numbers == [999]

    def test_adulterar_workspace_e_ignorado_sem_mudar_escopo(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [CONTAMINATED_TICKET_A])
        install_tickets(tv_client, WS_B_ID, [{
            "ticketNumber": 999, "roomName": "Sala B", "problemArea": "X",
            "problemCategory": "Y", "priority": "normal", "status": "aberto",
            "createdAt": "2026-08-20T08:00:00+00:00", "resolvedAt": None,
        }])

        resp = tv_client.client.get(
            f"{ENDPOINT}?workspace_id={WS_B_ID}&workspace=b&device_id=outro-device",
            headers=headers_for(DEVICE_USER_A),
        )
        assert resp.status_code == 200
        numbers = [t["ticketNumber"] for t in resp.get_json()["tickets"]]
        assert numbers == [101], "parâmetro do cliente alterou o escopo!"

        # Nenhuma consulta usou o workspace B
        ticket_queries = [c["url"] for c in tv_client.calls if "chamados_tickets" in c["url"]]
        assert ticket_queries and all(WS_B_ID not in u for u in ticket_queries)

    def test_metricas_isoladas_por_workspace(self, tv_client):
        # A tem 1 ativo alta prioridade + 1 resolvido na janela; B está vazio
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(
            tv_client, WS_A_ID,
            [CONTAMINATED_TICKET_A],
            [RESOLVED_WINDOW_ROW],
        )
        r_a = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        s_a = r_a.get_json()["summary"]
        assert s_a["total"] == 1 and s_a["highPriority"] == 1
        assert s_a["avgResolutionHours"] == 2.0 and s_a["satisfaction"] == 4.0

        install_device(tv_client, DEVICE_USER_B, WS_B_ID)
        install_tickets(tv_client, WS_B_ID, [], [])
        r_b = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_B))
        s_b = r_b.get_json()["summary"]
        assert s_b == {
            "total": 0, "open": 0, "inProgress": 0, "highPriority": 0,
            "avgResolutionHours": None, "satisfaction": None,
        }


# ── Projeção TV-safe ──────────────────────────────────────────────────────────

ALLOWED_TICKET_KEYS = {
    "ticketNumber", "roomName", "problemArea", "problemCategory",
    "priority", "status", "createdAt", "resolvedAt",
}


class TestTvSafeProjection:
    def _get_response(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(
            tv_client, WS_A_ID,
            [CONTAMINATED_TICKET_A, TICKET_A_2],
            [RESOLVED_WINDOW_ROW],
        )
        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        assert resp.status_code == 200
        return resp.get_json()

    def test_resposta_contem_apenas_campos_allowlisted(self, tv_client):
        body = self._get_response(tv_client)
        assert set(body.keys()) == {"generatedAt", "summary", "tickets"}
        assert set(body["summary"].keys()) == {
            "total", "open", "inProgress", "highPriority",
            "avgResolutionHours", "satisfaction",
        }
        for ticket in body["tickets"]:
            assert set(ticket.keys()) == ALLOWED_TICKET_KEYS

    def test_nenhum_campo_proibido_vaza_na_resposta(self, tv_client):
        raw = json.dumps(self._get_response(tv_client))
        for forbidden_value in (
            CONTAMINATED_TICKET_A["reportedBy"],
            CONTAMINATED_TICKET_A["reportedByEmail"],
            CONTAMINATED_TICKET_A["problemDescription"],
            CONTAMINATED_TICKET_A["assetPatrimony"],
            CONTAMINATED_TICKET_A["assetId"],
            CONTAMINATED_TICKET_A["photos"],
            CONTAMINATED_TICKET_A["statusNote"],
            CONTAMINATED_TICKET_A["assignedTo"],
            CONTAMINATED_TICKET_A["assignedToUserId"],
            CONTAMINATED_TICKET_A["feedbackComment"],
            CONTAMINATED_TICKET_A["closedBy"],
            CONTAMINATED_TICKET_A["roomId"],
            CONTAMINATED_TICKET_A["id"],
        ):
            assert forbidden_value not in raw, f"PII vazou: {forbidden_value}"
        for forbidden_key in (
            "reportedBy", "reportedByEmail", "problemDescription", "assetPatrimony",
            "photos", "feedbackComment", "feedbackRating", "assignedTo",
            "statusNote", "closedBy", "comments", "events", "workspace_id",
        ):
            assert forbidden_key not in raw, f"chave proibida na resposta: {forbidden_key}"

    def test_consulta_usa_select_allowlist_sem_select_all(self, tv_client):
        self._get_response(tv_client)
        ticket_queries = [c["url"] for c in tv_client.calls if "chamados_tickets" in c["url"]]
        assert len(ticket_queries) == 2
        for url in ticket_queries:
            assert "select=*" not in url
        assert f"select={TICKET_COLS}" in ticket_queries[0]

    def test_arquivados_ficam_fora_da_consulta(self, tv_client):
        self._get_response(tv_client)
        ticket_queries = [c["url"] for c in tv_client.calls if "chamados_tickets" in c["url"]]
        assert all("archived=eq.false" in u for u in ticket_queries)


# ── Contrato / comportamento ─────────────────────────────────────────────────

class TestContractAndLimits:
    def test_workspace_sem_chamados_retorna_200_vazio(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [], [])
        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["tickets"] == []
        assert body["summary"]["total"] == 0
        assert body["generatedAt"]

    def test_limite_maximo_de_chamados_na_url(self, tv_client, root_api_module):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [])
        tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        active_query = next(c["url"] for c in tv_client.calls if "status=in." in c["url"])
        assert f"limit={root_api_module.TV_CHAMADOS_TICKET_LIMIT}" in active_query
        assert root_api_module.TV_CHAMADOS_TICKET_LIMIT == 100
        # Somente status ativos na fila da TV
        assert "in.(aberto,a_caminho,em_atendimento)" in active_query

    def test_rate_limit_dedicado_ao_polling(self, tv_client, root_api_module, monkeypatch):
        # Limite baixo só para o teste (produção: 240/h — polling 30–60s confortável)
        monkeypatch.setattr(root_api_module, "TV_CHAMADOS_RATE_LIMIT_PER_HOUR", 3)
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        install_tickets(tv_client, WS_A_ID, [])

        statuses = [
            tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A)).status_code
            for _ in range(5)
        ]
        assert statuses[:3] == [200, 200, 200]
        assert statuses[3] == 429 and statuses[4] == 429

    def test_rate_limit_padrao_permite_polling_legitimo(self, tv_client, root_api_module):
        # 120 req/h (polling de 30s) cabe no limite de 240/h
        assert root_api_module.TV_CHAMADOS_RATE_LIMIT_PER_HOUR >= 240

    def test_supabase_indisponivel_nas_consultas_retorna_502(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)
        tv_client.route(
            "GET",
            "chamados_tickets",
            FakeResponse({"error": "boom"}, status_code=500, ok=False),
        )
        resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        assert resp.status_code == 502
        assert resp.get_json()["error"] == "Erro ao consultar chamados"

    def test_erro_interno_nao_vaza_detalhes(self, tv_client):
        install_device(tv_client, DEVICE_USER_A, WS_A_ID)

        def exploding_tickets_get(url, **kwargs):
            if "chamados_tickets" in url:
                raise RuntimeError("LEAK-pg: relation chamados_tickets does not exist near SELEC")
            return FakeRequests.get(tv_client, url, **kwargs)

        original = tv_client.get
        tv_client.get = exploding_tickets_get  # type: ignore[assignment]
        try:
            resp = tv_client.client.get(ENDPOINT, headers=headers_for(DEVICE_USER_A))
        finally:
            tv_client.get = original  # type: ignore[assignment]

        assert resp.status_code == 500
        body = resp.get_json()
        assert body == {"error": "Erro interno"}
        raw = json.dumps(body)
        assert "LEAK" not in raw and "chamados_tickets" not in raw
