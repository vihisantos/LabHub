"""Chamados — hardening de atribuição cross-workspace.

Testa que `assignedToUserId` deve pertencer ao mesmo workspace do chamado.
O backend deve rejeitar atribuição cross-workspace com 400, independentemente
do assigner ter `ticket.assign` no seu próprio workspace.

Cenários cobertos:
  - Assigner do workspace A NÃO pode atribuir técnico do workspace B (400).
  - Assigner do workspace A NÃO pode atribuir usuário SEM membership (400).
  - Assigner do workspace A PODE atribuir técnico com membership ativa em A (200).
  - Técnico com membership INATIVA (status != active) é rejeitado (400).
  - Remoção de responsável (`assignedToUserId=''`) não exige membership check
    do alvo, mas MANTÉM a autorização do caller: um caller sem `ticket.assign`
    recebe 403 mesmo para unassign.
  - PATCH com só `assignedTo` (sem `assignedToUserId`): membership check NÃO é
    executado — o campo `assignedToUserId` isolado é que gatilha a validação.

Garantia de segurança: nenhum filtro visual no frontend pode substituir esta
validação. Um PATCH HTTP manipulado que inclua um `assignedToUserId` de outro
campus é bloqueado aqui, no servidor.
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

TECH_A_USER_ID = "user-tech-a"
TECH_B_USER_ID = "user-tech-b"
NO_MEMBERSHIP_USER_ID = "user-no-membership"
ASSIGNER_A_USER_ID = "user-assigner-a"
ASSIGNER_NO_ASSIGN_USER_ID = "user-assigner-no-assign"

TICKET_ID = "ticket-001"


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


class FakeRequests:
    """Intercepta requests.get/post/patch/delete e roteia por substring da URL.

    Rotas não mockadas retornam lista vazia (200) — padrão da suíte
    (test_chamados.py) — e todas as chamadas ficam gravadas para asserções.
    """

    def __init__(self):
        self.calls = []
        self._routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def _do(self, method, url, **kwargs):
        # auth/rbac passam filtros via `params=`; reconstrói a query string na
        # mesma ordem do `requests` (chaves ordenadas) para o matching por substring.
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
    key = "chamados_assign_hardening_api"
    spec = importlib.util.spec_from_file_location(key, API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def fake_requests():
    return FakeRequests()


def _patch_infrastructure(api_module, fake_requests, monkeypatch):
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


@pytest.fixture()
def client(api_module, fake_requests, monkeypatch):
    _patch_infrastructure(api_module, fake_requests, monkeypatch)
    fake_requests.route("POST", "/rest/v1/rpc/pg_sql", FakeResponse([], status_code=200))
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


def _setup_caller_auth(fake_requests, monkeypatch, profile):
    """Autentica o caller: JWT → `auth._verify_jwt` → perfil + memberships ativas."""
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route("GET", "/rest/v1/profiles", FakeResponse([profile]))
    # `_get_user_workspace_ids` → memberships ativas (`params=` com select=workspace_id).
    ws_ids = profile.get("workspace_ids") or []
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile['id']}&select=workspace_id",
        FakeResponse([{"workspace_id": w, "status": "active"} for w in ws_ids]),
    )
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _assigner_profile(workspace_id: str = WS_A) -> dict:
    """Perfil do assigner com membership ativa e role com `ticket.assign`."""
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
) -> None:
    """Configura rotas mínimas para que o PATCH chegue à validação de assignee."""
    # fetch_ws: ticket existe no workspace informado, sem responsável.
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=workspace_id,status,assignedToUserId",
        FakeResponse([{"workspace_id": ticket_ws, "status": "aberto", "assignedToUserId": ""}]),
    )
    # Busca do RBAC: membership do assigner no workspace do chamado
    # (`params=` → query reconstruída em ordem crescente das chaves).
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
    # role_permissions do asignador (com ou sem `ticket.assign`).
    perms = [
        {"action": "ticket.view", "scope": "workspace"},
    ]
    if can_assign:
        perms.append({"action": "ticket.assign", "scope": "workspace"})
    fake_requests.route(
        "GET",
        f"role_permissions?role_id=eq.{assigner_role_id}&select=action,scope",
        FakeResponse(perms),
    )
    # membership_overrides (vazio).
    fake_requests.route(
        "GET",
        "membership_overrides",
        FakeResponse([]),
    )


def _setup_successful_patch(fake_requests, assigned_to, assigned_to_user_id) -> None:
    """Rotas extras para o PATCH bem-sucedido (fetch prev + PATCH + notificação)."""
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=assignedTo,assignedToUserId",
        FakeResponse([{"assignedTo": "", "assignedToUserId": ""}]),
    )
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([{
            "id": TICKET_ID,
            "workspace_id": WS_A,
            "assignedTo": assigned_to,
            "assignedToUserId": assigned_to_user_id,
            "status": "aberto",
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
        }]),
    )
    # O restante (audit, notificações) é best-effort → fallback default.


# ── Teste 1: atribuição cross-workspace é rejeitada ──────────────────────────

def test_assign_cross_workspace_rejected(client, fake_requests, monkeypatch):
    """Técnico de campus B NÃO pode ser atribuído a chamado de campus A."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)

    # TECH_B é membro de WS_B (não de WS_A) → membership check em WS_A vem vazio.
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{TECH_B_USER_ID}&workspace_id=eq.{WS_A}&status=eq.active",
        FakeResponse([]),
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "Técnico B", "assignedToUserId": TECH_B_USER_ID},
        headers=headers,
    )

    assert resp.status_code == 400, (
        f"Esperado 400 para atribuição cross-workspace, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    data = resp.get_json()
    assert "workspace" in (data.get("error") or "").lower(), (
        f"Mensagem de erro não menciona 'workspace': {data}"
    )

    # Garantia de não-escrita: o PATCH no Supabase não foi chamado.
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert not patches, "PATCH foi chamado mesmo com atribuição cross-workspace rejeitada"


# ── Teste 2: usuário sem membership é rejeitado ──────────────────────────────

def test_assign_user_without_membership_rejected(client, fake_requests, monkeypatch):
    """Usuário SEM membership na unidade do chamado NÃO pode ser atribuído."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)

    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{NO_MEMBERSHIP_USER_ID}&workspace_id=eq.{WS_A}&status=eq.active",
        FakeResponse([]),
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "Sem vínculo", "assignedToUserId": NO_MEMBERSHIP_USER_ID},
        headers=headers,
    )

    assert resp.status_code == 400, (
        f"Esperado 400 para usuário sem membership, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert not patches, "PATCH não deveria ser chamado para usuário sem membership"


# ── Teste 3: atribuição mesmo workspace é aceita ─────────────────────────────

def test_assign_same_workspace_accepted(client, fake_requests, monkeypatch):
    """Técnico com membership ativa em campus A PODE ser atribuído a chamado de A."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)

    # Membership ativa de TECH_A em WS_A → check passa.
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{TECH_A_USER_ID}&workspace_id=eq.{WS_A}&status=eq.active",
        FakeResponse([{"id": "m-tech-a", "workspace_id": WS_A, "profile_id": TECH_A_USER_ID, "status": "active"}]),
    )
    _setup_successful_patch(fake_requests, "Técnico A", TECH_A_USER_ID)

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
        headers=headers,
    )

    assert resp.status_code == 200, (
        f"Esperado 200 para atribuição no mesmo workspace, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    data = resp.get_json()
    assert data.get("ticket", {}).get("assignedToUserId") == TECH_A_USER_ID


# ── Teste 4: técnico com membership inativa é rejeitado ──────────────────────

def test_assign_inactive_membership_rejected(client, fake_requests, monkeypatch):
    """Técnico com membership INATIVA (status != active) é rejeitado."""
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)

    # Membership check retorna vazio (o filtro status=eq.active já exclui inativo).
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{TECH_A_USER_ID}&workspace_id=eq.{WS_A}&status=eq.active",
        FakeResponse([]),
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID},
        headers=headers,
    )

    assert resp.status_code == 400, (
        f"Esperado 400 para técnico com membership inativa, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert not patches, "PATCH não deveria ser chamado para técnico com membership inativa"


# ── Teste 5: remoção de responsável não exige membership do alvo ─────────────

def test_unassign_skips_assignee_membership_check(client, fake_requests, monkeypatch):
    """Remoção de responsável (`assignedToUserId=''`) não exige membership check.

    Mas a AUTORIZAÇÃO do caller não é afetada: um caller sem `ticket.assign`
    recebe 403 mesmo para remover responsável (ver teste 7).
    """
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)

    # Nenhuma rota de membership check para o assignee é mockada. Se o backend
    # tentar verificar `assignedToUserId` vazio, o check de "não foi chamado"
    # abaixo falharia (a verificação não deve existir — não apenas `None`).
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=assignedTo,assignedToUserId",
        FakeResponse([{"assignedTo": "Técnico A", "assignedToUserId": TECH_A_USER_ID}]),
    )
    fake_requests.route(
        "PATCH",
        f"chamados_tickets?id=eq.{TICKET_ID}",
        FakeResponse([{
            "id": TICKET_ID,
            "workspace_id": WS_A,
            "assignedTo": "",
            "assignedToUserId": "",
            "status": "aberto",
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
        }]),
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "", "assignedToUserId": ""},
        headers=headers,
    )

    assert resp.status_code == 200, (
        f"Esperado 200 para remoção de responsável, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    # Confirma que NENHUMA rota de membership check para assignee foi chamada.
    # (o lookup de RBAC do próprio assigner é excluído do filtro)
    membership_checks = [
        c for c in fake_requests.calls
        if "memberships" in c["url"]
        and "profile_id=eq." in c["url"]
        and "status=eq.active" in c["url"]
        and ASSIGNER_A_USER_ID not in c["url"]
    ]
    assert not membership_checks, (
        "Membership check para assignee não deveria ser executado para assignedToUserId vazio"
    )


# ── Teste 6: apenas assignedTo sem assignedToUserId não gatilha check ─────────

def test_assign_without_userid_skips_membership_check(client, fake_requests, monkeypatch):
    """PATCH com só `assignedTo` (sem `assignedToUserId`) não executa membership check.

    Isso preserva compatibilidade com casos legados onde assignedToUserId não é
    enviado (ex: assignedTo='Técnico A' sem UUID). A validação só ocorre quando
    um UUID explícito é fornecido.
    """
    headers = _setup_caller_auth(fake_requests, monkeypatch, _assigner_profile(WS_A))
    _setup_ticket_routes(fake_requests, ticket_ws=WS_A)
    _setup_successful_patch(fake_requests, "Técnico A", "")

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        # Sem assignedToUserId — só o nome textual.
        json={"assignedTo": "Técnico A"},
        headers=headers,
    )

    assert resp.status_code == 200, (
        f"Esperado 200 para patch sem assignedToUserId, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    membership_checks = [
        c for c in fake_requests.calls
        if "memberships" in c["url"]
        and "profile_id=eq." in c["url"]
        and "status=eq.active" in c["url"]
        and ASSIGNER_A_USER_ID not in c["url"]
    ]
    assert not membership_checks, (
        "Membership check não deveria ser executado quando assignedToUserId não está no payload"
    )


# ── Teste 7: unassign protegido pela autorização do caller ───────────────────

def test_unassign_requires_assigner_permission(client, fake_requests, monkeypatch):
    """Caller SEM `ticket.assign` NÃO pode remover responsável.

    O fato de `assignedToUserId=''` não exigir validação de membership do alvo
    NÃO remove a autorização do caller: quem não pode atribuir também não pode
    desatribuir por esta rota.
    """
    profile = {
        **_assigner_profile(WS_A),
        "id": ASSIGNER_NO_ASSIGN_USER_ID,
        "name": "Técnico sem atribuição",
    }
    headers = _setup_caller_auth(fake_requests, monkeypatch, profile)

    # Escopo OK (membership ativa em WS_A, role devidamente resolvida), mas o ROLE
    # NÃO possui `ticket.assign` → a RBAC bloqueia mesmo com assignedToUserId vazio.
    _setup_ticket_routes(
        fake_requests,
        ticket_ws=WS_A,
        can_assign=False,
        assigner_id=ASSIGNER_NO_ASSIGN_USER_ID,
        assigner_role_id="r-tecnico",
    )

    resp = client.patch(
        f"/api/chamados/{TICKET_ID}",
        json={"assignedTo": "", "assignedToUserId": ""},
        headers=headers,
    )

    assert resp.status_code == 403, (
        f"Esperado 403 para unassign sem permission, obteve {resp.status_code}: "
        f"{resp.get_json()}"
    )
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert not patches, "PATCH não deveria ser chamado para caller sem ticket.assign"