"""Chamados — hardening de Actions em fechamento, reabertura, listagem e relatório.

Testes regressivos dos gaps de enforcement fechados em `api/app.py`:

Fechamento/reabertura (PATCH `<ticket_id>`):
  - `status → fechado` exige `ticket.close`; `ticket.status` NÃO basta (403).
  - `status → fechado` com `ticket.close` é permitido (200).
  - `fechado → estado ativo` e `resolvido → estado ativo` exigem `ticket.reopen`;
    apenas `ticket.status` não reabre (403).
  - Mudança de status comum (`aberto → em_atendimento`) continua exigindo
    `ticket.status`.

Campos derivados:
  - `archived`/`closedAt`/`closedBy` no payload não arquivam o chamado com apenas
    `ticket.edit` (403) e nada é gravado.

Listagem e relatório:
  - `GET /api/chamados` exige `ticket.view`; membership isolada não basta (403).
  - `GET /api/chamados/reports` exige `ticket.report`; membership isolada não
    basta (403).

Atomicidade do PATCH misto:
  - `status + atribuição` sem `ticket.assign` ⇒ 403 e NENHUMA mutation.
  - `fechamento + atribuição` sem `ticket.assign` ⇒ 403 e NENHUMA mutation.
  - `status + edição` sem `ticket.edit` ⇒ 403 e NENHUMA mutation.

Todos os cenários concedem um conjunto MÍNIMO de Actions (fail-closed), de modo
que qualquer aprovação indevida seja atribuível a um gap específico.
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


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url(json.dumps({"exp": int(time.time()) + 3600, **payload}).encode())
    signing_input = f"{header}.{body}".encode()
    sig = _b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.routes = []
        self.calls = []

    def route(self, method, url_part, response):
        self.routes.append((method, url_part, response))

    def unroute(self, method, url_part):
        self.routes = [r for r in self.routes if not (r[0] == method and url_part in r[1])]

    def calls_for(self, method, url_part):
        """Chamadas já realizadas com o método e o trecho de URL informados.

        Permite afirmar ausência de escrita: se o endpoint autorizou indevidamente
        e gravou, a chamada aparece aqui mesmo com a rota mockada.
        """
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]

    def _match(self, method, url, kwargs):
        # O módulo `auth` envia filtros via `params=`; normaliza a URL de
        # roteamento para que a chave include os query params ordenados.
        params = kwargs.get("params")
        if params:
            qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
            url = f"{url}?{qs}"
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for m, part, resp in self.routes:
            if m == method and part in url:
                return resp
        raise AssertionError(f"sem rota mockada: {method} {url}")

    def get(self, url, **kwargs):
        return self._match("GET", url, kwargs)

    def post(self, url, **kwargs):
        return self._match("POST", url, kwargs)

    def patch(self, url, **kwargs):
        return self._match("PATCH", url, kwargs)

    def delete(self, url, **kwargs):
        return self._match("DELETE", url, kwargs)


@pytest.fixture(scope="session")
def api_module():
    """Carrega `api/app.py` reutilizando qualquer instância já em sys.modules.

    Mesma estratégia de test_workspace_isolation.py: reexecutar o módulo depois
    da primeira requisição falha no Flask (`_check_setup_finished`). A busca é
    por `__file__` resolvido, e não por nome, para não depender da ordem de
    coleta nem do rótulo usado por outro arquivo.
    """
    target = API_FILE.resolve()
    for name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_hardening_api"
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
    monkeypatch.setattr(api_module, "_target_subs", lambda **k: [])
    monkeypatch.setattr(api_module, "push_notify", lambda *a, **k: True)
    monkeypatch.setattr(api_module, "_cloudinary_destroy", lambda url: True)
    for name in ("auth", "rbac"):
        mod = sys.modules.get(name)
        if mod is not None:
            monkeypatch.setattr(mod, "requests", fake_requests)
            monkeypatch.setattr(mod, "_SUPABASE_URL", SUPABASE_URL)
            monkeypatch.setattr(mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    # _ensure_chamados_schema é best-effort (swallow de exceções); mock para que
    # a ordem dos testes não afete o log nem a_latência.
    fake_requests.route("POST", "/rest/v1/rpc/pg_sql", FakeResponse([], status_code=200))
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


# ── helpers ──────────────────────────────────────────────────────────────────

TECH = {
    "id": "tech-1",
    "email": "tech@test.com",
    "name": "Tecnico",
    "role": "technician",
    "is_super_admin": False,
    "workspace_ids": ["ws-a"],
    "status": "active",
}


def _auth_as(api_module, fake_requests, monkeypatch, profile, actions):
    """Autentica como `profile` concedendo EXATAMENTE o conjunto `actions`.

    `rbac_two_can` é substituído por um resolvidor fail-closed, reproduzindo o
    efeito de memberships + role_permissions + overrides reais.
    """
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile]))
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([
        {"profile_id": profile["id"], "workspace_id": w, "status": "active"}
        for w in (profile.get("workspace_ids") or [])
    ]))
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a: str(a[2]) in actions)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _ticket(**overrides):
    t = {
        "id": "t-1",
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "status": "aberto",
        "assignedTo": "",
        "assignedToUserId": "",
        "ticketNumber": 6,
        "problemDescription": "Sem conexao",
        "archived": False,
        "closedAt": None,
        "closedBy": "",
    }
    t.update(overrides)
    return t


def _route_ticket(fake_requests, ticket):
    part = f"chamados_tickets?id=eq.{ticket['id']}"
    fake_requests.unroute("GET", part)
    fake_requests.route("GET", part, FakeResponse([ticket]))


def _route_write(fake_requests, updated=None):
    """Roteia o PATCH final e as escritas auxiliares (evento/auditoria)."""
    fake_requests.route("PATCH", "chamados_tickets?id=eq.",
                        FakeResponse([updated] if updated else []))
    fake_requests.route("POST", "/rest/v1/ticket_events",
                        FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse([], status_code=204))


# ── 1. FECHAMENTO: ticket.close ──────────────────────────────────────────────

def test_fechar_com_apenas_ticket_status_negado(api_module, client, fake_requests, monkeypatch):
    """`ticket.status` NÃO fecha chamado: a transição exige `ticket.close`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests)

    resp = client.patch("/api/chamados/t-1", json={"status": "fechado"}, headers=headers)

    assert resp.status_code == 403


def test_fechar_com_ticket_close_permitido(api_module, client, fake_requests, monkeypatch):
    """Com `ticket.close`, o fechamento é aceito e arquiva o chamado."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.close"})
    before = _ticket(status="em_atendimento")
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, dict(before, status="fechado", archived=True))

    resp = client.patch("/api/chamados/t-1", json={"status": "fechado"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["ticket"]["archived"] is True


def test_mudanca_de_status_comum_exige_ticket_status(api_module, client, fake_requests, monkeypatch):
    """Transição sem fechamento/reabertura continua exigindo `ticket.status`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    before = _ticket(status="aberto")
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, dict(before, status="em_atendimento"))

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 200


# ── 2. REABERTURA: ticket.reopen ──────────────────────────────────────────────

@pytest.mark.parametrize("status_atual", ["fechado", "resolvido"])
def test_reabrir_com_apenas_ticket_status_negado(api_module, client, fake_requests,
                                                 monkeypatch, status_atual):
    """`fechado|resolvido → ativo` exige `ticket.reopen`; `ticket.status` não basta."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status=status_atual))
    _route_write(fake_requests)

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 403


@pytest.mark.parametrize("status_atual", ["fechado", "resolvido"])
def test_reabrir_com_ticket_reopen_permitido(api_module, client, fake_requests,
                                             monkeypatch, status_atual):
    """Com `ticket.reopen`, a reabertura limpa as marcas de conclusão."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.reopen"})
    before = _ticket(status=status_atual, archived=True, closedAt="2026-01-01T00:00:00Z")
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, dict(before, status="em_atendimento", archived=False,
                                     closedAt=None))

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()["ticket"]
    assert body["archived"] is False
    assert body["closedAt"] is None


# ── 3. FECHAMENTO POR CAMPO DERIVADO ─────────────────────────────────────────

@pytest.mark.parametrize("campo", ["archived", "closedAt", "closedBy"])
def test_campo_derivado_com_apenas_ticket_edit_negado(api_module, client, fake_requests,
                                                     monkeypatch, campo):
    """`ticket.edit` não arquiva/fecha por campo derivado: exige `ticket.close`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.edit"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests)

    payload = {"archived": True, "closedAt": "2026-01-01T00:00:00Z", "closedBy": "X"}
    resp = client.patch("/api/chamados/t-1", json={campo: payload[campo]}, headers=headers)

    assert resp.status_code == 403


def test_payload_completo_de_derivados_negado_e_nada_gravado(api_module, client,
                                                             fake_requests, monkeypatch):
    """Payload com archived+closedAt+closedBy ⇒ 403 e nenhuma mutation."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.edit"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests, _ticket(status="aberto", archived=True))

    resp = client.patch("/api/chamados/t-1", json={
        "archived": True,
        "closedAt": "2026-01-01T00:00:00Z",
        "closedBy": "Intruso",
    }, headers=headers)

    assert resp.status_code == 403
    # `ticket.edit` não arquiva: nenhuma escrita saiu, apesar de a rota estar
    # mockada — se o backend gravasse, a chamada apareceria aqui.
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


# ── 4. LISTAGEM: ticket.view ─────────────────────────────────────────────────

def test_listagem_sem_ticket_view_negada(api_module, client, fake_requests, monkeypatch):
    """Membership no workspace sem `ticket.view` ⇒ 403 na listagem."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, set())

    resp = client.get("/api/chamados", headers=headers)

    assert resp.status_code == 403


def test_listagem_com_ticket_view_permitida(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.view"})
    fake_requests.route("GET", "/rest/v1/chamados_tickets?select=", FakeResponse([]))

    resp = client.get("/api/chamados", headers=headers)

    assert resp.status_code == 200


def test_listagem_filtro_explicito_exige_ticket_view_no_workspace(api_module, client,
                                                                 fake_requests, monkeypatch):
    """Filtro por workspace também é protegido: com a Action, a lista responde."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.view"})
    fake_requests.route("GET", "/rest/v1/chamados_tickets?select=", FakeResponse([]))

    resp = client.get("/api/chamados?workspace_id=ws-a", headers=headers)

    assert resp.status_code == 200


def test_listagem_filtro_explicito_sem_ticket_view_negado(api_module, client, fake_requests,
                                                         monkeypatch):
    """Mesmo no próprio workspace, sem `ticket.view` o filtro explícito nega."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, set())

    resp = client.get("/api/chamados?workspace_id=ws-a", headers=headers)

    assert resp.status_code == 403


# ── 5. RELATÓRIOS: ticket.report ──────────────────────────────────────────────

def test_relatorio_sem_ticket_report_negado(api_module, client, fake_requests, monkeypatch):
    """Membership no workspace sem `ticket.report` ⇒ 403 no relatório."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, set())

    resp = client.get("/api/chamados/reports", headers=headers)

    assert resp.status_code == 403


def test_relatorio_com_ticket_report_permitido(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.report"})
    fake_requests.route("GET", "/rest/v1/chamados_tickets?select=", FakeResponse([]))

    resp = client.get("/api/chamados/reports", headers=headers)

    assert resp.status_code == 200


# ── 6. ATOMICIDADE DO PATCH MISTO ────────────────────────────────────────────

def test_status_mais_atribuicao_sem_assign_nao_grava(api_module, client, fake_requests,
                                                     monkeypatch):
    """status + atribuição: sem `ticket.assign` ⇒ 403 e nenhuma mutation."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests, _ticket(status="a_caminho", assignedToUserId="outro"))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_atendimento",
        "assignedToUserId": "outro",
    }, headers=headers)

    assert resp.status_code == 403
    # Atomicidade: a negação da Action de atribuição impede QUALQUER escrita.
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_fechamento_mais_atribuicao_sem_assign_nao_grava(api_module, client, fake_requests,
                                                         monkeypatch):
    """fechamento + atribuição: `ticket.close` sozinho não basta ⇒ 403."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.close"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests, _ticket(status="fechado", archived=True))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "fechado",
        "assignedToUserId": "outro",
    }, headers=headers)

    assert resp.status_code == 403
    # Nem o fechamento nem a atribuição foram gravados: uma Action negada
    # invalida o request inteiro.
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_status_mais_edicao_sem_edit_nao_grava(api_module, client, fake_requests, monkeypatch):
    """status + edição: sem `ticket.edit` ⇒ 403 e nenhuma mutation."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests, _ticket(status="em_atendimento", priority="alta"))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_atendimento",
        "priority": "alta",
    }, headers=headers)

    assert resp.status_code == 403
    # A edição negada não pode ter aplicado a mudança de status junto.
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_patch_misto_completo_permitido(api_module, client, fake_requests, monkeypatch):
    """Com as três Actions, o PATCH misto é aplicado normalmente."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH,
                       {"ticket.status", "ticket.assign", "ticket.edit"})
    before = _ticket(status="aberto")
    _route_ticket(fake_requests, before)
    # Perfil do assignee — fonte canônica do nome gravado no servidor.
    fake_requests.route("GET", "profiles?id=eq.tec-2&select=name", FakeResponse([{"name": "Técnico 2"}]))
    _route_write(fake_requests, dict(before, status="em_atendimento",
                                     priority="alta", assignedToUserId="tec-2"))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_atendimento",
        "priority": "alta",
        "assignedToUserId": "tec-2",
    }, headers=headers)

    assert resp.status_code == 200
    # Controle: prova que o gravador de chamadas FUNCIONA. Sem esta afirmação,
    # as verificações `calls_for(...) == []` dos casos de negação poderiam passar
    # por vacuidade (nunca registrando nada).
    assert len(fake_requests.calls_for("PATCH", "chamados_tickets")) == 1