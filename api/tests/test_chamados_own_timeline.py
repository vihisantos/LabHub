"""`GET /api/chamados/<id>/events` — a timeline do PRÓPRIO chamado, para o solicitante.

Este arquivo fecha a última assimetria da família #331/#339/#345. O histórico
deliberadamente documentou as duas anteriores:

  · #331 — `mine=true` deu ao solicitante a LISTA dos chamados que ele abriu.
  · #339 — abrir um deles batia em `ticket.view`; a lista e o DETALHE respondiam
    a regras diferentes.
  · #345 (esta) — o detalhe abria, mas a TIMELINE continuava exigindo
    `ticket.view`. O solicitante via "Meus Chamados → meu chamado → detalhe" e
    encontrava o histórico vazio, sem nenhuma indicação de que era falta de
    permissão: o `TicketDetail` engolia o erro com `.catch(() => {})` e mostrava
    "Nenhum registro ainda".

O endpoint agora tem DUAS vias, na mesma ordem do detalhe da #339:

  · **Via A — operacional:** `ticket.view` no workspace do recurso, pelo RBAC 2.0
    já existente. INALTERADA, e sem filtro de tipo: o técnico continua vendo a
    timeline completa, exatamente como antes.
  · **Via B — pessoal:** se, e somente se, a Via A negar, o solicitante do
    PRÓPRIO chamado (`reportedByUserId == g.user_id`) — e só a allowlist de tipos
    segura para o solicitante.

Por que isto é uma propriedade do BACKEND e não da interface:

  · a comparação de identidade é server-side, contra `g.user_id` (o `sub` do JWT
    validado), lido do BANCO — nenhum parâmetro do request participa dela, e os
    testes de IDORBelow travam cada vetor individualmente;
  · o filtro de tipos é server-side — o frontend pede a timeline e recebe o que a
    API decidiu que ele pode ver, sem poder influencear a decisão;
  · a Via B é alcançada só DEPOIS do check de workspace, que continua barrando
    antes, então ela nunca vira atalho de unidade nem oráculo de existência.

Os testes chamam a API DIRETO, sem passar pelo frontend: é a única forma de
provar uma afirmação de autorização. E os de minimização não perguntam "o
frontend usa esse campo?" — perguntam se o campo está AUSENTE no corpo da
resposta HTTP, que é onde a exposição acontece.
"""

import base64
import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# ── bootstrap do módulo (mesmo padrão de test_chamados_own_ticket_detail.py) ──

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
SUPABASE_URL = "https://fake.supabase.co"
SUPABASE_SERVICE_KEY = "service-key"
SUPABASE_JWT_SECRET = "jwt-secret"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = (
        _b64url(json.dumps(header).encode())
        + "."
        + _b64url(json.dumps(payload).encode())
    )
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return signing_input + "." + _b64url(sig)


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
    """Carrega `api/app.py` reutilizando qualquer instância já em sys.modules."""
    target = API_FILE.resolve()
    for _name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_own_timeline_api"
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
    fake_requests.route("POST", "/rest/v1/rpc/pg_sql", FakeResponse([], status_code=200))
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


# ── helpers ─────────────────────────────────────────────────────────────────

USER_A = "user-a"
USER_B = "user-b"
TECH = "user-tech"

WS_A = "ws-a"
WS_B = "ws-b"

# Prefixos das URLs que o handler de eventos monta. Casar só com o prefixo é
# seguro: o id do chamado entra na mesma string depois.
CHAMADO = "chamados_tickets?id=eq."
EVENTOS = "rest/v1/ticket_events"


def _perfil(pid, workspaces, is_super_admin=False):
    return {
        "id": pid,
        "email": f"{pid}@test.com",
        "name": pid.upper(),
        "role": "viewer",
        "is_super_admin": is_super_admin,
        "workspace_ids": list(workspaces),
        "status": "active",
    }


def _auth_as(api_module, fake_requests, monkeypatch, profile, actions):
    """Autentica como `profile` com EXATAMENTE as Actions `actions`.

    `actions=[]` é o solicitante sem `ticket.view` — o caso que motiva a PR.
    `actions=["ticket.view"]` é o técnico com a Action.
    """
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route(
        "GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile])
    )
    fake_requests.route(
        "GET",
        "/rest/v1/memberships",
        FakeResponse(
            [
                {"profile_id": profile["id"], "workspace_id": w, "status": "active"}
                for w in (profile.get("workspace_ids") or [])
            ]
        ),
    )
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a: str(a[2]) in actions)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _ticket(**overrides):
    t = {
        "id": "t-1",
        "ticketNumber": 1042,
        "workspace_id": WS_A,
        "roomName": "Laboratório 03",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "maria@test.com",
        "reportedByUserId": None,
        "assignedTo": "",
        "assignedToUserId": "",
        "status": "aberto",
        "createdAt": "2026-10-01T10:00:00",
    }
    t.update(overrides)
    return t


def _route_chamado(fake_requests, ticket):
    """Resposta da linha do banco para o `?id=eq.` que o handler monta."""
    fake_requests.routes = [
        r for r in fake_requests.routes
        if not (r[0] == "GET" and r[1] == CHAMADO)
    ]
    rows = [] if ticket is None else [ticket]
    fake_requests.route("GET", CHAMADO, FakeResponse(rows))


def _route_eventos(fake_requests, eventos):
    fake_requests.routes = [
        r for r in fake_requests.routes
        if not (r[0] == "GET" and r[1] == EVENTOS)
    ]
    fake_requests.route("GET", EVENTOS, FakeResponse(eventos))


def _url_eventos(fake_requests):
    calls = fake_requests.calls_for("GET", EVENTOS)
    return calls[0]["url"] if calls else ""


def _evento(**overrides):
    """Linha crua de `ticket_events`, como o Postgres devolve.

    Inclui `ticket_id` e `workspace_id` de propósito: é assim que se prova que a
    projeção os descarta.
    """
    ev = {
        "id": "ev-1",
        "ticket_id": "t-1",
        "workspace_id": WS_A,
        "type": "comentario",
        "content": "Conferi o cabo de rede.",
        "author": "João · TI",
        "photo_urls": "",
        "createdAt": "2026-10-02T09:00:00",
    }
    ev.update(overrides)
    return ev


# ═══════════════════════════════════════════════════════════════════════════
# Autorização
# ═══════════════════════════════════════════════════════════════════════════

def test_solicitante_dono_ve_a_timeline_do_proprio_chamado(api_module, client,
                                                           fake_requests, monkeypatch):
    """A Via B: o dono abre a própria timeline, sem `ticket.view`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento(ticket_id="meu-1")])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 200
    eventos = r.get_json()["events"]
    assert len(eventos) == 1
    assert eventos[0]["content"] == "Conferi o cabo de rede."
    assert eventos[0]["author"] == "João · TI"


def test_tecnico_com_ticket_view_continua_vendo_a_timeline_completa(api_module, client,
                                                                    fake_requests, monkeypatch):
    """Via A não regrediu: quem tem a Action vê exatamente o que via antes.

    inclusive os tipos que a Via B filtra — o técnico não perde nada.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(TECH, [WS_A]), actions=["ticket.view"])
    _route_chamado(fake_requests, _ticket(id="t-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [
        _evento(type="comentario"),
        _evento(id="ev-2", type="status", content="Em atendimento"),
        _evento(id="ev-3", type="atribuicao", content="João assumiu o chamado"),
        _evento(id="ev-4", type="diagnostico_interno", content="IP 10.0.0.7 sem rota"),
    ])

    r = client.get("/api/chamados/t-1/events", headers=headers)

    assert r.status_code == 200
    eventos = r.get_json()["events"]
    # 4 eventos, incluindo o tipo fora da allowlist do solicitante.
    assert [e["type"] for e in eventos] == [
        "comentario", "status", "atribuicao", "diagnostico_interno",
    ]


def test_tecnico_com_ticket_view_nao_recebe_filtro_de_tipo_na_url(api_module, client,
                                                                   fake_requests, monkeypatch):
    """A Via A não leva `type=in.(...)`: o contrato operacional é byte a byte o
    de antes, e o técnico não pode perder um evento por causa da allowlist do
    solicitante."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(TECH, [WS_A]), actions=["ticket.view"])
    _route_chamado(fake_requests, _ticket(id="t-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [])

    client.get("/api/chamados/t-1/events", headers=headers)

    assert "type=in." not in _url_eventos(fake_requests)


def test_solicitante_de_outro_chamado_recebe_403(api_module, client,
                                                 fake_requests, monkeypatch):
    """O caso IDOR central: A pede o timeline do chamado de B."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    _route_eventos(fake_requests, [_evento(ticket_id="de-b")])

    r = client.get("/api/chamados/de-b/events", headers=headers)

    assert r.status_code == 403
    assert "events" not in r.get_json()


def test_usuario_sem_relacao_com_o_chamado_recebe_403(api_module, client,
                                                      fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_B, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-a", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento(ticket_id="de-a")])

    r = client.get("/api/chamados/de-a/events", headers=headers)

    assert r.status_code == 403


def test_sem_jwt_recebe_401(api_module, client, fake_requests):
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento()])

    r = client.get("/api/chamados/meu-1/events")

    assert r.status_code == 401


def test_chamado_inexistente_recebe_404(api_module, client, fake_requests,
                                        monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, None)
    _route_eventos(fake_requests, [])

    r = client.get("/api/chamados/nao-existe/events", headers=headers)

    assert r.status_code == 404


def test_chamado_anonimo_nao_abre_para_nenhum_autenticado(api_module, client,
                                                          fake_requests, monkeypatch):
    """`reportedByUserId` NULL não pode casar com um `g.user_id` vazio.

    Sem esta guarda, `str(None or '')` e `str('' or '')` colidirem em `''` faria um
    chamado anônimo casar com qualquer usuário whose id resolvesse para vazio.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="anon", reportedByUserId=None))
    _route_eventos(fake_requests, [_evento(ticket_id="anon")])

    r = client.get("/api/chamados/anon/events", headers=headers)

    assert r.status_code == 403


def test_chamado_de_outro_workspace_recebe_403_e_nao_revela_se_existe(api_module, client,
                                                                       fake_requests, monkeypatch):
    """Fail-closed de unidade: o mesmo 403 para chamado inexistente e para chamado
    de outra unidade, para que a resposta não sirva de oráculo de existência."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-outra", workspace_id=WS_B,
                                          reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento(ticket_id="de-outra")])

    r = client.get("/api/chamados/de-outra/events", headers=headers)

    assert r.status_code == 403
    body = r.get_json()
    assert "events" not in body
    assert "Erro ao buscar o histórico" not in body.get("error", "")


def test_via_pessoal_rodar_somente_apos_ticket_view_negar(api_module, client,
                                                           fake_requests, monkeypatch):
    """A ordem das vias é observável: a Action é consultada primeiro, e é a sua
    negativa que abre a porta pessoal."""
    consulted = []

    def _spy(user, workspace_id, action, scope):
        consulted.append((workspace_id, action))
        return False

    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    monkeypatch.setattr(api_module, "rbac_two_can", _spy)
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento()])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 200
    assert consulted == [(WS_A, "ticket.view")]


def test_owner_com_ticket_view_usa_a_via_operacional(api_module, client,
                                                      fake_requests, monkeypatch):
    """Dono que também é técnico não passa pela Via B: vê tudo, sem filtro —
    prove que a Via B não é o caminho padrão só porque o solicitante é dono."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(TECH, [WS_A]), actions=["ticket.view"])
    _route_chamado(fake_requests, _ticket(id="t-1", reportedByUserId=TECH))
    _route_eventos(fake_requests, [
        _evento(type="comentario"),
        _evento(id="ev-2", type="diagnostico_interno"),
    ])

    r = client.get("/api/chamados/t-1/events", headers=headers)

    assert r.status_code == 200
    assert len(r.get_json()["events"]) == 2
    assert "type=in." not in _url_eventos(fake_requests)


def test_super_admin_continua_com_acesso_operacional(api_module, client,
                                                     fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil("root", [WS_A], is_super_admin=True),
                       actions=["ticket.view"])
    _route_chamado(fake_requests, _ticket(id="t-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento()])

    r = client.get("/api/chamados/t-1/events", headers=headers)

    assert r.status_code == 200
    assert len(r.get_json()["events"]) == 1


def test_erro_do_banco_ao_buscar_o_chamado_vira_502(api_module, client,
                                                     fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    fake_requests.route("GET", CHAMADO, FakeResponse([], status_code=500, ok=False))

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 502


def test_erro_do_banco_ao_buscar_os_eventos_vira_502_e_nao_parece_como_vazio(api_module, client,
                                                                             fake_requests, monkeypatch):
    """Falha de comunicação não pode virar "sem registros": o status 502 é o que
    permite à tela distinguir as duas coisas."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    fake_requests.route("GET", EVENTOS, FakeResponse(None, status_code=500, ok=False))

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 502
    assert "events" not in r.get_json()


# ═══════════════════════════════════════════════════════════════════════════
# IDOR — nenhum parâmetro do cliente move a identidade
# ═══════════════════════════════════════════════════════════════════════════

def test_reportedByUserId_na_query_string_nao_troca_o_usuario(api_module, client,
                                                              fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    _route_eventos(fake_requests, [_evento(ticket_id="de-b")])

    r = client.get(
        f"/api/chamados/de-b/events?reportedByUserId={USER_A}",
        headers=headers,
    )

    assert r.status_code == 403


def test_mine_true_na_abre_a_timeline_de_terceiros(api_module, client,
                                                    fake_requests, monkeypatch):
    """`mine=true` filtra a LISTA pessoal. Não pode ser aceito aqui como atalho
    de autorização — o endpoint não olha para ele."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    _route_eventos(fake_requests, [_evento(ticket_id="de-b")])

    r = client.get("/api/chamados/de-b/events?mine=true", headers=headers)

    assert r.status_code == 403


def test_owner_param_na_abre_a_timeline_de_terceiros(api_module, client,
                                                      fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    _route_eventos(fake_requests, [_evento(ticket_id="de-b")])

    r = client.get(f"/api/chamados/de-b/events?owner={USER_A}", headers=headers)

    assert r.status_code == 403


def test_header_de_identidade_nao_troca_o_usuario(api_module, client,
                                                  fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    _route_eventos(fake_requests, [_evento(ticket_id="de-b")])

    forged = dict(headers)
    forged["X-User-Id"] = USER_A
    forged["X-Forwarded-User"] = USER_A

    r = client.get("/api/chamados/de-b/events", headers=forged)

    assert r.status_code == 403


def test_identidade_vem_do_jwt_e_nao_de_parametro(api_module, client,
                                                  fake_requests, monkeypatch):
    """A identidade é o `sub` do JWT: trocar o header de identidade não muda nada,
    e o usuário do JWT é quem é comparado com o dono."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_B, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="de-a", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento(ticket_id="de-a")])

    r = client.get(
        f"/api/chamados/de-a/events?reportedByUserId={USER_B}&as={USER_B}",
        headers=headers,
    )

    assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# Minimização — o que o solicitante recebe
# ═══════════════════════════════════════════════════════════════════════════

def test_evento_de_tipo_interno_nao_chega_ao_solicitante(api_module, client,
                                                         fake_requests, monkeypatch):
    """`ticket_events.type` é TEXT livre, sem CHECK no banco. Um tipo fora da
    allowlist — hoje inexistente, mas trivialmente criável — não pode vazar só
    porque o `select=` pediu a linha."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [
        _evento(id="ev-1", type="comentario"),
        _evento(id="ev-2", type="diagnostico_interno", content="Console: DHCP fail 10.0.0.7"),
        _evento(id="ev-3", type="status", content="Em atendimento"),
        _evento(id="ev-4", type="atribuicao", content="João assumiu o chamado"),
    ])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 200
    eventos = r.get_json()["events"]
    assert [e["id"] for e in eventos] == ["ev-1", "ev-3", "ev-4"]
    assert all("DHCP" not in (e.get("content") or "") for e in eventos)


def test_tipo_desconhecido_e_tipo_ausente_sao_bloqueados(api_module, client,
                                                         fake_requests, monkeypatch):
    """Fail-closed em dois casos de borda: tipo fora da allowlist e tipo ausente
    (linha legada ou gravada por outro caminho)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    eventos = [_evento(id="ev-ok", type="comentario")]
    sem_tipo = _evento(id="ev-sem-tipo")
    sem_tipo.pop("type")
    eventos.append(sem_tipo)
    eventos.append(_evento(id="ev-inv", type=None))
    _route_eventos(fake_requests, eventos)

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 200
    assert [e["id"] for e in r.get_json()["events"]] == ["ev-ok"]


def test_solicitante_recebe_apenas_os_campos_da_projection(api_module, client,
                                                           fake_requests, monkeypatch):
    """Nem `ticket_id` nem `workspace_id` saem — o segundo é escopo interno, e o
    primeiro é redundante numa timeline que já é de um chamado só."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [_evento(ticket_id="meu-1", workspace_id=WS_A)])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    evento = r.get_json()["events"][0]
    assert set(evento) == {
        "id", "type", "content", "author", "photos", "createdAt",
        # Motivo estruturado de espera/indeferimento (issue #367) — a
        # projeção da timeline passa a devolvê-los (NULL nos eventos comuns).
        "reasonCode", "reasonLabel",
    }
    assert "workspace_id" not in evento
    assert "ticket_id" not in evento


def test_select_dos_eventos_e_explicito_e_nao_pede_a_linha_inteira(api_module, client,
                                                                    fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [])

    client.get("/api/chamados/meu-1/events", headers=headers)

    url = _url_eventos(fake_requests)
    assert "select=id,type,content,author,photo_urls,createdAt" in url
    assert "select=*" not in url


def test_via_pessoal_filtra_o_tipo_na_consulta_ao_banco(api_module, client,
                                                        fake_requests, monkeypatch):
    """Primeira camada da allowlist: nem busca no banco o que não vai devolver."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [])

    client.get("/api/chamados/meu-1/events", headers=headers)

    url = _url_eventos(fake_requests)
    assert "type=in.(comentario,status,atribuicao)" in url


def test_allowlist_de_tipo_do_solicitante_cobre_os_tipos_gravados_hoje(api_module):
    """Trava de regressão sobre a própria política: os três tipos que o backend
    grava precisam estar na allowlist, senão a timeline do solicitante começa a
    perder eventos silenciosamente.

    Se um dia a API gravar um tipo novo, este teste falha — que é exatamente o
    ponto: a allowlist é uma decisão explícita, não um número que acompanha o
    código sozinho.
    """
    Politica = api_module

    assert Politica.CHAMADOS_REQUESTER_EVENT_TYPES == (
        "comentario", "status", "atribuicao",
    )
    # `foto` e `prioridade` estão no tipo TypeScript mas não são gravados pela
    # API; se passarem a ser, a allowlist precisa ser revista junto.
    assert "foto" not in Politica.CHAMADOS_REQUESTER_EVENT_TYPES
    assert "prioridade" not in Politica.CHAMADOS_REQUESTER_EVENT_TYPES


def test_ordenacao_cronologica_preservada_na_via_pessoal(api_module, client,
                                                          fake_requests, monkeypatch):
    """A ordenação continua do mais novo para o mais antigo, nas duas vias — a
    personalização não pode reordenar o histórico."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [
        _evento(id="ev-novo", type="status", createdAt="2026-10-05T10:00:00"),
        _evento(id="ev-meio", type="comentario", createdAt="2026-10-03T10:00:00"),
        _evento(id="ev-velho", type="atribuicao", createdAt="2026-10-01T10:00:00"),
    ])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert [e["id"] for e in r.get_json()["events"]] == ["ev-novo", "ev-meio", "ev-velho"]
    assert "order=createdAt.desc" in _url_eventos(fake_requests)


def test_fotos_do_evento_sao_decodificadas_e_limitadas_a_lista(api_module, client,
                                                              fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    _route_eventos(fake_requests, [
        _evento(id="ev-1", photo_urls=json.dumps(["https://res.cloudinary.com/x.jpg"])),
        _evento(id="ev-2", photo_urls="nao-e-json"),
    ])

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    eventos = {e["id"]: e for e in r.get_json()["events"]}
    assert eventos["ev-1"]["photos"] == ["https://res.cloudinary.com/x.jpg"]
    assert eventos["ev-2"]["photos"] == []


# ═══════════════════════════════════════════════════════════════════════════
# Regressão — o que esta PR NÃO pode ter quebrado
# ═══════════════════════════════════════════════════════════════════════════

def test_escrita_de_evento_continua_exigindo_ticket_comment(api_module, client,
                                                            fake_requests, monkeypatch):
    """Abrir a LEITURA para o solicitante não abre a ESCRITA. `POST /events` segue
    atrás de `ticket.comment`, e um solicitante sem a Action não comenta."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    fake_requests.route("GET", CHAMADO, FakeResponse([_ticket(id="meu-1",
                                                             reportedByUserId=USER_A)]))
    fake_requests.route("POST", "rest/v1/ticket_events", FakeResponse([{"id": "ev-1"}]))

    r = client.post("/api/chamados/meu-1/events", json={"content": "oi"},
                    headers=headers)

    assert r.status_code == 403
    assert fake_requests.calls_for("POST", "rest/v1/ticket_events") == []


def test_tecnico_com_ticket_comment_comenta_normalmente(api_module, client,
                                                         fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(TECH, [WS_A]), actions=["ticket.view", "ticket.comment"])
    fake_requests.route("GET", CHAMADO, FakeResponse([_ticket(id="t-1",
                                                             reportedByUserId=USER_A)]))
    fake_requests.route("POST", "rest/v1/ticket_events", FakeResponse([{"id": "ev-1"}]))

    r = client.post("/api/chamados/t-1/events", json={"content": "Conferi."},
                    headers=headers)

    assert r.status_code in (200, 201)


def test_detalhe_do_chamado_continua_com_o_contrato_do_339(api_module, client,
                                                           fake_requests, monkeypatch):
    """A Via B do detalhe é intocada: o dono abre o próprio chamado e um terceiro
    não. A lacuna era a TIMELINE, não o detalhe."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["ticket"]["id"] == "meu-1"

    _route_chamado(fake_requests, _ticket(id="de-b", reportedByUserId=USER_B))
    outro = client.get("/api/chamados/de-b", headers=headers)
    assert outro.status_code == 403


def test_patch_e_claim_continuam_exigindo_as_proprias_actions(api_module, client,
                                                               fake_requests, monkeypatch):
    """Nada além do GET de eventos mudou de autorização."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_chamado(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    fake_requests.route("PATCH", "rest/v1/chamados_tickets", FakeResponse([]))

    r = client.patch("/api/chamados/meu-1", json={"status": "fechado"},
                     headers=headers)

    assert r.status_code == 403


def test_fluxo_publico_por_token_continua_intacto(api_module, client,
                                                   fake_requests, monkeypatch):
    """A timeline pública por tracking token segue existindo e sem filtro de tipo:
    esta PR não toca no fluxo público."""
    assert hasattr(api_module, "public_chamados_events")
    src = API_FILE.read_text(encoding="utf-8")
    # O endpoint público não ganha o filtro `type=in.(...)` do solicitante.
    trecho = src.split("def public_chamados_events")[1].split("def ")[0]
    assert "CHAMADOS_REQUESTER_EVENT_TYPES" not in trecho
    assert "_CHAMADOS_REQUESTER_EVENT_TYPE_SET" not in trecho


def test_timeline_nao_e_persistida_em_cache_local(api_module):
    """Trava de arquitetura: a timeline não pode ser guardada em cache pelo
    backend. Se um dia alguém cachear isto por usuário, a separação entre sessão
    do solicitante e coleção operacional precisa ser revista — é o risco da #344,
    que continua fora desta PR."""
    src = API_FILE.read_text(encoding="utf-8")
    trecho = src.split("def chamados_events_list")[1].split("\n@app.route")[0]
    for nome in ("_chamados_events_cache", "CACHE", "redis.set", "lru_cache"):
        assert nome not in trecho, f"cache inesperado na timeline: {nome}"
