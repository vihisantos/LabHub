"""Chamados — validação UNIFICADA do responsável no PATCH genérico (P3 #371).

O `PATCH /api/chamados/<id>` passa a reusar `_resolve_assignee_profile`, a
MESMA autoridade da transferência. Para o destinatário exige, nesta ordem:

  1. membership ATIVA no workspace DO CHAMADO (isolamento cross-workspace);
  2. perfil com `status='active'`;
  3. elegibilidade EFETIVA para atender (`ticket.claim`, RBAC 2.0 — role base
     OU override por membership; migration 038).

Aqui exercitamos o caminho genérico (não a rota de transferência) com o motor
RBAC REAL (módulo `rbac` roteado para o Supabase fake) para provar:

  - destinatário elegível por ROLE BASE ⇒ 200;
  - destinatário com perfil INATIVO ⇒ 400;
  - destinatário SEM `ticket.claim` ⇒ 400;
  - OVERRIDE `allow` eleva um role sem base ⇒ 200;
  - OVERRIDE `deny` rebaixa um role com base ⇒ 400;
  - destinatário de OUTRO workspace ⇒ 400 (não valida por workspace do assigner);
  - ator sem `ticket.assign` ⇒ 403 (e nenhuma consulta ao destinatário);
  - remoção de responsável (ID vazio) NÃO valida destinatário ⇒ 200;
  - qualquer falha de validação NÃO grava nada (atomicidade).

Garantia: a lista do frontend NÃO é a autoridade; um PATCH manipulado que aponte
para um usuário inelegível é bloqueado no servidor.
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

ASSIGNER_ID = "user-assigner"
ASSIGNER_ROLE_ID = "r-lider"

TARGET_ID = "user-target"

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
    """Roteia por substring da URL; reconstrói `params=` como query string."""

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
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}{qs}"
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
    for mod in list(sys.modules.values()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_patch_eligibility_api"
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

def _setup_caller(fake_requests, monkeypatch, workspace_ids):
    """Autentica o assigner (não super admin) com memberships ativas."""
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": ASSIGNER_ID})
    fake_requests.route(
        "GET",
        f"profiles?id=eq.{ASSIGNER_ID}",
        FakeResponse([{
            "id": ASSIGNER_ID,
            "email": "assigner@labhub.local",
            "name": "Coordenador A",
            "role": "lider",
            "is_super_admin": False,
            "status": "active",
        }]),
    )
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{ASSIGNER_ID}&select=workspace_id",
        FakeResponse([{"workspace_id": w, "status": "active"} for w in workspace_ids]),
    )
    return {"Authorization": f"Bearer {_make_jwt({'sub': ASSIGNER_ID})}"}


def _setup_ticket_routes(fake_requests, ticket_ws=WS_A, can_assign=True,
                         current_assignee_id="", current_assignee_name=""):
    """Rotas mínimas para o PATCH chegar à validação de destinatário."""
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=workspace_id,status,assignedToUserId",
        FakeResponse([{"workspace_id": ticket_ws, "status": "aberto",
                       "assignedToUserId": current_assignee_id}]),
    )
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=assignedTo,assignedToUserId",
        FakeResponse([{"assignedTo": current_assignee_name,
                       "assignedToUserId": current_assignee_id}]),
    )
    # RBAC do assigner (workspace DO CHAMADO).
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{ASSIGNER_ID}&select=id,role_id,status&workspace_id=eq.{ticket_ws}",
        FakeResponse([{
            "id": "m-assigner",
            "workspace_id": ticket_ws,
            "profile_id": ASSIGNER_ID,
            "status": "active",
            "role_id": ASSIGNER_ROLE_ID,
        }]),
    )
    perms = [{"action": "ticket.view", "scope": "workspace"}]
    if can_assign:
        perms.append({"action": "ticket.assign", "scope": "workspace"})
    fake_requests.route(
        "GET",
        f"role_permissions?role_id=eq.{ASSIGNER_ROLE_ID}&select=action,scope",
        FakeResponse(perms),
    )


def _route_target_eligibility(fake_requests, target=TARGET_ID, base_claim=True,
                              override=None, membership_ok=True,
                              membership_ws=WS_A, profile_status="active",
                              profile_found=True):
    """Roteia a cadeia de validação do destinatário (membership/perfil/RBAC)."""
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{target}&workspace_id=eq.{membership_ws}&status=eq.active",
        FakeResponse([{"id": f"m-{target}", "workspace_id": membership_ws,
                       "profile_id": target, "status": "active"}] if membership_ok else []),
    )
    if membership_ok:
        mem_id = f"m-{target}"
        fake_requests.route(
            "GET",
            f"memberships?profile_id=eq.{target}&select=id,role_id,status&workspace_id=eq.{membership_ws}",
            FakeResponse([{"id": mem_id, "workspace_id": membership_ws,
                           "profile_id": target, "status": "active",
                           "role_id": f"role-{target}"}]),
        )
        perms = [{"action": "ticket.view", "scope": "workspace"}]
        if base_claim:
            perms.append({"action": "ticket.claim", "scope": "workspace"})
        fake_requests.route(
            "GET",
            f"role_permissions?role_id=eq.role-{target}&select=action,scope",
            FakeResponse(perms),
        )
        if override:
            fake_requests.route(
                "GET",
                f"membership_overrides?membership_id=eq.{mem_id}&select=action,effect",
                FakeResponse([{"action": "ticket.claim", "effect": override}]),
            )
    if profile_found:
        fake_requests.route(
            "GET",
            f"profiles?id=eq.{target}&select=name,status,is_super_admin",
            FakeResponse([{"name": f"Target {target}", "status": profile_status,
                           "is_super_admin": False}]),
        )


def _route_success_patch(fake_requests, ticket_ws=WS_A):
    fake_requests.route(
        "PATCH", "chamados_tickets?id=eq.",
        FakeResponse([{"id": TICKET_ID, "workspace_id": ticket_ws,
                       "status": "aberto", "assignedToUserId": TARGET_ID,
                       "assignedTo": f"Target {TARGET_ID}"}]),
    )
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse([], status_code=201))


def _assign_body(target=TARGET_ID):
    return {"assignedToUserId": target}


# ── elegibilidade ─────────────────────────────────────────────────────────────

def test_assign_eligible_by_base_role_ok(client, fake_requests, monkeypatch):
    """Destinatário com `ticket.claim` por ROLE BASE ⇒ 200."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests)
    _route_target_eligibility(fake_requests, base_claim=True)
    _route_success_patch(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 200


def test_assign_inactive_profile_rejected(client, fake_requests, monkeypatch):
    """Perfil `status != active` ⇒ 400 e nenhuma gravação."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests)
    _route_target_eligibility(fake_requests, profile_status="suspended")
    _route_success_patch(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 400
    assert "não está ativo" in (resp.get_json().get("error") or "")
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_assign_without_ticket_claim_rejected(client, fake_requests, monkeypatch):
    """SEM `ticket.claim` (e sem override) ⇒ 400 e nenhuma gravação."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests)
    _route_target_eligibility(fake_requests, base_claim=False)
    _route_success_patch(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 400
    assert "não pode atender" in (resp.get_json().get("error") or "")
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_assign_override_allow_grants_eligibility(client, fake_requests, monkeypatch):
    """Override `allow` eleva um role SEM base ⇒ 200 (precedência RBAC 2.0)."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests)
    _route_target_eligibility(fake_requests, base_claim=False, override="allow")
    _route_success_patch(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 200


def test_assign_override_deny_removes_eligibility(client, fake_requests, monkeypatch):
    """Override `deny` rebaixa um role COM base ⇒ 400 (deny sobrepõe o role)."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests)
    _route_target_eligibility(fake_requests, base_claim=True, override="deny")
    _route_success_patch(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 400
    assert "não pode atender" in (resp.get_json().get("error") or "")
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_assign_other_workspace_rejected(client, fake_requests, monkeypatch):
    """Destinatário de OUTRO workspace ⇒ 400 (usa o workspace do CHAMADO)."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A, WS_B])
    # Chamado em WS_B; destinatário só tem membership em WS_A.
    _setup_ticket_routes(fake_requests, ticket_ws=WS_B)
    _route_target_eligibility(fake_requests, membership_ws=WS_A)
    _route_success_patch(fake_requests, ticket_ws=WS_B)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 400
    assert "não pertence ao workspace" in (resp.get_json().get("error") or "")
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_actor_without_ticket_assign_forbidden(client, fake_requests, monkeypatch):
    """Ator sem `ticket.assign` ⇒ 403 e NENHUMA consulta ao destinatário."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests, can_assign=False)
    _route_target_eligibility(fake_requests)

    resp = client.patch(f"/api/chamados/{TICKET_ID}", json=_assign_body(), headers=headers)

    assert resp.status_code == 403
    assert fake_requests.calls_for("GET", f"profiles?id=eq.{TARGET_ID}") == []
    assert fake_requests.calls_for("GET", f"memberships?profile_id=eq.{TARGET_ID}") == []
    assert fake_requests.calls_for("PATCH", "chamados_tickets") == []


def test_unassign_skips_assignee_validation(client, fake_requests, monkeypatch):
    """Remoção de responsável (ID vazio) não valida destinatário ⇒ 200."""
    headers = _setup_caller(fake_requests, monkeypatch, [WS_A])
    _setup_ticket_routes(fake_requests, current_assignee_id=TARGET_ID,
                         current_assignee_name=f"Target {TARGET_ID}")
    fake_requests.route("PATCH", "chamados_tickets?id=eq.",
                        FakeResponse([{"id": TICKET_ID, "workspace_id": WS_A,
                                       "status": "aberto", "assignedToUserId": "",
                                       "assignedTo": ""}]))
    fake_requests.route("POST", "/rest/v1/ticket_events", FakeResponse([{"id": "e1"}], status_code=201))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse([], status_code=201))

    resp = client.patch(f"/api/chamados/{TICKET_ID}",
                        json={"assignedToUserId": "", "assignedTo": ""}, headers=headers)

    assert resp.status_code == 200
    # Sem validação do destinatário: nenhum fetch de perfil do alvo.
    assert fake_requests.calls_for("GET", f"profiles?id=eq.{TARGET_ID}") == []
