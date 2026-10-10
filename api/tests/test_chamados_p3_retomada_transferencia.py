"""Chamados — P3 (issue #371): retomada e transferência atômicas.

Fluxos adicionados na P3 (Etapa 1):

Retomada (`POST /api/chamados/<id>/resume`)
  - Exceção ESTRITA ao ownership: qualquer técnico autenticado com membership
    ativa + Action `ticket.status` no workspace pode retomar um chamado
    `em_espera` — mesmo atribuído a outro técnico. A fila não pode ficar
    travada pela disponibilidade do responsável anterior. `em_espera →`
    `em_atendimento` é a ÚNICA transição da rota (400 em qualquer outro estado).
  - NÃO libera o ownership nas demais rotas (PR #373): comentar/editar/mudar
    status/assumir chamado de outro técnico seguem exigindo responsável,
    assigner ou super admin. `chamados_claim` continua rejeitando `em_espera`.
  - Assunção ATÔMICA: PATCH ÚNICO condicional com `status=eq.em_espera`. Dois
    técnicos retomam ao mesmo tempo → o vencedor recebe 200; o perdedor, 409
    SEM evento, auditoria do app ou notificação (escritas só após o PATCH
    vencedor). Acionou a Action `ticket.status` → exigida, senão 403.
  - Identidade inteiramente do JWT/servidor (autor = `g.user`); nenhum dado de
    responsável vem do corpo.

Transferência (`POST /api/chamados/<id>/transfer`)
  - Somente durante atendimento ATIVO (`a_caminho`/`em_atendimento`; 400 fora).
  - Ator permitido: o RESPONSÁVEL ATUAL (ownership) OU o assigner
    (`ticket.assign`, RBAC). Técnico comum NÃO ganha `ticket.assign`:
    transferir o chamado de OUTRO técnico exige o assigner (403).
  - Destinatário deve ser membro ATIVO do workspace DO CHAMADO (400 caso não
    seja — nunca o workspace ativo do assigner) e diferente do atual (400).
    O nome gravado é o canônico do PERFIL do ID validado.
  - Transferência ATÔMICA: PATCH ÚNICO condicional com guarda no status
    ANTERIOR e no responsável ANTERIOR (id + nome, preservando NULL vs '').
    0 linhas → 409 SEM evento/auditoria/notificação.

Sobre concorrência neste arquivo: os testes simulam corrida com
`SequenceResponse`/FakeResponse (SEM threads reais nem banco real). Eles provam
a SEMÂNTICA da escrita condicional — a guarda correta vai embutida NA MESMA
escrita que grava, e 0 linhas é tratado como conflito sem falso positivo de
sucesso. NÃO é uma prova de atomicidade de banco de verdade; isso foi/é
validado em staging (padrão `atomic_e2e.py`).

Reuso de contrato: tipos de evento são os MESMOS da P1/P2 (`status` na retomada,
`atribuicao` na transferência) — nenhum tipo novo. `app_audit_logs` ganha
`action='resume'|'transfer'` com meta de antes/depois.
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

WS_A = "ws-campus-a"
WS_B = "ws-campus-b"

TECH_A = {"id": "user-tech-a", "email": "a@test.com", "name": "Técnico A",
          "role": "technician", "is_super_admin": False, "workspace_ids": [WS_A], "status": "active"}
TECH_B = {"id": "user-tech-b", "email": "b@test.com", "name": "Técnico B",
          "role": "technician", "is_super_admin": False, "workspace_ids": [WS_A], "status": "active"}
TECH_C = {"id": "user-tech-c", "email": "c@test.com", "name": "Técnico C",
          "role": "technician", "is_super_admin": False, "workspace_ids": [WS_A], "status": "active"}
ASSIGNER = {"id": "user-assigner", "email": "lider@test.com", "name": "Coordenadora",
            "role": "lider", "is_super_admin": False, "workspace_ids": [WS_A], "status": "active"}
OUTSIDER = {"id": "user-outside", "email": "o@test.com", "name": "Forasteiro",
            "role": "technician", "is_super_admin": False, "workspace_ids": [WS_B], "status": "active"}


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


class SequenceResponse:
    """Reposta com estado: cada `json()` devolve o próximo payload.

    Simula a escrita condicional do banco: a 1ª chamada "vence" (devolve a
    linha), as seguintes devolvem [] (a condição não casa mais).
    """

    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.status_code = 200
        self.ok = True
        self.text = ""

    def json(self):
        return self._payloads.pop(0) if self._payloads else []


class FakeRequests:
    """Mesmo harness de test_chamados_espera_indeferido_367.py.

    Falha pré-escrita (assert) se nenhuma rota casar: uma chamada inesperada
    derruba o teste em vez de retornar sucesso falso.
    """

    def __init__(self):
        self.routes = []
        self.calls = []

    def route(self, method, url_part, response):
        self.routes.append((method, url_part, response))

    def unroute(self, method, url_part):
        self.routes = [r for r in self.routes if not (r[0] == method and url_part in r[1])]

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]

    def _match(self, method, url, kwargs):
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
    target = API_FILE.resolve()
    for name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_p3_retomada_transferencia_api"
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
    # Autorização audita o allow/deny em toda chamada a `_require_action_in_handler`.
    fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse([], status_code=204))
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


# ── helpers ──────────────────────────────────────────────────────────────────

def _auth_as(api_module, fake_requests, monkeypatch, profile, actions):
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile]))
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile['id']}",
        FakeResponse([
            {"profile_id": profile["id"], "workspace_id": w, "status": "active"}
            for w in (profile.get("workspace_ids") or [])
        ]),
    )
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a: str(a[2]) in actions)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _ticket(**overrides):
    t = {
        "id": "t-1",
        "workspace_id": WS_A,
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemDescription": "Sem conexão",
        "status": "em_atendimento",
        "assignedTo": "Técnico B",
        "assignedToUserId": TECH_B["id"],
        "ticketNumber": 42,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "resolvedAt": None,
        "statusNote": "",
        "reasonCode": "WAITING_EQUIPMENT",
        "reasonLabel": "Aguardando equipamento/peça",
        "reasonNote": "Aguardando chegada da fonte reserva",
        "photos": "",
    }
    t.update(overrides)
    return t


def _route_ticket(fake_requests, ticket):
    part = f"chamados_tickets?id=eq.{ticket['id']}"
    fake_requests.unroute("GET", part)
    fake_requests.route("GET", part, FakeResponse([ticket]))


def _route_write(fake_requests, updated=None):
    """Roteia o PATCH condicional final e as escritas auxiliares de sucesso."""
    fake_requests.route(
        "PATCH",
        "chamados_tickets?id=eq.",
        FakeResponse([updated] if updated else []),
    )
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse([], status_code=204))


def _route_assignee_membership(fake_requests, profile_id, ws=WS_A, ok=True):
    payload = (
        [{"id": "m-x", "profile_id": profile_id, "workspace_id": ws, "status": "active"}]
        if ok else []
    )
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile_id}&workspace_id=eq.{ws}&status=eq.active",
        FakeResponse(payload),
    )


def _route_assignee_profile(fake_requests, profile_id, name):
    fake_requests.route(
        "GET",
        f"profiles?id=eq.{profile_id}&select=name",
        FakeResponse([{"name": name}]),
    )


# ═══════════════════════════════════════════════════════════════════════════
# RETOMADA
# ═══════════════════════════════════════════════════════════════════════════

def test_resume_em_espera_by_other_tech_ok_200_becomes_owner(
        api_module, client, fake_requests, monkeypatch):
    """Qualquer técnico com `ticket.status` retoma chamado `em_espera` de outro
    técnico: vira responsável, status → em_atendimento, com evento + auditoria.

    Exceção ESTRITA ao ownership: TECH_A NÃO é o responsável (é TECH_B), mas a
    retomada é permitida — o PATCH é consequência da roda dedicada, não do PATCH
    genérico de status.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    before = _ticket(status="em_espera")
    updated = dict(before, status="em_atendimento",
                   assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, updated)

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()["ticket"]
    assert body["status"] == "em_atendimento"
    assert body["assignedToUserId"] == TECH_A["id"]
    assert body["assignedTo"] == "Técnico A"

    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    url = patches[0]["url"]
    assert "status=eq.em_espera" in url, (
        "Guarda atômica: PATCH só alcança linha ainda em em_espera"
    )
    payload = patches[0]["kwargs"]["json"]
    assert payload["status"] == "em_atendimento"
    assert payload["assignedToUserId"] == TECH_A["id"]
    assert payload["assignedTo"] == "Técnico A"
    assert "reasonCode" not in payload, "Retomada não sobrescreve o motivo anterior"

    eventos = fake_requests.calls_for("POST", "ticket_events")
    assert len(eventos) == 1
    assert eventos[0]["kwargs"]["json"]["type"] == "status"
    assert "retomou" in eventos[0]["kwargs"]["json"]["content"]

    audits = fake_requests.calls_for("POST", "app_audit_logs")
    assert len(audits) == 1
    meta = audits[0]["kwargs"]["json"]["meta"]
    assert audits[0]["kwargs"]["json"]["action"] == "resume"
    assert meta["prev_owner"] == TECH_B["id"]
    assert meta["new_owner"] == TECH_A["id"]


def test_resume_requires_ticket_status_403_no_write(
        api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, set())
    _route_ticket(fake_requests, _ticket(status="em_espera"))
    _route_write(fake_requests, _ticket(status="em_atendimento"))

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 403, resp.get_json()
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []
    assert fake_requests.calls_for("POST", "ticket_events") == []


def test_resume_only_for_em_espera_400(
        api_module, client, fake_requests, monkeypatch):
    for status in ["aberto", "a_caminho", "em_atendimento", "resolvido", "fechado", "indeferido"]:
        headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
        _route_ticket(fake_requests, _ticket(status=status))
        _route_write(fake_requests, _ticket(status="em_atendimento"))

        resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

        assert resp.status_code == 400, (status, resp.get_json())
        assert "espera" in resp.get_json()["error"]
        assert fake_requests.calls_for("PATCH", "chamados_tickets") == []
        fake_requests.unroute("GET", "chamados_tickets?id=eq.t-1")


def test_resume_ticket_not_found_404(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(id="outra-uuid"))
    fake_requests.unroute("GET", "chamados_tickets?id=eq.t-1")
    fake_requests.route("GET", "chamados_tickets?id=eq.t-1", FakeResponse([]))

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 404, resp.get_json()


def test_resume_outsider_403(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, OUTSIDER, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_espera"))

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 403, resp.get_json()
    assert "Acesso negado" in resp.get_json()["error"]
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_resume_conflict_409_no_events_no_audit_no_notify(
        api_module, client, fake_requests, monkeypatch):
    """Corrida: dois técnicos retomam ao mesmo tempo.

    O perdedor vê `em_espera` na leitura, mas o PATCH condicional devolve 0
    linhas (outro já venceu) → 409. NENHUM efeito colateral: sem evento de
    histórico, sem auditoria do app e sem push. Só a auditoria de autorização
    (`rbac_audit_logs`, inerente a `_require_action_in_handler`) é escrita.
    """
    subs = []
    def _spy_target_subs(**kwargs):
        subs.append(kwargs)
        return []
    monkeypatch.setattr(api_module, "_target_subs", _spy_target_subs)

    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_espera"))
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 409, resp.get_json()
    assert "retomou" in resp.get_json()["error"]
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert "status=eq.em_espera" in patches[0]["url"]
    assert fake_requests.calls_for("POST", "ticket_events") == []
    assert fake_requests.calls_for("POST", "app_audit_logs") == []
    assert subs == [], "Notificação não pode existir após 409 (escritas só pós-PATCH)"


def test_resume_concurrent_first_wins_second_409(
        api_module, client, fake_requests, monkeypatch):
    """Semântica da escrita condicional: dois PATCHes, um vence.

    (Sem threads reais — `SequenceResponse` simula o banco. Processar 200/409
    corretamente é a propriedade garantida por este teste; validar a atomicidade
    de banco de verdade é tarefa de staging, padrão `atomic_e2e.py`.)
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    before = _ticket(status="em_espera")
    updated = dict(before, status="em_atendimento",
                   assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    fake_requests.route(
        "PATCH",
        "chamados_tickets?id=eq.",
        SequenceResponse([[updated], []]),
    )
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse([], status_code=204))

    first = client.post("/api/chamados/t-1/resume", json={}, headers=headers)
    second = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert first.status_code == 200, first.get_json()
    assert second.status_code == 409, second.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 2
    for call in patches:
        assert "status=eq.em_espera" in call["url"]
    # Só o vencedor gera evento e auditoria do app.
    assert len(fake_requests.calls_for("POST", "ticket_events")) == 1
    assert len(fake_requests.calls_for("POST", "app_audit_logs")) == 1


def test_resume_em_espera_no_owner_to_owner(
        api_module, client, fake_requests, monkeypatch):
    """Retomada de chamado `em_espera` SEM responsável também é suportada —
    o antigo vazio vira o novo responsável na mesma condicional por status."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    before = _ticket(status="em_espera", assignedTo="", assignedToUserId="")
    updated = dict(before, status="em_atendimento",
                   assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, updated)

    resp = client.post("/api/chamados/t-1/resume", json={}, headers=headers)

    assert resp.status_code == 200, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert "status=eq.em_espera" in patches[0]["url"]
    payload = patches[0]["kwargs"]["json"]
    assert payload["assignedToUserId"] == TECH_A["id"]


# ═══════════════════════════════════════════════════════════════════════════
# TRANSFERÊNCIA
# ═══════════════════════════════════════════════════════════════════════════

def test_transfer_by_current_owner_ok_200(
        api_module, client, fake_requests, monkeypatch):
    """Responsável ATUAL transfere para outro técnico ATIVO do workspace.

    Ator = TECH_B (owner de TECH_B no chamado). NENHUM `ticket.assign` exigido:
    é a exceção de ownership. Guardas condicionais (status + responsável id+nome)
    vão na MESMA escrita; evento `atribuicao` + auditoria `transfer` gravados.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    before = _ticket(status="em_atendimento")
    updated = dict(before, assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_assignee_membership(fake_requests, TECH_A["id"])
    _route_assignee_profile(fake_requests, TECH_A["id"], "Técnico A")
    _route_write(fake_requests, updated)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"]},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()["ticket"]
    assert body["assignedToUserId"] == TECH_A["id"]
    assert body["assignedTo"] == "Técnico A"

    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    url = patches[0]["url"]
    assert "status=eq.em_atendimento" in url, "Guarda de status presente"
    assert f"assignedToUserId=eq.{TECH_B['id']}" in url, (
        "Guarda casa com o responsável lido antes"
    )
    assert "assignedTo=eq." in url, "Guarda de nome presente"
    payload = patches[0]["kwargs"]["json"]
    assert payload["assignedToUserId"] == TECH_A["id"]
    assert payload["assignedTo"] == "Técnico A", "Nome canônico do PERFIL validado"

    eventos = fake_requests.calls_for("POST", "ticket_events")
    assert len(eventos) == 1
    assert eventos[0]["kwargs"]["json"]["type"] == "atribuicao", (
        "Sem tipo novo — reuso do tipo `atribuicao` do histórico"
    )

    audits = fake_requests.calls_for("POST", "app_audit_logs")
    assert len(audits) == 1
    audit = audits[0]["kwargs"]["json"]
    assert audit["action"] == "transfer"
    meta = audit["meta"]
    assert meta["prev_owner"] == TECH_B["id"]
    assert meta["new_owner"] == TECH_A["id"]
    assert meta["transferor_id"] == TECH_B["id"]
    # Caminho de ownership NÃO requereu Action: nenhum audit trail ticket.assign.
    assert len(fake_requests.calls_for("POST", "rbac_audit_logs")) == 0


def test_transfer_by_assigner_of_other_ticket_ok_200(
        api_module, client, fake_requests, monkeypatch):
    """Assigner (Action `ticket.assign`) transfere um chamado que NÃO é dele."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, ASSIGNER, {"ticket.assign"})
    before = _ticket(status="a_caminho")
    updated = dict(before, status="a_caminho", assignedToUserId=TECH_C["id"], assignedTo="Técnico C")
    _route_ticket(fake_requests, before)
    _route_assignee_membership(fake_requests, TECH_C["id"])
    _route_assignee_profile(fake_requests, TECH_C["id"], "Técnico C")
    _route_write(fake_requests, updated)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_C["id"]},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    url = patches[0]["url"]
    assert "status=eq.a_caminho" in url
    assert f"assignedToUserId=eq.{TECH_B['id']}" in url
    # Via assign: audit trail ticket.assign registrado além do allow do handler.
    assert len(fake_requests.calls_for("POST", "rbac_audit_logs")) >= 1


def test_transfer_not_owner_without_assign_403(
        api_module, client, fake_requests, monkeypatch):
    """Técnico comum NÃO ganhou `ticket.assign`: transferir chamado de OUTRO
    técnico é proibido (403) — ownership das demais rotas intacto."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_A, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_C["id"]},
        headers=headers,
    )

    assert resp.status_code == 403, resp.get_json()
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []
    assert fake_requests.calls_for("GET", f"memberships?profile_id=eq.{TECH_C['id']}") == [], (
        "Validação do destino não deve rodar sem autorização"
    )


def test_transfer_only_during_active_attendance_400(
        api_module, client, fake_requests, monkeypatch):
    for status in ["aberto", "em_espera", "resolvido", "fechado", "indeferido"]:
        headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
        _route_ticket(fake_requests, _ticket(status=status))
        _route_write(fake_requests, _ticket(assignedToUserId=TECH_C["id"]))

        resp = client.post(
            "/api/chamados/t-1/transfer",
            json={"assignedToUserId": TECH_C["id"]},
            headers=headers,
        )

        assert resp.status_code == 400, (status, resp.get_json())
        assert "atendimento ativo" in resp.get_json()["error"]
        assert fake_requests.calls_for("PATCH", "chamados_tickets") == []
        fake_requests.unroute("GET", "chamados_tickets?id=eq.t-1")


def test_transfer_to_self_400(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_B["id"]},
        headers=headers,
    )

    assert resp.status_code == 400, resp.get_json()
    assert "diferente" in resp.get_json()["error"]
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_transfer_requires_target_id_400(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))

    resp = client.post("/api/chamados/t-1/transfer", json={"assignedTo": "Só o nome"}, headers=headers)

    assert resp.status_code == 400, resp.get_json()
    assert "assignedToUserId" in resp.get_json()["error"], (
        "A identidade precisa ser validável no servidor (ID)"
    )
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_transfer_target_not_active_member_400(
        api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_assignee_membership(fake_requests, TECH_C["id"], ok=False)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_C["id"]},
        headers=headers,
    )

    assert resp.status_code == 400, resp.get_json()
    assert "workspace" in resp.get_json()["error"]
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []
    assert fake_requests.calls_for("GET", f"profiles?id=eq.{TECH_C['id']}&select=name") == [], (
        "Perfil do destino não deve ser consultado quando a membership falha"
    )


def test_transfer_conflict_409_no_events_no_audit_no_notify(
        api_module, client, fake_requests, monkeypatch):
    """Corrida: responsável mudou entre a leitura e a escrita → PATCH condicional
    devolve 0 linhas → 409 SEM evento, auditoria do app ou notificação."""
    subs = []
    def _spy_target_subs(**kwargs):
        subs.append(kwargs)
        return []
    monkeypatch.setattr(api_module, "_target_subs", _spy_target_subs)

    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_assignee_membership(fake_requests, TECH_A["id"])
    _route_assignee_profile(fake_requests, TECH_A["id"], "Técnico A")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"]},
        headers=headers,
    )

    assert resp.status_code == 409, resp.get_json()
    assert "Conflito" in resp.get_json()["error"]
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    url = patches[0]["url"]
    assert "status=eq.em_atendimento" in url
    assert f"assignedToUserId=eq.{TECH_B['id']}" in url
    assert fake_requests.calls_for("POST", "ticket_events") == []
    assert fake_requests.calls_for("POST", "app_audit_logs") == []
    assert subs == [], "Notificação não pode existir após 409"


def test_transfer_prev_owner_null_uses_or_guard(
        api_module, client, fake_requests, monkeypatch):
    """Responsável anterior NULL no banco → guarda `or=(is.null,eq.)` (nunca 409
    falso num chamado gravado com NULL em vez de ''); nome NULL → `is.null`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, ASSIGNER, {"ticket.assign"})
    before = _ticket(status="a_caminho", assignedTo=None, assignedToUserId=None)
    updated = dict(before, assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_assignee_membership(fake_requests, TECH_A["id"])
    _route_assignee_profile(fake_requests, TECH_A["id"], "Técnico A")
    _route_write(fake_requests, updated)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"]},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    url = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["url"]
    assert "or=(assignedToUserId.is.null,assignedToUserId.eq.)" in url
    assert "assignedTo=is.null" in url, "Guarda de nome preserva o NULL original"


def test_transfer_prev_owner_empty_string_uses_eq_guard(
        api_module, client, fake_requests, monkeypatch):
    """Responsável anterior '' no banco → guarda `assignedTo=eq.` (string vazia)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, ASSIGNER, {"ticket.assign"})
    before = _ticket(status="a_caminho", assignedTo="", assignedToUserId="")
    updated = dict(before, assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_assignee_membership(fake_requests, TECH_A["id"])
    _route_assignee_profile(fake_requests, TECH_A["id"], "Técnico A")
    _route_write(fake_requests, updated)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"]},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    url = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["url"]
    assert "or=(assignedToUserId.is.null,assignedToUserId.eq.)" in url
    assert "assignedTo=eq." in url and "assignedTo=is.null" not in url, (
        "String vazia ≠ NULL na guarda de nome"
    )


def test_transfer_outsider_403(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch, OUTSIDER, {"ticket.assign"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"]},
        headers=headers,
    )

    assert resp.status_code == 403, resp.get_json()
    assert "Acesso negado" in resp.get_json()["error"]
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_transfer_body_identity_ignored_uses_actor_from_jwt(
        api_module, client, fake_requests, monkeypatch):
    """O ator vem do JWT — o cliente não pode transferir "como outro". O corpo
    com outro `assignedToUserId` é apenas o DESTINO, nunca a identidade."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH_B, {"ticket.status"})
    before = _ticket(status="em_atendimento")
    updated = dict(before, assignedToUserId=TECH_A["id"], assignedTo="Técnico A")
    _route_ticket(fake_requests, before)
    _route_assignee_membership(fake_requests, TECH_A["id"])
    _route_assignee_profile(fake_requests, TECH_A["id"], "Técnico A")
    _route_write(fake_requests, updated)

    resp = client.post(
        "/api/chamados/t-1/transfer",
        json={"assignedToUserId": TECH_A["id"], "actor_id": TECH_A["id"], "source": "client"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    audits = fake_requests.calls_for("POST", "app_audit_logs")
    assert audits[0]["kwargs"]["json"]["actor_id"] == TECH_B["id"], (
        "Identidade do ator = JWT, nunca o corpo"
    )
    assert audits[0]["kwargs"]["json"]["meta"]["transferor_id"] == TECH_B["id"]