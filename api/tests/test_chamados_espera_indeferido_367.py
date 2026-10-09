"""Chamados — estados `em_espera` e `indeferido` (issue #367) — regressão.

Testes do fluxo operacional de Em espera / Indeferimento em `api/app.py`:

Transições:
  - `em_espera → em_atendimento` (RETOMADA) é a ÚNICA saída válida para quem
    está em `em_espera`.
  - Qualquer outra transição a partir de `em_espera` é rejeitada (400) —
    `→ aberto`, `→ resolvido`, `→ fechado`, `→ indeferido`, `→ em_espera`.
  - `indeferido` é TERMINAL: nenhuma transição de saída (400) —
    `→ aberto`, `→ em_atendimento`, `→ resolvido`, `→ fechado`, `→ em_espera`.

Motivo:
  - OBRIGATÓRIO para entrar em `em_espera`/`indeferido` (400 sem `reasonCode`).
  - Deve ser um código PREDEFINIDO do catálogo do status (400 para código fora
    do catálogo e para código do catálogo "errado" — ex.: código de espera usado
    num indeferimento).
  - `reasonLabel` é resolvido no SERVIDOR (o cliente não o envia) e persiste
    estruturado junto com `reasonCode`/`reasonNote`.

Retomada:
  - Preserva o motivo original (`reasonCode`/`reasonLabel`/`reasonNote`).

Concorrência:
  - PATCH condicional por status (`&status=eq.<prev>`): se o status atual mudou
    entre a leitura e a escrita (0 linhas afetadas) → 409.

Autorização:
  - As transições continuam exigindo `ticket.status` (403 sem a Action).
  - As proibições de transição são aplicadas ANTES da autorização e de qualquer
    mutation (fail-closed): mesmo com as Actions completas, a transição
    proibida retorna 400 e NADA é gravado.
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
    """Mesmo harness de test_chamados_authorization_hardening.py."""

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
    key = "chamados_espera_indeferido_api"
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

EM_ESPERA_REASON = {
    "reasonCode": "WAITING_EQUIPMENT",
    "reasonLabel": "Aguardando equipamento/peça",
    "reasonNote": "Aguardando chegada da fonte reserva",
}
INDEFERIMENTO_REASON = {
    "reasonCode": "NOT_IT_REQUEST",
    "reasonLabel": "Solicitação não caracteriza incidente/requisição de TI",
    "reasonNote": "Encaminhar ao setor responsável",
}


def _auth_as(api_module, fake_requests, monkeypatch, profile, actions):
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
        "resolvedAt": None,
        "statusNote": "",
        "photos": "",
    }
    t.update(overrides)
    return t


def _route_ticket(fake_requests, ticket):
    part = f"chamados_tickets?id=eq.{ticket['id']}"
    fake_requests.unroute("GET", part)
    fake_requests.route("GET", part, FakeResponse([ticket]))


def _route_write(fake_requests, updated=None):
    """Roteia o PATCH condicional final e as escritas auxiliares."""
    fake_requests.route("PATCH", "chamados_tickets?id=eq.",
                        FakeResponse([updated] if updated else []))
    fake_requests.route("POST", "/rest/v1/ticket_events",
                        FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/rbac_audit_logs", FakeResponse([], status_code=204))


def _route_conflict(fake_requests):
    """PATCH condicional devolve 0 linhas = status mudou entre leitura e escrita."""
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))


# ── 1. RETOMADA: em_espera → em_atendimento ──────────────────────────────────

def test_retomada_em_espera_para_em_atendimento_permitida_e_preserva_motivo(
        api_module, client, fake_requests, monkeypatch):
    """A ÚNICA saída de `em_espera` é a retomada, que PRESERVA o motivo."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    before = _ticket(status="em_espera", **EM_ESPERA_REASON)
    _route_ticket(fake_requests, before)
    _route_write(fake_requests, dict(before, status="em_atendimento"))

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()["ticket"]
    assert body["status"] == "em_atendimento"
    # Motivo ORIGINAL preservado na retomada (histórico mostra por que esperou).
    assert body["reasonCode"] == "WAITING_EQUIPMENT"
    assert body["reasonLabel"] == "Aguardando equipamento/peça"
    assert body["reasonNote"] == "Aguardando chegada da fonte reserva"


# ── 2. SAÍDAS PROIBIDAS DE em_espera ─────────────────────────────────────────

@pytest.mark.parametrize("para", [
    "aberto", "a_caminho", "resolvido", "fechado", "indeferido", "em_espera",
])
def test_saidas_proibidas_de_em_espera_retornam_400(
        api_module, client, fake_requests, monkeypatch, para):
    """De `em_espera` a ÚNICA transição permitida é a retomada (→ em_atendimento).

    Mesmo com `ticket.status` concedido, qualquer outra saída é rejeitada com 400
    e NENHUMA mutation acontece (validação antes da escrita).
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_espera", **EM_ESPERA_REASON))
    _route_write(fake_requests, _ticket(status=para))

    resp = client.patch("/api/chamados/t-1", json={"status": para}, headers=headers)

    assert resp.status_code == 400
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


# ── 3. indeferido É TERMINAL ─────────────────────────────────────────────────

@pytest.mark.parametrize("para", [
    "aberto", "a_caminho", "em_atendimento", "resolvido", "fechado", "em_espera",
])
def test_indeferido_nao_tem_saidas_retorna_400(
        api_module, client, fake_requests, monkeypatch, para):
    """`indeferido` é estado FINAL: nenhuma transição de saída (mesmo com Actions)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH,
                       {"ticket.status", "ticket.close", "ticket.reopen"})
    _route_ticket(fake_requests, _ticket(status="indeferido", **INDEFERIMENTO_REASON))
    _route_write(fake_requests, _ticket(status=para))

    resp = client.patch("/api/chamados/t-1", json={"status": para}, headers=headers)

    assert resp.status_code == 400
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


# ── 4. MOTIVO OBRIGATÓRIO ────────────────────────────────────────────────────

@pytest.mark.parametrize("para", ["em_espera", "indeferido"])
def test_motivo_obrigatorio_para_novos_estados(
        api_module, client, fake_requests, monkeypatch, para):
    """Entrar em `em_espera`/`indeferido` SEM `reasonCode` ⇒ 400."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests, _ticket(status=para))

    resp = client.patch("/api/chamados/t-1", json={"status": para}, headers=headers)

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Motivo obrigatório: selecione um motivo predefinido"
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


@pytest.mark.parametrize("para", ["em_espera", "indeferido"])
def test_motivo_fora_do_catalogo_rejeitado(
        api_module, client, fake_requests, monkeypatch, para):
    """`reasonCode` que não existe em NENHUM catálogo ⇒ 400."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests, _ticket(status=para))

    resp = client.patch("/api/chamados/t-1", json={
        "status": para,
        "reasonCode": "NAO_EXISTE",
    }, headers=headers)

    assert resp.status_code == 400
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_motivo_do_catalogo_errado_rejeitado_no_indeferimento(
        api_module, client, fake_requests, monkeypatch):
    """Código de ESPERA usado num INDEFERIMENTO ⇒ 400 (catálogo por status)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests, _ticket(status="indeferido"))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "indeferido",
        "reasonCode": "WAITING_VENDOR",
    }, headers=headers)

    assert resp.status_code == 400
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_motivo_do_catalogo_errado_rejeitado_na_espera(
        api_module, client, fake_requests, monkeypatch):
    """Código de INDEFERIMENTO usado numa ESPERA ⇒ 400 (catálogo por status)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="em_atendimento"))
    _route_write(fake_requests, _ticket(status="em_espera"))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_espera",
        "reasonCode": "OUT_OF_SCOPE",
    }, headers=headers)

    assert resp.status_code == 400
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


# ── 5. TRANSIÇÃO VÁLIDA PARA em_espera/indeferido ────────────────────────────

def test_aberto_para_em_espera_com_motivo_permitido(
        api_module, client, fake_requests, monkeypatch):
    """`aberto → em_espera` com motivo válido: 200 e motivo persistido estruturado.

    O cliente envia apenas `reasonCode` e `reasonNote`; o `reasonLabel` é
    resolvido no SERVIDOR (nunca confiamos no rótulo vindo do cliente).
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    before = _ticket(status="aberto")
    _route_ticket(fake_requests, before)
    updated = dict(
        before,
        status="em_espera",
        reasonCode="WAITING_REQUESTER",
        reasonLabel="Aguardando retorno do solicitante",
        reasonNote="Tentamos contato duas vezes sem resposta",
    )
    _route_write(fake_requests, updated)

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_espera",
        "reasonCode": "WAITING_REQUESTER",
        "reasonNote": "Tentamos contato duas vezes sem resposta",
    }, headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()["ticket"]
    assert body["status"] == "em_espera"
    assert body["reasonCode"] == "WAITING_REQUESTER"
    # Rótulo resolvido pelo backend a partir do catálogo oficial.
    assert body["reasonLabel"] == "Aguardando retorno do solicitante"
    assert body["reasonNote"] == "Tentamos contato duas vezes sem resposta"


def test_em_atendimento_para_indeferido_com_motivo_permitido(
        api_module, client, fake_requests, monkeypatch):
    """`em_atendimento → indeferido` com motivo válido: 200, motivo persistido."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    before = _ticket(status="em_atendimento")
    _route_ticket(fake_requests, before)
    updated = dict(
        before,
        status="indeferido",
        reasonCode="OTHER_DEPARTMENT",
        reasonLabel="Solicitação deve ser realizada por outro setor",
        reasonNote="Encaminhar à Divisão de Patrimônio",
    )
    _route_write(fake_requests, updated)

    resp = client.patch("/api/chamados/t-1", json={
        "status": "indeferido",
        "reasonCode": "OTHER_DEPARTMENT",
        "reasonNote": "Encaminhar à Divisão de Patrimônio",
    }, headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()["ticket"]
    assert body["status"] == "indeferido"
    assert body["reasonCode"] == "OTHER_DEPARTMENT"
    assert body["reasonLabel"] == "Solicitação deve ser realizada por outro setor"
    assert body["reasonNote"] == "Encaminhar à Divisão de Patrimônio"
    # Estado próprio: NÃO arquiva nem resolve.
    assert body["archived"] is False
    assert body["resolvedAt"] is None


# ── 6. CONCORRÊNCIA: PATCH CONDICIONAL ───────────────────────────────────────

def test_conflito_concorrente_retorna_409(
        api_module, client, fake_requests, monkeypatch):
    """Se o status mudou entre a leitura e a escrita (0 linhas), a transição é 409."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_conflict(fake_requests)

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_espera",
        "reasonCode": "WAITING_REQUESTER",
    }, headers=headers)

    assert resp.status_code == 409
    body = resp.get_json()
    assert "atualizado por outro usuário" in body["error"]
    # A URL do PATCH final deve ser CONDICIONAL por status (issue #367).
    patch_calls = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patch_calls) == 1
    assert "status=eq.aberto" in patch_calls[0]["url"]


# ── 7. AUTORIZAÇÃO ───────────────────────────────────────────────────────────

def test_retomada_sem_ticket_status_negada(
        api_module, client, fake_requests, monkeypatch):
    """Retomada (em_espera → em_atendimento) continua exigindo `ticket.status`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, set())
    _route_ticket(fake_requests, _ticket(status="em_espera", **EM_ESPERA_REASON))
    _route_write(fake_requests, _ticket(status="em_atendimento"))

    resp = client.patch("/api/chamados/t-1",
                        json={"status": "em_atendimento"}, headers=headers)

    assert resp.status_code == 403
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_entrar_em_espera_sem_ticket_status_negada(
        api_module, client, fake_requests, monkeypatch):
    """`aberto → em_espera` também exige `ticket.status` (403 sem a Action)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch, TECH, set())
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests, _ticket(status="em_espera", **EM_ESPERA_REASON))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_espera",
        "reasonCode": "WAITING_REQUESTER",
    }, headers=headers)

    assert resp.status_code == 403
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_entrar_em_espera_sem_membership_negada(
        api_module, client, fake_requests, monkeypatch):
    """Usuário sem membership no workspace do chamado ⇒ 403 (nenhuma mutation)."""
    outsider = dict(TECH, id="outsider", workspace_ids=["ws-b"])
    headers = _auth_as(api_module, fake_requests, monkeypatch, outsider, {"ticket.status"})
    _route_ticket(fake_requests, _ticket(status="aberto"))
    _route_write(fake_requests, _ticket(status="em_espera", **EM_ESPERA_REASON))

    resp = client.patch("/api/chamados/t-1", json={
        "status": "em_espera",
        "reasonCode": "WAITING_REQUESTER",
    }, headers=headers)

    assert resp.status_code == 403
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []