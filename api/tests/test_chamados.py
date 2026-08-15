import importlib.util
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"


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


def _route_workspace_ok(fake_requests):
    fake_requests.route(
        "GET",
        "/rest/v1/workspaces",
        FakeResponse([{"id": "ws-a", "name": "Anhembi Piracicaba", "slug": "piracicaba", "location": "Centro"}]),
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


def test_list_retorna_chamados(client, fake_requests):
    _route_list_tickets(fake_requests, [_make_ticket()])
    resp = client.get("/api/chamados")
    assert resp.status_code == 200
    assert resp.get_json()["tickets"][0]["roomName"] == "Sala 101"


def test_list_aplica_filtros_de_workspace_e_status(client, fake_requests):
    _route_list_tickets(fake_requests, [])
    resp = client.get("/api/chamados?workspace_id=ws-a&status=aberto")
    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "workspace_id=eq.ws-a" in url
    assert "status=eq.aberto" in url


def test_list_erro_do_supabase_retorna_502(client, fake_requests):
    fake_requests.route(
        "GET",
        "/rest/v1/chamados_tickets",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.get("/api/chamados")
    assert resp.status_code == 502


def test_list_filtra_por_reporter(client, fake_requests):
    _route_list_tickets(fake_requests, [_make_ticket()])
    resp = client.get("/api/chamados", query_string={"reportedBy": "Maria"})
    assert resp.status_code == 200
    url = fake_requests.calls_for("GET", "chamados_tickets")[0]["url"]
    assert "reportedBy=ilike.*Maria*" in url


# ── GET /api/chamados/<id> ──


def test_get_chamado_por_id(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket())
    resp = client.get("/api/chamados/ticket-1")
    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["id"] == "ticket-1"


def test_get_chamado_nao_encontrado_retorna_404(client, fake_requests):
    _route_get_ticket(fake_requests, None)
    resp = client.get("/api/chamados/ticket-unknown")
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Chamado não encontrado"


def test_get_chamado_erro_do_supabase_retorna_502(client, fake_requests):
    fake_requests.route(
        "GET",
        "chamados_tickets?id=eq.",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.get("/api/chamados/ticket-1")
    assert resp.status_code == 502


# ── PATCH /api/chamados/<id> ──


def test_patch_sem_updates_retorna_400(client):
    resp = client.patch("/api/chamados/ticket-1", json={})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Nada para atualizar"


def test_patch_status_resolvido_define_resolved_at(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", resolvedAt="2026-06-25T12:05:00Z"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"})

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["status"] == "resolvido"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["resolvedAt"]
    assert "updatedAt" in patch_call["kwargs"]["json"]


def test_patch_status_fechado_arquiva_automaticamente(client, fake_requests):
    _route_patch_ticket(
        fake_requests,
        _make_ticket(
            status="fechado",
            archived=True,
            closedAt="2026-06-25T13:00:00Z",
            closedBy="Técnico 1",
        ),
    )

    resp = client.patch("/api/chamados/ticket-1", json={"status": "fechado", "closedBy": "Técnico 1"})

    assert resp.status_code == 200
    ticket = resp.get_json()["ticket"]
    assert ticket["status"] == "fechado"
    assert ticket["archived"] is True
    assert ticket["closedBy"] == "Técnico 1"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["archived"] is True
    assert patch_call["kwargs"]["json"]["closedAt"]
    assert "updatedAt" in patch_call["kwargs"]["json"]


def test_patch_reabertura_limpa_arquivamento(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", archived=False, closedAt=None))

    resp = client.patch(
        "/api/chamados/ticket-1",
        json={"status": "aberto", "archived": False, "closedAt": None},
    )

    assert resp.status_code == 200
    ticket = resp.get_json()["ticket"]
    assert ticket["status"] == "aberto"
    assert ticket["archived"] is False
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["archived"] is False
    assert patch_call["kwargs"]["json"]["closedAt"] is None


def test_patch_reabertura_de_fechado_limpa_resolved_at(client, fake_requests):
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

    resp = client.patch("/api/chamados/ticket-1", json={"status": "aberto"})

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["resolvedAt"] is None
    assert patch["closedAt"] is None
    assert patch["closedBy"] == ""
    assert patch["archived"] is False


def test_patch_status_invalido_retorna_400(client, fake_requests):
    resp = client.patch("/api/chamados/ticket-1", json={"status": "foo"})

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Status inválido"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_patch_status_note_persiste(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="a_caminho", statusNote="Em outro chamado, atendimento em 5 minutos"))

    resp = client.patch("/api/chamados/ticket-1", json={"statusNote": "Em outro chamado, atendimento em 5 minutos"})

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["statusNote"] == "Em outro chamado, atendimento em 5 minutos"
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["statusNote"] == "Em outro chamado, atendimento em 5 minutos"


def test_patch_resolvido_limpa_status_note(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="a_caminho", statusNote="Técnico a caminho"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", statusNote=""))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "resolvido"})

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["statusNote"] == ""


def test_patch_ignora_campos_nao_permitidos(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="em_atendimento"))

    resp = client.patch("/api/chamados/ticket-1", json={"status": "em_atendimento", "roomName": "Hackeado"})

    assert resp.status_code == 200
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert "roomName" not in patch_call["kwargs"]["json"]


def test_patch_prioridade_valida_eh_aplicada(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto", priority="urgente"))

    resp = client.patch("/api/chamados/ticket-1", json={"priority": "urgente"})

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["priority"] == "urgente"
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    assert patch_call["kwargs"]["json"]["priority"] == "urgente"


def test_patch_prioridade_invalida_retorna_400(client, fake_requests):
    _route_patch_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.patch("/api/chamados/ticket-1", json={"priority": "x"})

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Prioridade inválida"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_patch_chamado_nao_encontrado_retorna_404(client, fake_requests):
    _route_patch_ticket(fake_requests, None)
    resp = client.patch("/api/chamados/ticket-unknown", json={"status": "resolvido"})
    assert resp.status_code == 404


# ── DELETE /api/chamados/<id> ──


def test_delete_chamado(client, fake_requests):
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, ok=True))
    resp = client.delete("/api/chamados/ticket-1")
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True


def test_delete_falha_retorna_502(client, fake_requests):
    fake_requests.route("DELETE", "chamados_tickets", FakeResponse({}, status_code=500, ok=False))
    resp = client.delete("/api/chamados/ticket-1")
    assert resp.status_code == 502


# ── POST /api/chamados/<id>/feedback ──


def test_feedback_registra_nota_e_comentario(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="resolvido", resolvedAt="2026-06-25T12:05:00Z"))
    _route_patch_ticket(
        fake_requests,
        _make_ticket(status="resolvido", feedbackRating=5, feedbackComment="Ótimo atendimento"),
    )

    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 5, "comment": "  Ótimo atendimento  "})

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["feedbackRating"] == 5
    patch_call = fake_requests.calls_for("PATCH", "chamados_tickets")[0]
    patch = patch_call["kwargs"]["json"]
    assert patch["feedbackRating"] == 5
    assert patch["feedbackComment"] == "Ótimo atendimento"
    assert patch["feedbackAt"]


def test_feedback_sem_comentario_envia_vazio(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="resolvido"))
    _route_patch_ticket(fake_requests, _make_ticket(status="resolvido", feedbackRating=4))

    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 4})

    assert resp.status_code == 200
    patch = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert patch["feedbackComment"] == ""


def test_feedback_nota_invalida_retorna_400(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="resolvido"))

    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 9})

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Nota inválida (1 a 5)"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_feedback_chamado_aberto_retorna_400(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="aberto"))

    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 5})

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Só é possível avaliar após a resolução do chamado"


def test_feedback_chamado_ja_avaliado_retorna_400(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="fechado", feedbackRating=3))

    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 5})

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Chamado já avaliado"


def test_feedback_chamado_inexistente_retorna_404(client, fake_requests):
    _route_get_ticket(fake_requests, None)
    resp = client.post("/api/chamados/ticket-unknown/feedback", json={"rating": 5})
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Chamado não encontrado"


def test_feedback_falha_ao_persistir_retorna_502(client, fake_requests):
    _route_get_ticket(fake_requests, _make_ticket(status="resolvido"))
    fake_requests.route(
        "PATCH",
        "chamados_tickets",
        FakeResponse({"error": "x"}, status_code=500, ok=False),
    )
    resp = client.post("/api/chamados/ticket-1/feedback", json={"rating": 5})
    assert resp.status_code == 502
