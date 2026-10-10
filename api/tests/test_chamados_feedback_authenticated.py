"""Chamados — feedback AUTENTICADO (issue #370, caminho C).

O caminho público por token já existia. Esta suíte trava o SEGUNDO caminho —
`POST /api/chamados/<id>/feedback` — que o próprio solicitante usa de qualquer
dispositivo, sem o tracking token do navegador. Os dois caminhos compartilham o
núcleo `_write_chamado_feedback`, então a regra de elegibilidade (resolvido/
fechado), a validação da nota (1–5), a unicidade (409) e a atomicidade são as
mesmas. A diferença é só a PROVA de acesso:

  · público: deriva o ticket do token;
  · autenticado: exige sessão válida (`@require_auth`), membership no workspace
    do chamado e `reportedByUserId == g.user_id` — a mesma identidade de
    `mine=true`. Conhecer o id NÃO autoriza.

Os testes chamam a API DIRETO. A autorização é provada onde ela acontece (no
servidor): identidade forjada, outro dono, cross-workspace, não-concluído, nota
inválida, duplicado e corrida — cada um com a asserção de que NADA foi gravado
quando a resposta é de erro.
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
SUPABASE_SERVICE_KEY = "test-service-key"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

WS_A = "ws-campus-a"
WS_B = "ws-campus-b"
TICKET_ID = "ticket-001"

OWNER_A = "user-owner-a"
OWNER_B = "user-owner-b"


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
    """Estado por chamada: 1ª ``json()`` grava (linha), as seguintes devolvem []."""

    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.status_code = 200
        self.ok = True
        self.text = ""

    def json(self):
        return self._payloads.pop(0) if self._payloads else []


class FakeRequests:
    """Intercepta requests.* e roteia por substring da URL (first-match)."""

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
                if hasattr(response, "url"):
                    response.url = url
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
    for _name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_feedback_authenticated_api"
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
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY)
    monkeypatch.setattr(api_module, "requests", fake_requests)
    monkeypatch.setattr(api_module, "_target_subs", lambda **k: [])
    monkeypatch.setattr(api_module, "push_notify", lambda *a, **k: True)
    monkeypatch.setattr(api_module, "_cloudinary_destroy", lambda url: True)
    for name in ("auth", "rbac"):
        mod = sys.modules.get(name)
        if mod is not None:
            monkeypatch.setattr(mod, "requests", fake_requests)
            monkeypatch.setattr(mod, "_SUPABASE_URL", SUPABASE_URL)
            monkeypatch.setattr(mod, "_SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    api_module._TRACKING_RATE_STORE.clear()
    return api_module.app.test_client()


# ── helpers ──────────────────────────────────────────────────────────────────

def _profile(pid, workspaces, is_super_admin=False):
    return {
        "id": pid,
        "email": f"{pid}@test.com",
        "name": pid.upper(),
        "role": "viewer",
        "is_super_admin": is_super_admin,
        "status": "active",
        "workspace_ids": list(workspaces),
    }


def _auth(fake_requests, monkeypatch, profile):
    """Autentica como `profile`. Sem nenhuma Action RBAC — o endpoint não exige
    `ticket.view` para o dono avaliar o próprio chamado (mesmo recorte de
    `mine=true`); um 200 aqui também prova que nenhum gate RBAC foi consultado."""
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route(
        "GET", f"profiles?id=eq.{profile['id']}", FakeResponse([profile])
    )
    fake_requests.route(
        "GET",
        f"memberships?profile_id=eq.{profile['id']}&select=workspace_id",
        FakeResponse(
            [{"workspace_id": w, "status": "active"} for w in profile.get("workspace_ids") or []]
        ),
    )
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _route_owner(fake_requests, ws=WS_A, owner=OWNER_A, tid=TICKET_ID):
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{tid}&select=workspace_id,reportedByUserId",
        FakeResponse([{"workspace_id": ws, "reportedByUserId": owner}]),
    )


def _route_status(fake_requests, status="resolvido", rating=None, tid=TICKET_ID):
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{tid}&select=status,feedbackRating",
        FakeResponse([{"status": status, "feedbackRating": rating}]),
    )


def _row(**overrides):
    """Linha completa devolvida pelo PATCH (representação do Postgres)."""
    row = {
        "id": TICKET_ID,
        "workspace_id": WS_A,
        "ticketNumber": 42,
        "roomName": "Laboratório 03",
        "problemCategory": "Projetor",
        "problemDescription": "Não liga",
        "status": "resolvido",
        "priority": "normal",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "maria@test.com",
        # Campos internos: NÃO podem sair da resposta.
        "reportedByUserId": OWNER_A,
        "tracking_token_hash": "deadbeef",
        "assignedTo": "",
        "assignedToUserId": "",
        "createdAt": "2026-10-01T10:00:00Z",
        "updatedAt": "2026-10-05T10:00:00Z",
        "resolvedAt": "2026-10-05T10:00:00Z",
        "closedAt": None,
        "closedBy": "",
        "archived": False,
        "statusNote": "",
        "photos": [],
        "feedbackRating": 5,
        "feedbackComment": "Excelente",
        "feedbackAt": "2026-10-05T10:00:00Z",
        "reasonCode": None,
        "reasonLabel": None,
        "reasonNote": None,
    }
    row.update(overrides)
    return row


def _route_patch(fake_requests, response, tid=TICKET_ID):
    fake_requests.route("PATCH", f"chamados_tickets?id=eq.{tid}", response)


# ── Caminho feliz ────────────────────────────────────────────────────────────

def test_owner_avalia_o_proprio_chamado_resolvido(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="resolvido")
    _route_patch(fake_requests, FakeResponse([_row()]))

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback",
                    json={"rating": 5, "comment": "Excelente"}, headers=headers)

    assert r.status_code == 200, r.get_json()
    assert r.get_json()["ticket"]["feedbackRating"] == 5

    # A escrita é ATÔMICA e escopada ao estado elegível — o mesmo filtro do
    # caminho público, para que uma corrida entre os dois não avalie duas vezes.
    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 1
    assert "feedbackRating=is.null" in patches[0]["url"]
    assert "status=in.(resolvido,fechado)" in patches[0]["url"]

    # Projeção interna: campos internos nunca saem.
    body = r.get_json()["ticket"]
    assert "reportedByUserId" not in body
    assert "tracking_token_hash" not in body


def test_owner_avalia_chamado_fechado(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="fechado")
    _route_patch(fake_requests, FakeResponse([_row(status="fechado")]))

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 4}, headers=headers)

    assert r.status_code == 200, r.get_json()
    assert fake_requests.calls_for("PATCH", "chamados_tickets")


# ── Autorização: identidade ──────────────────────────────────────────────────

def test_sem_autenticacao_e_401(client, fake_requests):
    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5})

    assert r.status_code == 401
    assert fake_requests.calls == []


def test_dono_diferente_e_403_mesmo_sabendo_o_id(client, fake_requests, monkeypatch):
    # Caller é OWNER_A, mas o chamado pertence a OWNER_B e está na MESMA unidade.
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests, owner=OWNER_B)
    _route_status(fake_requests, status="resolvido")

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_chamado_sem_dono_e_403(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests, owner="")
    _route_status(fake_requests, status="resolvido")

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_super_admin_nao_avalia_chamado_de_outro(client, fake_requests, monkeypatch):
    """Super admin é capacidade de plataforma; NÃO substitui a posse do feedback."""
    headers = _auth(fake_requests, monkeypatch, _profile("root", [], is_super_admin=True))
    _route_owner(fake_requests, owner=OWNER_B)
    _route_status(fake_requests, status="resolvido")

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_cross_workspace_e_403(client, fake_requests, monkeypatch):
    # Chamado em WS_B; o chamador só tem WS_A.
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests, ws=WS_B, owner=OWNER_A)
    _route_status(fake_requests, status="resolvido")

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_chamado_inexistente_e_404(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    fake_requests.route(
        "GET",
        f"chamados_tickets?id=eq.{TICKET_ID}&select=workspace_id,reportedByUserId",
        FakeResponse([]),
    )

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 404
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


# ── Elegibilidade de estado ──────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["aberto", "a_caminho", "em_atendimento", "em_espera", "indeferido"])
def test_estado_nao_concluido_e_403(client, fake_requests, monkeypatch, status):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status=status)

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 403
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_ja_avaliado_e_409_sem_escrita(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="fechado", rating=4)

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 3}, headers=headers)

    assert r.status_code == 409
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


# ── Validação da nota / comentário ───────────────────────────────────────────

@pytest.mark.parametrize("rating", [0, 6, -1, "x", None, 2.5, 5.0001])
def test_nota_invalida_e_400_sem_escrita(client, fake_requests, monkeypatch, rating):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="resolvido")

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": rating}, headers=headers)

    assert r.status_code == 400, (rating, r.get_json())
    assert not fake_requests.calls_for("PATCH", "chamados_tickets")


def test_comentario_truncado_em_500(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="resolvido")
    _route_patch(fake_requests, FakeResponse([_row()]))

    r = client.post(
        f"/api/chamados/{TICKET_ID}/feedback",
        json={"rating": 5, "comment": "x" * 600},
        headers=headers,
    )

    assert r.status_code == 200
    sent = fake_requests.calls_for("PATCH", "chamados_tickets")[0]["kwargs"]["json"]
    assert len(sent["feedbackComment"]) == 500


# ── Atomicidade / corrida ────────────────────────────────────────────────────

def test_corrida_primeira_grava_segunda_409(client, fake_requests, monkeypatch):
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    # As DUAS leituras de estado veem feedbackRating=None (estado pré-escrita);
    # o PATCH condicional só deixa a primeira gravar.
    _route_status(fake_requests, status="resolvido", rating=None)
    _route_patch(fake_requests, SequenceResponse([[_row()], []]))

    first = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)
    second = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 1}, headers=headers)

    assert first.status_code == 200, first.get_json()
    assert second.status_code == 409, second.get_json()

    patches = fake_requests.calls_for("PATCH", "chamados_tickets")
    assert len(patches) == 2
    for call in patches:
        assert "feedbackRating=is.null" in call["url"]
        assert "status=in.(resolvido,fechado)" in call["url"]


def test_reaberto_entre_leitura_e_escrita_e_409(client, fake_requests, monkeypatch):
    """O estado é revalidado NA MESMA escrita: 0 linhas ⇒ 409, nunca sucesso falso."""
    headers = _auth(fake_requests, monkeypatch, _profile(OWNER_A, [WS_A]))
    _route_owner(fake_requests)
    _route_status(fake_requests, status="resolvido")
    # PATCH devolve [] — o filtro de status deixou de casar (reaberto) OU outra
    # gravação venceu. Nenhuma das hipóteses pode virar 200.
    _route_patch(fake_requests, FakeResponse([]))

    r = client.post(f"/api/chamados/{TICKET_ID}/feedback", json={"rating": 5}, headers=headers)

    assert r.status_code == 409
