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


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    """Cria um JWT bem-formado para os testes (a verificação real é bypassada)."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


SUPER_ADMIN_PROFILE = {
    "id": "user-1",
    "email": "test@test.com",
    "name": "Test User",
    "role": "technician",
    "is_super_admin": True,
    "workspace_ids": ["ws-a"],
    "status": "active",
}


def _setup_auth(fake_requests, monkeypatch, profile=None):
    """Configura a camada de auth: JWT válido + perfil no Supabase fake.

    Retorna os headers Authorization para usar nas chamadas do client.
    """
    profile = profile or SUPER_ADMIN_PROFILE
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _patch_auth_infrastructure(api_module, fake_requests, monkeypatch):
    """Roteia requests do app e do módulo auth pelo Supabase fake."""
    monkeypatch.setattr(api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(api_module, "requests", fake_requests)
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepta requests.get/post/patch/delete e roteia por substring da URL."""

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
    # Reaproveita o módulo da API já carregado por outro arquivo de teste
    # (ex.: "root_api" em test_auth_layer.py): reexecutar app.py registraria
    # rotas num app Flask que já atendeu requisições, o que quebra.
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
    _patch_auth_infrastructure(api_module, fake_requests, monkeypatch)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


@pytest.fixture()
def unconfigured_client(api_module, monkeypatch):
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "")
    return api_module.app.test_client()


def _valid_payload(**overrides):
    payload = {
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "reportedBy": "Prof. Maria",
        "problemArea": "academica",
        "problemCategory": "Internet",
        "problemDescription": "Sem conexão desde às 10h",
    }
    payload.update(overrides)
    return payload


def _route_workspace_ok(fake_requests, disabled_apps=None):
    fake_requests.route(
        "GET",
        "/rest/v1/workspaces",
        FakeResponse([{"id": "ws-a", "name": "Anhembi Piracicaba", "slug": "piracicaba", "location": "Centro", "disabled_apps": disabled_apps or []}]),
    )


def _route_ticket_number(fake_requests, last=5):
    fake_requests.route(
        "GET",
        "chamados_tickets?select=ticketNumber",
        FakeResponse([{"ticketNumber": last}] if last else []),
    )


def _route_create_insert(fake_requests, ticket):
    fake_requests.route("POST", "/rest/v1/chamados_tickets", FakeResponse([ticket]))


def _route_list_tickets(fake_requests, tickets):
    fake_requests.route("GET", "/rest/v1/chamados_tickets", FakeResponse(tickets))


def _route_patch_ticket(fake_requests, row):
    fake_requests.route("PATCH", "/rest/v1/chamados_tickets", FakeResponse([row]) if row else FakeResponse([]))


def _route_get_ticket(fake_requests, row):
    fake_requests.route(
        "GET",
        "chamados_tickets?id=eq.",
        FakeResponse([row] if row else []),
    )


def _make_ticket(**overrides):
    ticket = {
        "id": "ticket-1",
        "workspace_id": "ws-a",
        "roomId": "",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Sem conexão",
        "status": "aberto",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "",
        "assignedTo": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "ticketNumber": 6,
        "createdAt": "2026-06-25T12:00:00Z",
        "updatedAt": "2026-06-25T12:00:00Z",
        "resolvedAt": None,
    }
    ticket.update(overrides)
    return ticket


# ── RLS / schema ──


def test_chamados_table_sql_garante_rls(api_module):
    sql = api_module.CHAMADOS_TABLE_SQL
    assert "CREATE TABLE IF NOT EXISTS public.chamados_tickets" in sql
    assert '"priority" TEXT NOT NULL DEFAULT' in sql
    assert '"statusNote" TEXT DEFAULT' in sql
    assert '"photos" TEXT DEFAULT' in sql
    assert '"feedbackRating" INTEGER' in sql
    assert '"feedbackComment" TEXT DEFAULT' in sql
    assert '"feedbackAt" TIMESTAMPTZ' in sql
    assert "chk_feedback_rating" in sql
    assert "BETWEEN 1 AND 5" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.chamados_tickets FROM anon, authenticated, PUBLIC" in sql


# ── GET /api/chamados/workspaces ──


def test_workspaces_sem_supabase_retorna_503(unconfigured_client):
    resp = unconfigured_client.get("/api/chamados/workspaces")
    assert resp.status_code == 503


def test_workspaces_lista_campi(client, fake_requests):
    _route_workspace_ok(fake_requests)
    resp = client.get("/api/chamados/workspaces")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["workspaces"][0]["name"] == "Anhembi Piracicaba"


def test_workspaces_erro_do_supabase_retorna_502(client, fake_requests):
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse({"error": "x"}, status_code=500, ok=False))
    resp = client.get("/api/chamados/workspaces")
    assert resp.status_code == 502


# ── POST /api/chamados ──


def test_create_sem_supabase_retorna_503(unconfigured_client):
    resp = unconfigured_client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 503


@pytest.mark.parametrize(
    "mutator,error",
    [
        (lambda p: p.pop("workspace_id"), "Selecione o campus"),
        (lambda p: p.pop("roomName"), "Informe a sala"),
        (lambda p: p.pop("reportedBy"), "Informe seu nome"),
        (lambda p: p.update({"problemArea": "outra"}), "Selecione a área do problema"),
        (lambda p: p.pop("problemCategory"), "Selecione o tipo de problema"),
        (lambda p: p.pop("problemDescription"), "Descreva o que está acontecendo"),
    ],
)
def test_create_valida_campos_obrigatorios(client, fake_requests, mutator, error):
    payload = _valid_payload()
    mutator(payload)
    resp = client.post("/api/chamados", json=payload)
    assert resp.status_code == 400
    assert resp.get_json()["error"] == error
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


def test_create_campus_inexistente_retorna_400(client, fake_requests):
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([]))
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Campus não encontrado"


def test_create_gera_numero_sequencial_e_persiste(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["ticketNumber"] == 6
    assert resp.get_json()["ticket"]["status"] == "aberto"

    insert_calls = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")
    assert len(insert_calls) == 1
    payload = insert_calls[0]["kwargs"]["json"]
    assert payload["workspace_id"] == "ws-a"
    assert payload["roomName"] == "Sala 101"
    assert payload["problemArea"] == "academica"
    assert payload["ticketNumber"] == 6
    assert payload["status"] == "aberto"
    assert payload["priority"] == "normal"
    assert "Prefer" in insert_calls[0]["kwargs"]["headers"]
    assert insert_calls[0]["kwargs"]["headers"]["Prefer"] == "return=representation"


def test_create_sem_numero_anterior_comeca_em_1(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 200
    payload = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert payload["ticketNumber"] == 1


def test_create_falha_ao_persistir_retorna_502(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    fake_requests.route(
        "POST",
        "/rest/v1/chamados_tickets",
        FakeResponse({"error": "duplicate"}, status_code=409, ok=False),
    )

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 502


def test_create_normaliza_espacos_dos_campos(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))

    resp = client.post(
        "/api/chamados",
        json=_valid_payload(roomName="  Sala 101  ", reportedBy="  Prof. Maria  "),
    )

    assert resp.status_code == 200
    payload = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert payload["roomName"] == "Sala 101"
    assert payload["reportedBy"] == "Prof. Maria"


def test_create_prioridade_valida_eh_repassada(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6, priority="urgente"))

    resp = client.post("/api/chamados", json=_valid_payload(priority="urgente"))

    assert resp.status_code == 200
    payload = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert payload["priority"] == "urgente"


def test_create_prioridade_invalida_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)

    resp = client.post("/api/chamados", json=_valid_payload(priority="x"))

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Prioridade inválida"
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


def test_create_persiste_foto_opcional(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    resp = client.post(
        "/api/chamados",
        json=_valid_payload(photos="data:image/jpeg;base64,abc123"),
    )

    assert resp.status_code == 200
    payload = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert payload["photos"] == "data:image/jpeg;base64,abc123"


def test_create_foto_invalida_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)

    resp = client.post("/api/chamados", json=_valid_payload(photos="https://evil.example/x.png"))

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Foto inválida"
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


def test_create_foto_muito_grande_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)

    resp = client.post(
        "/api/chamados",
        json=_valid_payload(photos="data:image/jpeg;base64," + "a" * 600001),
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Foto muito grande"
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


# ── Push no POST /api/chamados ──


def _make_sub(**overrides):
    """Inscrição push fictícia de um técnico do workspace ws-a."""
    sub = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/fake",
        "expirationTime": None,
        "keys": {"p256dh": "fake", "auth": "fake"},
        "user": {
            "id": "u-1",
            "name": "Técnico",
            "role": "admin",
            "is_super_admin": True,
            "workspace_ids": ["ws-a"],
            "apps": {"chamados": True},
            "notify_settings": {},
        },
    }
    sub.update(overrides)
    return sub


def test_create_envia_push_para_subscribers(client, fake_requests, api_module, monkeypatch):
    """Quando há inscritos do módulo chamados, o push é disparado logo após criar o chamado."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    calls = []
    monkeypatch.setattr(api_module, "_target_subs", lambda **kw: [_make_sub()])

    def fake_push(sub, title, body, url="/"):
        calls.append((title, body, url))
        return True

    monkeypatch.setattr(api_module, "push_notify", fake_push)

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 200
    assert len(calls) == 1
    title, body, url = calls[0]
    assert title == "Novo chamado #6"
    assert body == "Sala 101 · Internet · Prof. Maria"
    assert url == "/chamados/tickets/ticket-1"


def test_create_push_falha_nao_impede_criacao(client, fake_requests, api_module, monkeypatch):
    """Falha no envio do push não impede a criação do chamado (try/except no backend)."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    monkeypatch.setattr(api_module, "_target_subs", lambda **kw: [_make_sub()])

    def boom(*args, **kwargs):
        raise RuntimeError("webpush falhou")

    monkeypatch.setattr(api_module, "push_notify", boom)

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["ticketNumber"] == 6
    # O chamado foi persistido mesmo com o push quebrado
    assert len(fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")) == 1


def test_create_push_sem_subscribers_nao_quebra(client, fake_requests, api_module, monkeypatch):
    """Sem subscribers do módulo chamados, o chamado é criado normalmente."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    monkeypatch.setattr(api_module, "_target_subs", lambda **kw: [])

    resp = client.post("/api/chamados", json=_valid_payload())

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["ticketNumber"] == 6


# ── GET /api/chamados ──


def test_list_retorna_chamados(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_list_tickets(fake_requests, [_make_ticket()])
    resp = client.get("/api/chamados", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["tickets"][0]["roomName"] == "Sala 101"


def test_list_aplica_filtros_de_workspace_e_status(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_list_tickets(fake_requests, [])
    resp = client.get("/api/chamados?workspace_id=ws-a&status=aberto", headers=headers)
    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "workspace_id=eq.ws-a" in url
    assert "status=eq.aberto" in url


def test_list_erro_do_supabase_retorna_502(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route(
        "GET",
        "/rest/v1/chamados_tickets",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.get("/api/chamados", headers=headers)
    assert resp.status_code == 502


def test_list_filtra_por_reporter(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_list_tickets(fake_requests, [_make_ticket()])
    resp = client.get("/api/chamados", query_string={"reportedBy": "Maria"}, headers=headers)
    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "reportedBy=ilike.*Maria*" in url


# ── GET /api/chamados/<id> ──


def test_get_chamado_por_id(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket())
    resp = client.get("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["id"] == "ticket-1"


def test_get_chamado_nao_encontrado_retorna_404(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, None)
    resp = client.get("/api/chamados/ticket-unknown", headers=headers)
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Chamado não encontrado"


def test_get_chamado_erro_do_supabase_retorna_502(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route(
        "GET",
        "chamados_tickets?id=eq.",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.get("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 502


# ── PATCH /api/chamados/<id> ──


def test_patch_sem_updates_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket())
    resp = client.patch("/api/chamados/ticket-1", json={}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Nada para atualizar"


def test_patch_status_resolvido_define_resolved_at(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", resolvedAt="2026-06-25T12:05:00Z"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["status"] == "resolvido"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["resolvedAt"]
    assert "updatedAt" in patch_call["kwargs"]["json"]


def test_patch_status_fechado_arquiva_automaticamente(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(
        fake_requests,
        _make_ticket(
            status="fechado",
            archived=True,
            closedAt="2026-06-25T13:00:00Z",
            closedBy="Técnico 1",
        ),
    )

    resp = client.patch("/api/chamados/ticket-1", json={"status": "fechado", "closedBy": "Técnico 1"}, headers=headers)

    assert resp.status_code == 200
    ticket = resp.get_json()["ticket"]
    assert ticket["status"] == "fechado"
    assert ticket["archived"] is True
    assert ticket["closedBy"] == "Técnico 1"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["archived"] is True
    assert patch_call["kwargs"]["json"]["closedAt"]
    assert "updatedAt" in patch_call["kwargs"]["json"]


def test_patch_reabertura_limpa_arquivamento(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", archived=False, closedAt=None))

    resp = client.patch(
        "/api/chamados/ticket-1",
        json={"status": "aberto", "archived": False, "closedAt": None},
        headers=headers,
    )

    assert resp.status_code == 200
    ticket = resp.get_json()["ticket"]
    assert ticket["status"] == "aberto"
    assert ticket["archived"] is False
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["archived"] is False
    assert patch_call["kwargs"]["json"]["closedAt"] is None


def test_patch_reabertura_de_fechado_limpa_resolved_at(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(
        fake_requests,
        _make_ticket(
            status="fechado",
            resolvedAt="2026-06-25T13:00:00Z",
            closedAt="2026-06-25T13:00:00Z",
            archived=True,
        ),
    )
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", archived=False, resolvedAt=None, closedAt=None))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "aberto"}, headers=headers)

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["resolvedAt"] is None
    assert patch["closedAt"] is None
    assert patch["closedBy"] == ""
    assert patch["archived"] is False


def test_patch_status_invalido_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    resp = client.patch("/api/chamados/ticket-1", json={"status": "foo"}, headers=headers)

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Status inválido"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_patch_status_note_persiste(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="a_caminho", statusNote="Em outro chamado, atendimento em 5 minutos"))

    resp = client.patch("/api/chamados/ticket-1", json={"statusNote": "Em outro chamado, atendimento em 5 minutos"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["statusNote"] == "Em outro chamado, atendimento em 5 minutos"
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["statusNote"] == "Em outro chamado, atendimento em 5 minutos"


def test_patch_resolvido_limpa_status_note(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="a_caminho", statusNote="Técnico a caminho"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", statusNote=""))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"}, headers=headers)

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["statusNote"] == ""


def test_patch_ignora_campos_nao_permitidos(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="em_atendimento"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "em_atendimento", "roomName": "Hackeado"}, headers=headers)

    assert resp.status_code == 200
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert "roomName" not in patch_call["kwargs"]["json"]


def test_patch_prioridade_valida_eh_aplicada(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", priority="urgente"))

    resp = client.patch("/api/chamados/ticket-1", json={"priority": "urgente"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["priority"] == "urgente"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["priority"] == "urgente"


def test_patch_prioridade_invalida_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.patch("/api/chamados/ticket-1", json={"priority": "x"}, headers=headers)

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Prioridade inválida"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_patch_photos_persiste(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", photos="data:image/jpeg;base64,xyz"))

    resp = client.patch("/api/chamados/ticket-1", json={"photos": "data:image/jpeg;base64,xyz"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["photos"] == "data:image/jpeg;base64,xyz"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["photos"] == "data:image/jpeg;base64,xyz"


def test_patch_photos_vazio_remove(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", photos=""))

    resp = client.patch("/api/chamados/ticket-1", json={"photos": ""}, headers=headers)

    assert resp.status_code == 200
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["photos"] == ""


def test_patch_troca_foto_destroi_antiga_no_cloudinary(client, fake_requests, monkeypatch, api_module):
    """A2: ao substituir a foto, apaga a foto antiga do Cloudinary (nunca a nova)."""
    old_url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"
    new_url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/b.jpg"
    headers = _setup_auth(fake_requests, monkeypatch)
    # ownership + consulta da foto anterior (A2) retornam o ticket com a foto antiga
    _route_get_ticket(fake_requests, _make_ticket(status="aberto", photos=old_url))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", photos=new_url))

    destroyed = []
    monkeypatch.setattr(
        api_module,
        "_cloudinary_destroy",
        lambda url: (
            destroyed.append(url) or True
        ) if url.startswith("https://res.cloudinary.com/") else False,
    )

    resp = client.patch("/api/chamados/ticket-1", json={"photos": new_url}, headers=headers)

    assert resp.status_code == 200
    assert destroyed == [old_url], "A foto antiga deve ser destruída"
    assert new_url not in destroyed, "A foto nova não deve ser destruída"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["photos"] == new_url


def test_patch_mesma_foto_nao_destroi(client, fake_requests, monkeypatch, api_module):
    """A2: se a foto não mudou, não chama destroy (custo/uso desnecessário)."""
    url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto", photos=url))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", photos=url))

    destroyed = []
    monkeypatch.setattr(
        api_module,
        "_cloudinary_destroy",
        lambda u: (
            destroyed.append(u) or True
        ) if u.startswith("https://res.cloudinary.com/") else False,
    )

    resp = client.patch("/api/chamados/ticket-1", json={"photos": url}, headers=headers)

    assert resp.status_code == 200
    assert destroyed == [], "Mesma foto não deve ser destruída"


def test_patch_chamado_nao_encontrado_retorna_404(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, None)
    _route_patch_ticket(fake_requests, None)
    resp = client.patch("/api/chamados/ticket-unknown", json={"status": "resolvido"}, headers=headers)
    assert resp.status_code == 404


# ── DELETE /api/chamados/<id> ──


def test_delete_chamado(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket())
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, ok=True))
    resp = client.delete("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True


def test_delete_chamado_destroi_fotos_cloudinary_best_effort(client, fake_requests, monkeypatch, api_module):
    """A1: ao remover o chamado, apaga do Cloudinary a foto do ticket e dos eventos."""
    headers = _setup_auth(fake_requests, monkeypatch)
    cloud_url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"
    event_url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/b.jpg"
    _route_get_ticket(
        fake_requests,
        _make_ticket(photos=cloud_url),
    )
    # GET dos eventos do chamado vindo de _route_get_ticket? Não — este é um GET
    # separado em ticket_events (a rota de chamados usa substring "chamados_tickets?id=eq.").
    fake_requests.route(
        "GET",
        "/rest/v1/ticket_events",
        FakeResponse([{"id": "ev-1", "photo_urls": f'["{event_url}"]'}]),
    )
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, ok=True))

    destroyed = []
    monkeypatch.setattr(
        api_module,
        "_cloudinary_destroy",
        lambda url: (
            destroyed.append(url) or True
        ) if url.startswith("https://res.cloudinary.com/") else False,
    )

    resp = client.delete("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["photos_destroyed"] == 2
    assert set(destroyed) == {cloud_url, event_url}
    # O DELETE do registro precede a limpeza (best-effort não falha a resposta)
    delete_calls = fake_requests.calls_for("DELETE", "chamados_tickets")
    assert len(delete_calls) == 1


def test_delete_chamado_falha_destroy_nao_quebra_resposta(client, fake_requests, monkeypatch, api_module):
    """A1: se o destroy falhar, o DELETE continua retornando sucesso."""
    headers = _setup_auth(fake_requests, monkeypatch)
    cloud_url = "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"
    _route_get_ticket(fake_requests, _make_ticket(photos=cloud_url))
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, ok=True))

    monkeypatch.setattr(api_module, "_cloudinary_destroy", lambda url: False)

    resp = client.delete("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True
    assert resp.get_json()["photos_destroyed"] == 0


def test_delete_falha_retorna_502(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket())
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, status_code=500, ok=False))
    resp = client.delete("/api/chamados/ticket-1", headers=headers)
    assert resp.status_code == 502


# ── Helpers de push (inscrições Redis) ──


class FakeRedis:
    def __init__(self, members=None):
        self.members = list(members or [])
        self.sadds = []
        self.deleted = []

    def smembers(self, key):
        return list(self.members)

    def sadd(self, key, value):
        self.sadds.append((key, value))
        self.members.append(value)

    def delete(self, key):
        self.deleted.append(key)


def _sub(endpoint="https://fcm.example/push/x"):
    return {"endpoint": endpoint, "expirationTime": None, "keys": {"p256dh": "a", "auth": "b"}}


def _redis_client(api_module, monkeypatch, members=None):
    fake = FakeRedis(members)
    monkeypatch.setattr(api_module, "redis", fake)
    return fake


# ── Push ao professor quando status/mensagem mudam ──


@pytest.fixture()
def notify_client(api_module, fake_requests, monkeypatch):
    _patch_auth_infrastructure(api_module, fake_requests, monkeypatch)
    sent = []
    monkeypatch.setattr(api_module, "push_notify", lambda sub, title, body, url="/": sent.append({"title": title, "body": body, "url": url}))
    return api_module.app.test_client(), sent


def test_patch_status_notifica_professor(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"}, headers=headers)

    assert resp.status_code == 200
    assert len(sent) == 1
    assert "Como foi seu atendimento" in sent[0]["title"]
    assert "⭐" in sent[0]["title"]
    assert "chamado #6 foi resolvido" in sent[0]["body"].lower()
    assert "avali" in sent[0]["body"].lower()
    assert sent[0]["url"] == "/chamados-publico/feedback/ticket-1"


def test_patch_mesmo_status_nao_notifica(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "aberto"}, headers=headers)

    assert resp.status_code == 200
    assert sent == []


def test_patch_status_note_nova_notifica(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto", statusNote=""))
    _route_patch_ticket(
        fake_requests,
        _make_ticket(status="aberto", statusNote="Em outro chamado, atendimento em 5 minutos"),
    )

    resp = client.patch("/api/chamados/ticket-1", json={"statusNote": "Em outro chamado, atendimento em 5 minutos"}, headers=headers)

    assert resp.status_code == 200
    assert len(sent) == 1
    assert "Em outro chamado, atendimento em 5 minutos" in sent[0]["title"]


def test_patch_status_note_igual_nao_notifica(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto", statusNote="Mesma mensagem"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", statusNote="Mesma mensagem"))

    resp = client.patch("/api/chamados/ticket-1", json={"statusNote": "Mesma mensagem"}, headers=headers)

    assert resp.status_code == 200
    assert sent == []


def test_patch_status_em_atendimento_nao_usa_url_feedback(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="em_atendimento"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 200
    assert len(sent) == 1
    assert "/chamados-publico/feedback/" not in sent[0]["url"]
    assert sent[0]["url"] == "/chamados-publico/success/ticket-1"


def test_patch_resolvido_mensagem_inclui_ticket_number(api_module, notify_client, fake_requests, monkeypatch):
    client, sent = notify_client
    headers = _setup_auth(fake_requests, monkeypatch)
    _redis_client(api_module, monkeypatch, members=[json.dumps(_sub(), ensure_ascii=False)])
    _route_get_ticket(fake_requests, _make_ticket(status="aberto", ticketNumber=42))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", ticketNumber=42))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"}, headers=headers)

    assert resp.status_code == 200
    assert "#42" in sent[0]["body"]

# -- Fase 5: atribuição de técnicos + relatórios --


def test_schema_inclui_assigned_to_user_id(api_module):
    assert "assignedToUserId" in api_module.CHAMADOS_TABLE_SQL
    assert 'ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "assignedToUserId"' in api_module.CHAMADOS_TABLE_SQL


def test_create_aceita_assigned_to_user_id(client, fake_requests):
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6, assignedTo="Técnico 2", assignedToUserId="user-2"))

    resp = client.post(
        "/api/chamados",
        json=_valid_payload(assignedTo="Técnico 2", assignedToUserId="user-2"),
    )

    assert resp.status_code == 200
    insert = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert insert["assignedToUserId"] == "user-2"
    assert insert["assignedTo"] == "Técnico 2"


def _route_assignment_get(fake_requests, prev_row):
    fake_requests.route(
        "GET",
        "chamados_tickets?id=eq.",
        FakeResponse([prev_row] if prev_row else []),
    )


def _assignment_push_fixture(api_module, monkeypatch):
    sent = []
    target_kwargs = []

    def fake_target(**kw):
        target_kwargs.append(kw)
        return [_make_sub()]

    def fake_push(sub, title, body, url="/"):
        sent.append({"title": title, "body": body, "url": url})
        return True

    monkeypatch.setattr(api_module, "_target_subs", fake_target)
    monkeypatch.setattr(api_module, "push_notify", fake_push)
    return sent, target_kwargs


def test_patch_atribui_tecnico_com_push_direto(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    sent, target_kwargs = _assignment_push_fixture(api_module, monkeypatch)
    _route_assignment_get(fake_requests, _make_ticket(assignedTo="", assignedToUserId=""))
    _route_patch_ticket(
        fake_requests,
        _make_ticket(status="aberto", assignedTo="Técnico 2", assignedToUserId="user-2"),
    )

    resp = client.patch("/api/chamados/ticket-1", json={"assignedTo": "Técnico 2", "assignedToUserId": "user-2"}, headers=headers)

    assert resp.status_code == 200
    assert len(sent) == 1
    assert "atribuído a você" in sent[0]["title"]
    assert "/chamados/tickets/ticket-1" in sent[0]["url"]
    # Segmentação per-usuário: filtra pelo id do técnico e módulo chamados
    assert target_kwargs and target_kwargs[0]["user_id"] == "user-2"
    assert target_kwargs[0]["module"] == "chamados"
    assert target_kwargs[0]["workspace_id"] == "ws-a"


def test_patch_atribuicao_sem_mudanca_nao_avisa(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    sent, _ = _assignment_push_fixture(api_module, monkeypatch)
    _route_assignment_get(fake_requests, _make_ticket(assignedTo="Técnico 2", assignedToUserId="user-2"))
    _route_patch_ticket(
        fake_requests,
        _make_ticket(status="aberto", assignedTo="Técnico 2", assignedToUserId="user-2"),
    )

    resp = client.patch("/api/chamados/ticket-1", json={"assignedToUserId": "user-2"}, headers=headers)

    assert resp.status_code == 200
    assert sent == []


def test_patch_remove_atribuicao_nao_avisa(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    sent, _ = _assignment_push_fixture(api_module, monkeypatch)
    _route_assignment_get(fake_requests, _make_ticket(assignedTo="Técnico 2", assignedToUserId="user-2"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", assignedTo="", assignedToUserId=""))

    resp = client.patch("/api/chamados/ticket-1", json={"assignedToUserId": ""}, headers=headers)

    assert resp.status_code == 200
    assert sent == []


def test_reports_agrega_chamados_do_periodo(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    rows = [
        _make_ticket(
            id="t-1",
            status="resolvido",
            assignedTo="Técnico A",
            createdAt="2026-06-01T10:00:00Z",
            resolvedAt="2026-06-01T12:00:00Z",
            feedbackRating=5,
        ),
        _make_ticket(
            id="t-2",
            status="em_atendimento",
            assignedTo="Técnico A",
            problemCategory="Projetor",
            problemArea="administrativa",
            roomName="Lab 2",
            createdAt="2026-06-05T10:00:00Z",
            resolvedAt=None,
            feedbackRating=None,
        ),
    ]
    fake_requests.route("GET", "chamados_tickets?select=status,priority", FakeResponse(rows))

    resp = client.get("/api/chamados/reports", query_string={"from": "2026-06-01T00:00:00Z", "to": "2026-07-01T00:00:00Z"}, headers=headers)

    assert resp.status_code == 200
    report = resp.get_json()["report"]
    assert report["total"] == 2
    assert report["byStatus"]["resolvido"] == 1
    assert report["byStatus"]["em_atendimento"] == 1
    assert report["byCategory"]["Internet"] == 1
    assert report["byCategory"]["Projetor"] == 1
    assert report["byArea"]["administrativa"] == 1
    assert ["Lab 2", 1] in report["byRoom"]
    assert report["avgResolutionHours"] == 2.0
    assert report["feedback"] == {"count": 1, "average": 5.0}
    assert report["byTechnician"] == [
        {
            "name": "Técnico A",
            "open": 1,
            "resolved": 1,
            "total": 2,
            "avgResolutionHours": 2.0,
            "rating": 5.0,
            "ratingCount": 1,
        }
    ]
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "createdAt=gte." in url
    assert "createdAt=lte." in url


def test_reports_filtra_por_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route("GET", "chamados_tickets?select=status,priority", FakeResponse([]))
    resp = client.get("/api/chamados/reports", query_string={"workspace_id": "ws-a"}, headers=headers)
    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "workspace_id=eq.ws-a" in url


def test_reports_periodo_invalido_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    resp = client.get("/api/chamados/reports", query_string={"from": "nao-e-data"}, headers=headers)
    assert resp.status_code == 400


def test_reports_from_apos_to_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    resp = client.get(
        "/api/chamados/reports",
        query_string={"from": "2026-07-01T00:00:00Z", "to": "2026-06-01T00:00:00Z"},
        headers=headers,
    )
    assert resp.status_code == 400


def test_reports_erro_do_supabase_retorna_502(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route(
        "GET",
        "chamados_tickets?select=status,priority",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.get("/api/chamados/reports", headers=headers)
    assert resp.status_code == 502

# ── Fase 4: eventos (histórico/comentários) + fotos Cloudinary ──


def test_chamados_table_sql_inclui_ticket_events(api_module):
    sql = api_module.CHAMADOS_TABLE_SQL
    assert "CREATE TABLE IF NOT EXISTS public.ticket_events" in sql
    assert "REFERENCES public.chamados_tickets(id) ON DELETE CASCADE" in sql
    assert "ticket_events" in sql
    assert "idx_ticket_events_ticket" in sql


def test_create_aceita_foto_cloudinary(client, fake_requests, monkeypatch):
    monkeypatch.setenv("VITE_CLOUDINARY_CLOUD_NAME", "horytsxg")
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=5)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=6))

    resp = client.post(
        "/api/chamados",
        json=_valid_payload(photos="https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/foto.jpg"),
    )

    assert resp.status_code == 200
    payload = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert payload["photos"].startswith("https://res.cloudinary.com/")

    resp2 = client.post(
        "/api/chamados",
        json=_valid_payload(photos="https://evil.example/x.png"),
    )
    assert resp2.status_code == 400
    assert resp2.get_json()["error"] == "Foto inválida"


def test_patch_aceita_foto_cloudinary(client, fake_requests, monkeypatch):
    monkeypatch.setenv("VITE_CLOUDINARY_CLOUD_NAME", "horytsxg")
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", photos="https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"))

    resp = client.patch(
        "/api/chamados/ticket-1",
        json={"photos": "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg"},
        headers=headers,
    )

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["photos"].startswith("https://res.cloudinary.com/")


def _route_event_insert(fake_requests, event):
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([event]))


def test_events_post_comentario_cria_evento(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_event_insert(fake_requests, {
        "id": "ev-1",
        "ticket_id": "ticket-1",
        "workspace_id": "ws-a",
        "type": "comentario",
        "content": "Testei a sala, cabo solto",
        "author": "Técnico 1",
        "photo_urls": "[]",
        "createdAt": "2026-06-25T12:10:00Z",
    })

    resp = client.post(
        "/api/chamados/ticket-1/events",
        json={"content": "Testei a sala, cabo solto", "author": "Técnico 1"},
        headers=headers,
    )

    assert resp.status_code == 201
    assert resp.get_json()["event"]["content"] == "Testei a sala, cabo solto"
    payload = fake_requests.calls_for("POST", "/rest/v1/ticket_events")[0]["kwargs"]["json"]
    assert payload["ticket_id"] == "ticket-1"
    assert payload["workspace_id"] == "ws-a"
    assert payload["type"] == "comentario"
    assert payload["photo_urls"] == "[]"


def test_events_post_aceita_2_fotos(client, fake_requests, monkeypatch):
    monkeypatch.setenv("VITE_CLOUDINARY_CLOUD_NAME", "horytsxg")
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_event_insert(fake_requests, {"id": "ev-1", "ticket_id": "ticket-1", "photo_urls": "[]", "createdAt": "2026-06-25T12:10:00Z"})

    resp = client.post(
        "/api/chamados/ticket-1/events",
        json={
            "content": "Foto do local",
            "photos": [
                "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/f1.jpg",
                "https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/f2.jpg",
            ],
        },
        headers=headers,
    )

    assert resp.status_code == 201
    payload = fake_requests.calls_for("POST", "/rest/v1/ticket_events")[0]["kwargs"]["json"]
    assert len(json.loads(payload["photo_urls"])) == 2


def test_events_post_rejeita_3_fotos(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.post(
        "/api/chamados/ticket-1/events",
        json={"content": "foto", "photos": ["a", "b", "c"]},
        headers=headers,
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Máximo de 2 fotos por evento"


def test_events_post_foto_invalida_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.post(
        "/api/chamados/ticket-1/events",
        json={"content": "foto", "photos": ["https://evil.example/x.png"]},
        headers=headers,
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Foto inválida"
    assert fake_requests.calls_for("POST", "/rest/v1/ticket_events") == []


def test_events_post_sem_conteudo_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.post("/api/chamados/ticket-1/events", json={"content": "   "}, headers=headers)

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Escreva um comentário ou anexe uma foto"


def test_events_post_ticket_nao_encontrado_404(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, None)

    resp = client.post("/api/chamados/ticket-unknown/events", json={"content": "oi"}, headers=headers)

    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Chamado não encontrado"


def test_events_get_retorna_historico(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket())
    fake_requests.route("GET", "/rest/v1/ticket_events", FakeResponse([
        {
            "id": "ev-2",
            "type": "comentario",
            "content": "Novo comentário",
            "author": "Técnico 1",
            "photo_urls": '["https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/f.jpg"]',
            "createdAt": "2026-06-25T12:20:00Z",
        },
        {
            "id": "ev-1",
            "type": "status",
            "content": "Chamado resolvido",
            "author": "Sistema",
            "photo_urls": "",
            "createdAt": "2026-06-25T12:10:00Z",
        },
    ]))

    resp = client.get("/api/chamados/ticket-1/events", headers=headers)

    assert resp.status_code == 200
    events = resp.get_json()["events"]
    assert len(events) == 2
    assert events[0]["photos"] == ["https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/f.jpg"]
    assert events[1]["photos"] == []


def test_patch_status_resolvido_grava_evento_automatico(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="a_caminho", statusNote="Técnico a caminho"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", statusNote=""))
    _route_event_insert(fake_requests, {"id": "ev-1", "ticket_id": "ticket-1", "createdAt": "2026-06-25T12:10:00Z"})

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido", "statusNote": "Cabo trocado"}, headers=headers)

    assert resp.status_code == 200
    event_calls = fake_requests.calls_for("POST", "/rest/v1/ticket_events")
    assert len(event_calls) == 1
    payload = event_calls[0]["kwargs"]["json"]
    assert payload["type"] == "status"
    assert payload["content"] == "Cabo trocado"
    assert payload["author"] == "Sistema"


def test_patch_mesmo_status_nao_grava_evento(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "aberto"}, headers=headers)

    assert resp.status_code == 200
    assert fake_requests.calls_for("POST", "/rest/v1/ticket_events") == []


def test_purge_sem_token_com_secret_retorna_401(client, api_module, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "super-secret")

    resp = client.post("/api/chamados/photos/purge")

    assert resp.status_code == 401


def test_purge_apaga_fotos_de_chamados_fechados(client, fake_requests, api_module, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "super-secret")
    monkeypatch.setenv("VITE_CLOUDINARY_CLOUD_NAME", "horytsxg")
    monkeypatch.setattr(api_module, "_cloudinary_destroy", lambda url: url.startswith("https://res.cloudinary.com/"))

    old_closed = _make_ticket(
        status="fechado",
        archived=True,
        closedAt="2026-06-20T12:00:00Z",
        photos="https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg",
    )
    fake_requests.route(
        "GET",
        "status=eq.fechado&closedAt=lt.",
        FakeResponse([old_closed]),
    )
    fake_requests.route(
        "GET",
        "/rest/v1/ticket_events?ticket_id=in.",
        FakeResponse([
            {
                "id": "ev-1",
                "photo_urls": '["https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/b.jpg"]',
            },
            {
                "id": "ev-2",
                "photo_urls": '"data:image/jpeg;base64,abc"',
            },
        ]),
    )

    resp = client.post(
        "/api/chamados/photos/purge",
        headers={"Authorization": "Bearer super-secret"},
    )

    assert resp.status_code == 200
    result = resp.get_json()
    assert result["tickets_scanned"] == 1
    assert result["tickets_cleared"] == 1
    assert result["events_cleared"] == 1
    assert result["photos_deleted"] == 2

    ticket_patch = [c for c in fake_requests.calls_for("PATCH", "chamados_tickets") if "photos" in c["kwargs"]["json"]]
    assert len(ticket_patch) == 1
    assert ticket_patch[0]["kwargs"]["json"]["photos"] == ""

    event_patches = fake_requests.calls_for("PATCH", "/rest/v1/ticket_events")
    assert len(event_patches) == 1
    assert json.loads(event_patches[0]["kwargs"]["json"]["photo_urls"]) == []


# --- Fase 4: eventos (historico/comentarios) + fotos Cloudinary ---


# ── Fase 6: POST /api/chamados/push/test (teste de push do usuário logado) ──


def _push_test_fixture(api_module, monkeypatch):
    sent = []
    target_kwargs = []

    def fake_target(**kw):
        target_kwargs.append(kw)
        return [_make_sub()]

    def fake_push(sub, title, body, url="/"):
        sent.append({"title": title, "body": body, "url": url})
        return True

    monkeypatch.setattr(api_module, "_target_subs", fake_target)
    monkeypatch.setattr(api_module, "push_notify", fake_push)
    return sent, target_kwargs


def test_push_test_sem_supabase_retorna_503(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "")
    resp = client.post("/api/chamados/push/test", headers=headers)
    assert resp.status_code == 503


def test_push_test_sem_token_retorna_401(client, fake_requests):
    resp = client.post("/api/chamados/push/test")
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Missing authorization token"


def test_push_test_token_invalido_retorna_401(client, fake_requests, monkeypatch):
    monkeypatch.setattr("auth._verify_jwt", lambda t: None)
    resp = client.post(
        "/api/chamados/push/test",
        headers={"Authorization": f"Bearer {_make_jwt({'sub': 'user-1'})}"},
    )
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Invalid or expired token"


def test_push_test_sem_inscricoes_retorna_aviso(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    monkeypatch.setattr(api_module, "_target_subs", lambda **kw: [])

    resp = client.post("/api/chamados/push/test", headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["sent"] == 0
    assert body["total"] == 0
    assert "Ative as notificações primeiro" in body["message"]


def test_push_test_envia_para_o_proprio_usuario(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    sent, target_kwargs = _push_test_fixture(api_module, monkeypatch)

    resp = client.post("/api/chamados/push/test", headers=headers)

    assert resp.status_code == 200
    assert resp.get_json() == {"sent": 1, "total": 1}
    assert len(sent) == 1
    assert "Teste de notificação" in sent[0]["title"]
    assert sent[0]["url"] == "/chamados"
    # Segmenta pelo usuário logado (sub do JWT) e pelo módulo chamados
    assert target_kwargs and target_kwargs[0]["user_id"] == "user-1"
    assert target_kwargs[0]["module"] == "chamados"


# ── POST /api/chamados/reports/weekly-email (resumo semanal) ──


def test_weekly_email_sem_supabase_retorna_503(client, fake_requests, api_module, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "")
    resp = client.post("/api/chamados/reports/weekly-email", headers=headers)
    assert resp.status_code == 503


def test_weekly_email_sem_token_retorna_401(client, fake_requests):
    resp = client.post("/api/chamados/reports/weekly-email")
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Missing authorization token"


def test_weekly_email_token_invalido_retorna_401(client, fake_requests, monkeypatch):
    monkeypatch.setattr("auth._verify_jwt", lambda t: None)
    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers={"Authorization": f"Bearer {_make_jwt({'sub': 'user-1'})}"},
    )
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Invalid or expired token"


def test_weekly_email_sem_resend_key_retorna_400(client, fake_requests, monkeypatch):
    """Sem RESEND_API_KEY, o endpoint avisa para configurar (não quebra)."""
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route("GET", "chamados_tickets?select=status,priority", FakeResponse([]))
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers=headers,
        json={"to": "admin@escola.com"},
    )

    assert resp.status_code == 400
    assert "RESEND_API_KEY" in resp.get_json()["error"]


def test_weekly_email_sem_destinatario_retorna_400(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route("GET", "chamados_tickets?select=status,priority", FakeResponse([]))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.delenv("REPORT_EMAIL_TO", raising=False)

    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers=headers,
        json={},
    )

    assert resp.status_code == 400
    assert "destinatário" in resp.get_json()["error"]


def test_weekly_email_envia_resumo_e_responde_ok(client, fake_requests, api_module, monkeypatch):
    """Com Resend configurado, o resumo é montado e o email disparado (POST api.resend.com)."""
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route(
        "GET",
        "chamados_tickets?select=status,priority",
        FakeResponse([
            _make_ticket(id="t-1", status="resolvido", roomName="Lab 2", createdAt="2026-06-25T10:00:00Z", resolvedAt="2026-06-25T12:00:00Z"),
            _make_ticket(id="t-2", status="aberto", roomName="Sala 101", createdAt="2026-06-26T10:00:00Z", resolvedAt=None),
        ]),
    )
    fake_requests.route(
        "POST",
        "api.resend.com/emails",
        FakeResponse({"id": "email-1"}, status_code=200, ok=True),
    )
    monkeypatch.setenv("RESEND_API_KEY", "re_test")

    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers=headers,
        json={"to": "admin@escola.com"},
    )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["total"] == 2
    assert body["sent_to"] == "admin@escola.com"

    email_calls = fake_requests.calls_for("POST", "api.resend.com/emails")
    assert len(email_calls) == 1
    email_payload = email_calls[0]["kwargs"]["json"]
    assert email_payload["to"] == ["admin@escola.com"]
    assert "Resumo semanal" in email_payload["subject"]
    assert "Lab 2" in email_payload["html"]
    assert "chamados na semana" in email_payload["html"]
    assert email_calls[0]["kwargs"]["headers"]["Authorization"] == "Bearer re_test"


def test_weekly_email_filtra_por_workspace(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route(
        "GET",
        "chamados_tickets?select=status,priority",
        FakeResponse([]),
    )
    fake_requests.route("GET", "/rest/v1/workspaces", FakeResponse([{"id": "ws-a", "name": "Anhembi"}]))
    fake_requests.route(
        "POST",
        "api.resend.com/emails",
        FakeResponse({"id": "email-1"}, status_code=200, ok=True),
    )
    monkeypatch.setenv("RESEND_API_KEY", "re_test")

    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers=headers,
        json={"to": "admin@escola.com", "workspace_id": "ws-a"},
    )

    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "workspace_id=eq.ws-a" in url
    # Busca o nome do workspace para o cabeçalho do email
    ws_call = fake_requests.calls_for("GET", "/rest/v1/workspaces")
    assert ws_call
    email_calls = fake_requests.calls_for("POST", "api.resend.com/emails")
    assert len(email_calls) == 1
    assert "Anhembi" in email_calls[0]["kwargs"]["json"]["html"]


def test_weekly_email_falha_do_resend_retorna_502(client, fake_requests, monkeypatch):
    headers = _setup_auth(fake_requests, monkeypatch)
    fake_requests.route("GET", "chamados_tickets?select=status,priority", FakeResponse([]))
    fake_requests.route(
        "POST",
        "api.resend.com/emails",
        FakeResponse({"error": "rate limit"}, status_code=429, ok=False, text="rate limit"),
    )
    monkeypatch.setenv("RESEND_API_KEY", "re_test")

    resp = client.post(
        "/api/chamados/reports/weekly-email",
        headers=headers,
        json={"to": "admin@escola.com"},
    )

    assert resp.status_code == 502
    assert "Resend" in resp.get_json()["error"]


# ── require_module (workspace module availability) ──


def test_create_module_disabled_returns_403(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=["chamados"])
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 403
    body = resp.get_json()
    assert body["error"] == "MODULE_DISABLED"
    assert body["module"] == "chamados"
    assert "não está habilitado" in body["message"]
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


def test_create_module_enabled_proceeds(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=[])
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 200
    assert len(fake_requests.calls_for("POST", "chamados_tickets")) == 1


def test_create_module_disabled_null_apps_proceeds(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=None)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 200


def test_create_module_disabled_empty_list_proceeds(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=[])
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 200


def test_create_module_disabled_other_module_proceeds(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=["pc-care", "stock"])
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 200


def test_create_module_disabled_no_ticket_created(client, fake_requests):
    _route_workspace_ok(fake_requests, disabled_apps=["chamados"])
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 403
    assert fake_requests.calls_for("POST", "chamados_tickets") == []
    assert fake_requests.calls_for("GET", "chamados_tickets?select=ticketNumber") == []


# ── Segurança: validação de tamanho de texto ──


def test_create_roomName_excessivo_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", json=_valid_payload(roomName="X" * 101))
    assert resp.status_code == 400
    assert "muito longo" in resp.get_json()["error"]
    assert fake_requests.calls_for("POST", "chamados_tickets") == []


def test_create_reportedBy_excessivo_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", json=_valid_payload(reportedBy="X" * 101))
    assert resp.status_code == 400
    assert "muito longo" in resp.get_json()["error"]


def test_create_problemDescription_excessivo_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", json=_valid_payload(problemDescription="X" * 2001))
    assert resp.status_code == 400
    assert "muito longo" in resp.get_json()["error"]


def test_create_workspace_id_excessivo_retorna_400(client, fake_requests):
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", json=_valid_payload(workspace_id="X" * 51))
    assert resp.status_code == 400
    assert "muito longo" in resp.get_json()["error"]


# ── Segurança: payloads com tipos errados ──


def test_create_priority_numerica_retorna_400(client, fake_requests):
    """Priority deve ser string, não número."""
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", json=_valid_payload(priority=123))
    assert resp.status_code == 400
    assert "Prioridade" in resp.get_json()["error"] or "inválid" in resp.get_json()["error"]


def test_create_body_nao_json_retorna_erro(client, fake_requests):
    """Body que não é JSON deve retornar erro gracefully."""
    _route_workspace_ok(fake_requests)
    resp = client.post("/api/chamados", data="not json", content_type="text/plain")
    assert resp.status_code in (400, 415, 500)


def test_create_workspace_id_vazio_retorna_400(client, fake_requests):
    resp = client.post("/api/chamados", json=_valid_payload(workspace_id=""))
    assert resp.status_code == 400
    assert "campus" in resp.get_json()["error"].lower()


def test_create_problemArea_invalida_retorna_400(client, fake_requests):
    resp = client.post("/api/chamados", json=_valid_payload(problemArea="hacker"))
    assert resp.status_code == 400


# ── Segurança: XSS em campos de texto ──


def test_create_xss_no_roomName_e_valido(client, fake_requests):
    """XSS no roomName não deve quebrar a API (validação de tamanho pegaria se > 100)."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1, roomName="<script>alert(1)</script>"))
    resp = client.post("/api/chamados", json=_valid_payload(roomName="<script>alert(1)</script>"))
    # O XSS não é sanitizado no server-side (o React faz no client), mas não deve quebrar
    assert resp.status_code == 200


def test_create_xss_no_problemDescription_e_valido(client, fake_requests):
    """XSS na descrição não deve quebrar a API."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    xss_payload = '<img src=x onerror=alert(1)>'
    resp = client.post("/api/chamados", json=_valid_payload(problemDescription=xss_payload))
    assert resp.status_code == 200
    # Verifica que o payload enviado ao Supabase contém o XSS (server não sanitiza, o React faz)
    insert_calls = fake_requests.calls_for("POST", "chamados_tickets")
    assert len(insert_calls) == 1
    assert insert_calls[0]["kwargs"]["json"]["problemDescription"] == xss_payload


# ── Segurança: rate limiting ──


def test_rate_limit_nao_bloqueia_requisicoes_normais(client, fake_requests, api_module):
    """Requisições dentro do limite devem funcionar."""
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=0)
    _route_create_insert(fake_requests, _make_ticket(ticketNumber=1))
    # Limpa o rate limit store
    client.application.config.get("TESTING", None)
    api_module._rate_limit_store.clear()
    resp = client.post("/api/chamados", json=_valid_payload())
    assert resp.status_code == 200


def test_rate_limit_limpa_entradas_antigas(client, fake_requests, api_module):
    """Entradas fora da janela de 1h devem ser removidas."""
    import time
    ip = "test-ip"
    api_module._rate_limit_store.clear()
    # Simula requisições antigas (2 horas atrás)
    old_time = time.time() - 7200
    api_module._rate_limit_store[ip] = [old_time] * 25  # Mais que o limite
    # Deve permitir porque as entradas estão fora da janela
    assert api_module._check_rate_limit(ip) is True
    api_module._rate_limit_store.clear()

