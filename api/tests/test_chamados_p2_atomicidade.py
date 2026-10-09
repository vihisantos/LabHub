"""Chamados — P2 (issue #371): atomicidade na avaliação, reatribuição e criação.

Cobre os três pilares da P2:

P2-A — Feedback atômico
  - Duas tentativas concorrentes: apenas a PRIMEIRA grava; a perdedora atinge o
    PATCH CONDICIONAL (`feedbackRating=is.null`), afeta 0 linhas e recebe 409.
  - Avaliação duplicada (já persistida) bloqueada no gate (409).
  - Solicitante não autorizado (token inválido) → 403.
  - O PATCH é escopado ao ticket derivado do TOKEN: o corpo não consegue apontar
    para um ticket de outra unidade nem injetar campos administrativos.
  - Falha na gravação → 502.

P2-B — Reatribuição atômica (mesmo padrão condicional do claim/status)
  - O PATCH de atribuição inclui guarda condicional no responsável lido antes:
    `assignedToUserId=eq.{antigo}` (ou `or=(...)` quando estava SEM responsável).
  - Se a atribuição mudou entre leitura e escrita (0 linhas), responde 409.
  - Usuário sem `ticket.assign` → 403; atribuição cross-workspace → 400.
  - Reatribuição/unassign válidos mantêm a guarda e retornam 200.
  - Operação mista (status + atribuição) aplica AMBAS as guardas.

P2-C — Atribuição na criação pública
  - `assignedTo`/`assignedToUserId` no corpo da criação são IGNORADOS: o chamado
    nasce SEM responsável (''); o cliente não pode escolher o técnico.
  - Identidade/autorização não vêm do corpo (reportedByUserId só do JWT).
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

TICKET_ID = "ticket-001"
TOKEN_A = "segredo-token-A"

TECH_A_USER_ID = "user-tech-a"
TECH_B_USER_ID = "user-tech-b"
ASSIGNER_A_USER_ID = "user-assigner-a"
ASSIGNER_NO_ASSIGN_USER_ID = "user-assigner-no-assign"


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
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class SequenceResponse:
    """Resposta com estado: cada chamada a json() devolve o próximo payload.

    Simula o efeito da escrita no banco sem banco real: a 1ª chamada "grava"
    (devolve a linha), as seguintes devolvem [] (a condição não casa mais).
    """

    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.status_code = 200
        self.ok = True
        self.text = ""

    def json(self):
        return self._payloads.pop(0) if self._payloads else []


class FakeRequests:
    """Intercepta requests.get/post/patch/delete e roteia por substring da URL."""

    def __init__(self):
        self.calls = []
        self._routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def _do(self, method, url, **kwargs):
        params = kwargs.get("params")
        if params:
            qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
            url = f"{url}?{qs}"
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
    target = API_FILE.resolve()
    for name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_p2_atomicidade_api"
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
    api_module._TRACKING_RATE_STORE.clear()
    return api_module.app.test_client()


# ── helpers comuns ──────────────────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _setup_caller_auth(fake_requests, monkeypatch, profile):
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    ws_ids = profile.get("workspace_ids") or []
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile['id']}&select=workspace_id",
        FakeResponse([{"workspace_id": w, "status": "active"} for w in ws_ids]),
    )
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _assigner_profile(workspace_id: str = WS_A) -> dict:
    return {
        "id": ASSIGNER_A_USER_ID,
        "email": "assigner@labhub.local",
        "name": "Coordenador A",
        "role": "lider",
        "is_super_admin": False,
        "status": "active",
        "workspace_ids": [workspace_id],
    }


def _setup_ticket_routes(
    fake_requests,
    ticket_ws: str = WS_A,
    can_assign: bool = True,
    assigner_id: str = ASSIGNER_A_USER_ID,
    assigner_role_id: str = "r-lider",
    extra_actions: tuple = (),
) -> None:
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=workspace_id,status,assignedToUserId",
        FakeResponse([{"workspace_id": ticket_ws, "status": "aberto", "assignedToUserId": ""}]),
    )
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{assigner_id}&select=id,role_id,status",
        FakeResponse([{
            "id": "m1",
            "workspace_id": ticket_ws,
            "profile_id": assigner_id,
            "status": "active",
            "role_id": assigner_role_id,
        }]),
    )
    perms = [{"action": "ticket.view", "scope": "workspace"}]
    if can_assign:
        perms.append({"action": "ticket.assign", "scope": "workspace"})
    perms.extend({"action": a, "scope": "workspace"} for a in extra_actions)
    fake_requests.route(
        "GET",
        f"role_permissions?role_id=eq.{assigner_role_id}&select=action,scope",
        FakeResponse(perms),
    )
    fake_requests.route("GET", "membership_overrides", FakeResponse([]))


def _route_prev_owner(fake_requests, owner: str) -> None:
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=assignedToUserId",
        FakeResponse([{"assignedToUserId": owner}]),
    )


def _route_assignee_membership(fake_requests, profile_id: str, ok: bool = True):
    payload = [{"id": "m-x", "workspace_id": WS_A, "profile_id": profile_id, "status": "active"}] if ok else []
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile_id}&workspace_id=eq.{WS_A}&status=eq.active",
        FakeResponse(payload),
    )


def _ticket_row(assigned_to: str = "", assigned_to_user_id: str = "", status: str = "aberto") -> dict:
    return {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "assignedTo": assigned_to,
        "assignedToUserId": assigned_to_user_id,
        "status": status,
        "ticketNumber": 1,
        "roomName": "Lab",
        "assetName": "",
        "problemCategory": "Internet",
        "problemDescription": "",
        "priority": "normal",
        "reportedBy": "Prof",
        "reportedByEmail": "prof@lab.edu",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T01:00:00Z",
        "resolvedAt": None,
        "closedAt": None,
        "archived": False,
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    }


# ── helpers do tracking token / feedback ───────────────────────────────────

def _route_token_lookup(fake_requests, token, tid=TICKET_ID, ws=WS_A, status="resolvido"):
    h = _hash(token)
    fake_requests.route(
        "GET",
        f"chamados_tickets?tracking_token_hash=eq.{h}&select=id,workspace_id,status",
        FakeResponse([{"id": tid, "workspace_id": ws, "status": status}]),
    )


def _route_ticket_full(fake_requests, ticket, select="*"):
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{ticket['id']}&select={select}",
        FakeResponse([ticket]),
    )


# ── P2-A — feedback atômico ────────────────────────────────────────────────

def test_feedback_concurrent_attempts_first_wins_second_409(client, fake_requests):
    # Race: as DUAS leituras veem feedbackRating=None (estado pré-escrita),
    # mas o PATCH condicional só permite que UMA gravação seja persistida.
    _route_token_lookup(fake_requests, TOKEN_A, tid=TICKET_ID, status="resolvido")
    pending = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "status": "resolvido",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    }
    _route_ticket_full(fake_requests, pending, select="status,feedbackRating")
    updated = _ticket_row(status="resolvido")
    updated.update({"feedbackRating": 5, "feedbackComment": "Excelente", "feedbackAt": "2026-01-01T00:00:00Z"})
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        SequenceResponse([[updated], []]),
    )

    headers = {"X-Tracking-Token": TOKEN_A}
    first = client.post("/api/public/chamados/segredo-token-x/feedback",
                        json={"rating": 5, "comment": "Excelente"}, headers=headers)
    second = client.post("/api/public/chamados/segredo-token-x/feedback",
                         json={"rating": 1}, headers=headers)

    assert first.status_code == 200, first.get_json()
    assert first.get_json()["ticket"]["feedbackRating"] == 5
    assert second.status_code == 409, second.get_json()
    assert "avaliado" in (second.get_json().get("error") or "").lower()

    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 2
    for call in patches:
        assert "feedbackRating=is.null" in call["url"], (
            "PATCH deve ser condicional a feedback ainda não registrado"
        )


def test_feedback_already_rated_returns_409(client, fake_requests):
    _route_token_lookup(fake_requests, TOKEN_A, tid=TICKET_ID, status="fechado")
    rated = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "status": "fechado",
        "feedbackRating": 4,
        "feedbackComment": "Já avaliado",
        "feedbackAt": "2026-01-02T00:00:00Z",
    }
    _route_ticket_full(fake_requests, rated, select="status,feedbackRating")

    resp = client.post("/api/public/chamados/segredo-token-x/feedback",
                       json={"rating": 3}, headers={"X-Tracking-Token": TOKEN_A})

    assert resp.status_code == 409
    assert "avaliado" in (resp.get_json().get("error") or "").lower()
    assert not fake_requests.calls_for("PATCH", "chamados_tickets"), (
        "Avaliação duplicada deve ser bloqueada antes de qualquer escrita"
    )


def test_feedback_bad_token_returns_403(client, fake_requests):
    fake_requests.route(
        "GET",
        "chamados_tickets?tracking_token_hash=eq.",
        FakeResponse([]),
    )
    resp = client.post("/api/public/chamados/segredo-token-x/feedback",
                       json={"rating": 5}, headers={"X-Tracking-Token": "token-errado"})
    assert resp.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_feedback_scoped_to_token_ticket_not_other_unit(client, fake_requests):
    _route_token_lookup(fake_requests, TOKEN_A, tid=TICKET_ID, ws=WS_A, status="resolvido")
    pending = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "status": "resolvido",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    }
    _route_ticket_full(fake_requests, pending, select="status,feedbackRating")
    updated = _ticket_row(status="resolvido")
    updated.update({"feedbackRating": 4, "feedbackComment": "ok", "feedbackAt": "2026-01-01T00:00:00Z"})
    fake_requests.route("PATCH", f"chamados_tickets?id=eq.{TICKET_ID}", FakeResponse([updated]))

    resp = client.post(
        "/api/public/chamados/segredo-token-x/feedback",
        json={
            "rating": 4,
            "comment": "ok",
            # Tentativa do cliente de redirecionar a avaliação para outro
            # chamado/unidade e/ou alterar campos administrativos.
            "id": "ticket-B",
            "workspace_id": WS_B,
            "status": "fechado",
            "assignedToUserId": "user-hacker",
        },
        headers={"X-Tracking-Token": TOKEN_A},
    )

    assert resp.status_code == 200, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert f"id=eq.{TICKET_ID}" in patches[0]["url"]
    assert "ticket-B" not in patches[0]["url"]
    patch_body = patches[0]["kwargs"]["json"]
    assert "workspace_id" not in patch_body
    assert "status" not in patch_body
    assert "assignedToUserId" not in patch_body
    assert patch_body.get("feedbackRating") == 4


def test_feedback_write_failure_returns_502(client, fake_requests):
    _route_token_lookup(fake_requests, TOKEN_A, tid=TICKET_ID, status="resolvido")
    pending = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "status": "resolvido",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    }
    _route_ticket_full(fake_requests, pending, select="status,feedbackRating")
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([], status_code=500, ok=False),
    )

    resp = client.post("/api/public/chamados/segredo-token-x/feedback",
                       json={"rating": 5}, headers={"X-Tracking-Token": TOKEN_A})

    assert resp.status_code == 502
    assert "feedback" in (resp.get_json().get("error") or "").lower()


# ── P2-B — reatribuição atômica ────────────────────────────────────────────

def test_reassign_conflict_when_prev_unassigned(client, fake_requests, monkeypatch):
    """Race com o chamado SEM responsável: a guarda usa or=(...) e 0 linhas → 409."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _route_assignee_membership(fake_requests, TECH_A_USER_ID)
    _route_prev_owner(fake_requests, "")  # lido como sem responsável
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
                        headers=headers)

    assert resp.status_code == 409, resp.get_json()
    assert "Conflito" in (resp.get_json().get("error") or "")
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert "or=(assignedToUserId.is.null,assignedToUserId.eq.)" in patches[0]["url"], (
        "Reatribuição deve ser condicional ao estado 'sem responsável' lido antes"
    )


def test_reassign_conflict_when_owner_changed_between_read_and_write(client, fake_requests, monkeypatch):
    """Entre a leitura e a gravação outro fluxo mudou o responsável (0 linhas → 409)."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _route_assignee_membership(fake_requests, TECH_B_USER_ID)
    _route_prev_owner(fake_requests, TECH_A_USER_ID)  # responsável atual lido
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "Técnico B", "assignedToUserId": TECH_B_USER_ID},
                        headers=headers)

    assert resp.status_code == 409, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert f"assignedToUserId=eq.{TECH_A_USER_ID}" in patches[0]["url"], (
        "Guarda deve casar apenas com o responsável lido antes da escrita"
    )


def test_reassign_without_assign_permission_403(client, fake_requests, monkeypatch):
    profile = {**_assigner_profile(WS_A), "id": ASSIGNER_NO_ASSIGN_USER_ID, "name": "Técnico sem atribuição"}
    headers = _setup_caller_auth(fake_requests, monkeypatch, profile)
    _setup_ticket_routes(
        fake_requests,
        ticket_ws=WS_A,
        can_assign=False,
        assigner_id=ASSIGNER_NO_ASSIGN_USER_ID,
        assigner_role_id="r-tecnico",
    )

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
                        headers=headers)

    assert resp.status_code == 403, resp.get_json()
    assert not fake_requests.calls_for("PATCH", "chamados_tickets"), (
        "Usuário sem ticket.assign não pode escrever"
    )


def test_reassign_cross_workspace_rejected_400(client, fake_requests, monkeypatch):
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _route_assignee_membership(fake_requests, TECH_B_USER_ID, ok=False)  # B não é membro de A

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "Técnico B", "assignedToUserId": TECH_B_USER_ID},
                        headers=headers)

    assert resp.status_code == 400, resp.get_json()
    assert "workspace" in (resp.get_json().get("error") or "").lower()
    assert not fake_requests.calls_for("PATCH", "chamados_tickets"), (
        "Atribuição cross-workspace é bloqueada antes da escrita"
    )


def test_reassign_valid_keeps_atomic_guard(client, fake_requests, monkeypatch):
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _route_assignee_membership(fake_requests, TECH_A_USER_ID)
    _route_prev_owner(fake_requests, "")
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([_ticket_row(assigned_to="Técnico A", assigned_to_user_id=TECH_A_USER_ID)]),
    )

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
                        headers=headers)

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["ticket"]["assignedToUserId"] == TECH_A_USER_ID
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert "or=(assignedToUserId.is.null,assignedToUserId.eq.)" in patches[0]["url"], (
        "Reatribuição válida também deve ser condicional (evita sobrescrita silenciosa)"
    )


def test_unassign_valid_keeps_prev_owner_guard(client, fake_requests, monkeypatch):
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _route_prev_owner(fake_requests, TECH_A_USER_ID)  # desatribuindo de TECH_A
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([_ticket_row()]),  # assignee vazio
    )

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedTo": "", "assignedToUserId": ""},
                        headers=headers)

    assert resp.status_code == 200, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert f"assignedToUserId=eq.{TECH_A_USER_ID}" in patches[0]["url"], (
        "Unassign deve casar apenas com o responsável lido antes"
    )


def test_reassign_with_status_change_applies_both_guards(client, fake_requests, monkeypatch):
    """Operação mista aplica as guardas de status E de atribuição no mesmo PATCH."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A, extra_actions=("ticket.status",))
    _route_assignee_membership(fake_requests, TECH_A_USER_ID)
    _route_prev_owner(fake_requests, "")
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=status,statusNote,resolvedAt,closedAt,archived",
        FakeResponse([{"status": "aberto", "statusNote": "", "resolvedAt": None, "closedAt": None, "archived": False}]),
    )
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([_ticket_row(assigned_to="Técnico A", assigned_to_user_id=TECH_A_USER_ID, status="em_atendimento")]),
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"status": "em_atendimento", "assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
        headers=headers,
    )

    assert resp.status_code == 200, resp.get_json()
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    url = patches[0]["url"]
    assert "status=eq.aberto" in url, "Guarda de status presente na operação mista"
    assert "or=(assignedToUserId.is.null,assignedToUserId.eq.)" in url, (
        "Guarda de atribuição presente na operação mista"
    )


# ── P2-C — atribuição na criação pública ───────────────────────────────────

def _valid_payload(**overrides):
    payload = {
        "workspace_id": WS_A,
        "roomName": "Sala 101",
        "reportedBy": "Prof. Maria",
        "problemArea": "academica",
        "problemCategory": "Internet",
        "problemDescription": "Sem conexão",
    }
    payload.update(overrides)
    return payload


def _route_workspace_ok(fake_requests, ws_id=WS_A):
    fake_requests.route(
        "GET",
        "/rest/v1/workspaces",
        FakeResponse([{"id": ws_id, "name": "Campus A", "slug": "a", "location": "X", "disabled_apps": []}]),
    )


def _route_ticket_number(fake_requests, last=9):
    fake_requests.route(
        "GET",
        "chamados_tickets?select=ticketNumber",
        FakeResponse([{"ticketNumber": last}]),
    )


def _route_create_insert(fake_requests, ticket):
    fake_requests.route("POST", "/rest/v1/chamados_tickets", FakeResponse([ticket]))


def test_create_public_ignores_adulterated_assignee_and_identity(client, fake_requests, api_module, monkeypatch):
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([]))
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=9)
    monkeypatch.setattr(api_module, "_get_token_from_request", lambda: None)
    created = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Sem conexão",
        "status": "aberto",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "",
        "reportedByUserId": None,
        "assignedTo": "",
        "assignedToUserId": "",
        "ticketNumber": 10,
        "tracking_token_hash": "hash-x",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "resolvedAt": None,
        "photos": "",
    }
    _route_create_insert(fake_requests, created)

    resp = client.post(
        "/api/chamados",
        json={
            **_valid_payload(),
            # Cliente tenta escolher o responsável, forjar identidade/autoridade.
            "assignedTo": "Técnico Hacker",
            "assignedToUserId": "user-hacker",
            "reportedByUserId": "user-fake",
            "role": "admin",
            "is_super_admin": True,
        },
    )

    assert resp.status_code == 200, resp.get_json()
    insert = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert insert.get("assignedTo") == "", "Cliente não pode definir assignedTo"
    assert insert.get("assignedToUserId") == "", "Cliente não pode definir assignedToUserId"
    assert insert.get("reportedByUserId") is None, "Identidade vem do JWT, nunca do corpo"
    assert "role" not in insert and "is_super_admin" not in insert


def test_create_authenticated_still_cannot_choose_assignee(client, fake_requests, api_module, monkeypatch):
    """Mesmo logado, a criação pública não usa assignedTo/assignedToUserId do corpo."""
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([]))
    _route_workspace_ok(fake_requests)
    _route_ticket_number(fake_requests, last=9)
    created = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Sem conexão",
        "status": "aberto",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "",
        "reportedByUserId": "user-123",
        "assignedTo": "",
        "assignedToUserId": "",
        "ticketNumber": 10,
        "tracking_token_hash": "hash-x",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "resolvedAt": None,
        "photos": "",
    }
    _route_create_insert(fake_requests, created)

    # Caller com JWT válido (frente real), mas a atribuição ainda vem do servidor.
    monkeypatch.setattr(api_module, "_get_token_from_request", lambda: "fake-token")
    monkeypatch.setattr(api_module, "_verify_jwt", lambda _t: {"sub": "user-123"})

    resp = client.post(
        "/api/chamados",
        json={**_valid_payload(), "assignedToUserId": "user-hacker"},
        headers={"Authorization": f"Bearer {_make_jwt({'sub': 'user-123'})}"},
    )

    assert resp.status_code == 200, resp.get_json()
    insert = fake_requests.calls_for("POST", "/rest/v1/chamados_tickets")[0]["kwargs"]["json"]
    assert insert.get("assignedToUserId") == "", "Cliente autenticado também não define responsável"
    assert insert.get("reportedByUserId") == "user-123", "reportedByUserId é derivado do JWT"