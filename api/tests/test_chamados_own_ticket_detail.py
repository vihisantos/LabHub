"""`GET /api/chamados/<id>` — acesso ao detalhe do PRÓPRIO chamado, decidido no servidor.

Por que este arquivo existe: o `mine=true` (#331) já dava ao solicitante a
LISTA dos chamados que ele abriu, sem `ticket.view`. Abrir um deles, porém, batia
em `GET /api/chamados/<id>`, que exigia `ticket.view` — a lista e o detalhe
respondam a regras diferentes, e o solicitante conseguia ver a lista e não o
chamado. Este arquivo fecha essa assimetria.

A regra agora tem DUAS vias, nesta ordem:

  · **Via A — operacional:** `ticket.view` no workspace do recurso, pelo
    mecanismo RBAC 2.0 já existente. Inalterada: quem tem a Action continua
    vendo os chamados da sua unidade, exatamente como antes.
  · **Via B — pessoal:** se, e somente se, a Via A negar, o solicitante do
    PRÓPRIO chamado lê o detalhe (`reportedByUserId == g.user_id`).

O que estes testes existem para provar:

  · a Via B não vira IDOR — A não abre o chamado de B, e nenhum parâmetro do
    cliente (`reportedByUserId`, query string, body) move a identidade;
  · a Via B não atravessa workspace — ela só é alcançada DEPOIS do check de
    unidade, que continua barrando antes;
  · a Via B não depende de status — aberto, em atendimento, resolvido, fechado e
    arquivado respondem igual;
  · a Via A não regrediu — técnico com `ticket.view` continua operando igual, e
    a resposta de quem não pode nada segue a convenção que já existia (404 para
    inexistente, 403 para inacessível), sem vazar existência nem metadados.

Os testes chamam a API DIRETO, sem passar pelo frontend: é a única forma de
provar uma afirmação de autorização.
"""

import base64
import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# ── bootstrap do módulo (mesmo padrão de test_chamados_mine_scope.py) ─────────

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
    """Carrega `api/app.py` reutilizando qualquer instância já em sys.modules.

    Mesma estratégia dos demais arquivos de auth: reexecutar o módulo depois da
    primeira requisição falha no Flask (`_check_setup_finished`).
    """
    target = API_FILE.resolve()
    for _name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_own_detail_api"
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

WS_A = "ws-a"
WS_B = "ws-b"

# `chamados_tickets?id=eq.` é a URL que o handler monta para o detalhe. O sufixo
# do id entra na mesma string, então casar só com o prefixo é seguro.
DETALHE = "chamados_tickets?id=eq."


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

    `actions=[]` reproduz o solicitante sem `ticket.view` — o caso que motiva
    esta PR. `actions=["ticket.view"]` reproduz o técnico com a Action.
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
        "assetName": "Notebook Dell",
        "problemCategory": "Computador",
        "problemDescription": "Não liga",
        "status": "aberto",
        "priority": "normal",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "maria@test.com",
        "reportedByUserId": None,
        "assignedTo": "",
        "assignedToUserId": "",
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "createdAt": "2026-10-01T10:00:00",
        "updatedAt": "2026-10-05T08:42:00",
        "resolvedAt": None,
        "statusNote": "",
    }
    t.update(overrides)
    return t


def _route_detalhe(fake_requests, ticket):
    """Manda a linha do banco para o `?id=eq.` do handler.

    Substitui a rota anterior do detalhe (sem tocar nas rotas de auth), para que
    um mesmo teste possa trocar a resposta sem re-autenticar.
    """
    fake_requests.routes = [
        r for r in fake_requests.routes
        if not (r[0] == "GET" and r[1] == DETALHE)
    ]
    rows = [] if ticket is None else [ticket]
    fake_requests.route("GET", DETALHE, FakeResponse(rows))


def _url_do_detalhe(fake_requests):
    calls = fake_requests.calls_for("GET", DETALHE)
    return calls[0]["url"] if calls else ""


# ── Caso A — o próprio chamado, sem `ticket.view` (o motivo da PR) ────────────

def test_proprio_chamado_sem_ticket_view_retorna_200(api_module, client,
                                                     fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 200
    ticket = r.get_json()["ticket"]
    assert ticket["id"] == "meu-1"
    # Devolve o registro real, não uma projeção reducida.
    assert ticket["roomName"] == "Laboratório 03"
    assert ticket["ticketNumber"] == 1042


def test_proprio_chamado_nao_exige_ticket_view_no_rbac(api_module, client,
                                                       fake_requests, monkeypatch):
    """A Via B só roda DEPOIS do `ticket.view` negar — a Action continua sendo
    consultada, e é a sua negativa que abre a porta pessoal."""
    consulted = []

    def _spy(user, workspace_id, action, scope):
        consulted.append((workspace_id, action))
        return False

    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    monkeypatch.setattr(api_module, "rbac_two_can", _spy)
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 200
    assert consulted == [(WS_A, "ticket.view")]


# ── Caso B — chamado de outro usuário, sem `ticket.view` (IDOR) ───────────────

def test_chamado_de_outro_usuario_negado(api_module, client, fake_requests,
                                         monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))

    r = client.get("/api/chamados/dele", headers=headers)

    assert r.status_code == 403
    assert "ticket" not in r.get_json()


def test_idor_nos_dois_sentidos(api_module, client, fake_requests, monkeypatch):
    """A e B cada um com membership na mesma unidade: nenhum abre o do outro."""
    for caller, outro, tid in ((USER_A, USER_B, "b-1"), (USER_B, USER_A, "a-1")):
        api_module._rate_limit_store.clear()
        fake_requests.routes.clear()
        headers = _auth_as(api_module, fake_requests, monkeypatch,
                           _perfil(caller, [WS_A]), actions=[])
        _route_detalhe(fake_requests, _ticket(id=tid, reportedByUserId=outro))

        r = client.get(f"/api/chamados/{tid}", headers=headers)

        assert r.status_code == 403, f"{caller} leu o chamado de {outro}"
        assert "ticket" not in r.get_json()


def test_chamado_anonimo_negado_para_usuario_autenticado(api_module, client,
                                                         fake_requests, monkeypatch):
    """`reportedByUserId` NULL nunca casa com o chamador. É a guarda que impede
    `str(None or '')` de colidir com um `g.user_id` vazio."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="anon", reportedByUserId=None))

    r = client.get("/api/chamados/anon", headers=headers)

    assert r.status_code == 403
    assert "ticket" not in r.get_json()


def test_chamado_anterior_a_migration_056_sem_dono_negado(api_module, client,
                                                          fake_requests, monkeypatch):
    """Chamado criado antes da 056 não tem backfill: sem dono, sem acesso pessoal."""
    ticket = _ticket(id="antigo", reportedByUserId=USER_A)
    ticket.pop("reportedByUserId")  # coluna ausente, como veio do Postgres
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, ticket)

    r = client.get("/api/chamados/antigo", headers=headers)

    assert r.status_code == 403


# ── Caso C / G — usuário com `ticket.view` (regressão positiva) ──────────────

def test_tecnico_com_ticket_view_acessa_chamado_de_outro_usuario(api_module, client,
                                                                fake_requests,
                                                                monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=["ticket.view"])
    _route_detalhe(fake_requests, _ticket(id="fila-1", reportedByUserId=USER_B))

    r = client.get("/api/chamados/fila-1", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["ticket"]["id"] == "fila-1"


def test_tecnico_com_ticket_view_acessa_o_proprio_tambem(api_module, client,
                                                        fake_requests, monkeypatch):
    """Duas vias compatíveis: quem tem a Action não muda de caminho."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=["ticket.view"])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["ticket"]["id"] == "meu-1"


def test_tecnico_com_ticket_view_de_outra_unidade_continua_negado(api_module, client,
                                                                 fake_requests,
                                                                 monkeypatch):
    """A Action vale no workspace do recurso. O check de unidade vem antes de
    qualquer coisa e não foi tocado."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=["ticket.view"])
    _route_detalhe(fake_requests, _ticket(id="w-b", workspace_id=WS_B,
                                          reportedByUserId=USER_A))

    r = client.get("/api/chamados/w-b", headers=headers)

    assert r.status_code == 403
    assert r.get_json()["error"] == "Acesso negado a este chamado"


# ── Caso D — isolamento entre workspaces ────────────────────────────────────

def test_acesso_personal_nao_atravessa_workspace(api_module, client, fake_requests,
                                                 monkeypatch):
    """O dono é o próprio usuário, mas o chamado é de outra unidade: barrado.

    Prova de que a Via B fica DEPOIS do check de workspace — se viesse antes, o
    dono passaria e este teste falharia.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="w-b", workspace_id=WS_B,
                                          reportedByUserId=USER_A))

    r = client.get("/api/chamados/w-b", headers=headers)

    assert r.status_code == 403
    assert "ticket" not in r.get_json()


def test_acesso_personal_nao_atravessa_workspace_de_outro_dono(api_module, client,
                                                               fake_requests,
                                                               monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="w-b", workspace_id=WS_B,
                                          reportedByUserId=USER_B))

    r = client.get("/api/chamados/w-b", headers=headers)

    assert r.status_code == 403


def test_sem_membership_o_acesso_personal_nao_existe(api_module, client,
                                                     fake_requests, monkeypatch):
    """Usuário sem membership ativa não tem `user_ws_ids`; o check de unidade
    barra antes da Via B, mesmo sendo o dono."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, []), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 403
    assert r.get_json()["error"] == "Acesso negado a este chamado"


def test_chamado_sem_workspace_negado(api_module, client, fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="sem-ws", workspace_id=None,
                                          reportedByUserId=USER_A))

    r = client.get("/api/chamados/sem-ws", headers=headers)

    assert r.status_code == 403
    assert r.get_json()["error"] == "Acesso negado a este chamado"


# ── Caso E — anônimo ────────────────────────────────────────────────────────

def test_sem_jwt_retorna_401(api_module, client, fake_requests, monkeypatch):
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.get("/api/chamados/meu-1")

    assert r.status_code == 401
    assert "ticket" not in r.get_json()


def test_sem_jwt_nao_bate_no_banco(api_module, client, fake_requests, monkeypatch):
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    client.get("/api/chamados/meu-1")

    assert fake_requests.calls_for("GET", DETALHE) == []


def test_fluxo_publico_por_tracking_token_continua_separado(api_module, client,
                                                             fake_requests,
                                                             monkeypatch):
    """O caminho anônimo é o de tracking token, em `/api/public/chamados/...`, e
    não passa por esta rota nem por `g.user_id`. Nada dele foi tocado."""
    assert any(
        "chamados" in str(rule) and "public" in str(rule)
        for rule in api_module.app.url_map.iter_rules()
    ), "rota pública de chamados ausente"


# ── Caso F — status não interfere ────────────────────────────────────────────

@pytest.mark.parametrize(
    "status,archived,extra",
    [
        ("aberto", False, {}),
        ("a_caminho", False, {}),
        ("em_atendimento", False, {}),
        ("resolvido", False, {"resolvedAt": "2026-10-05T10:00:00"}),
        ("fechado", True, {"closedAt": "2026-10-05T11:00:00", "closedBy": "Tecnico"}),
        ("aberto", True, {}),  # arquivado sem fechado: o registro pode existir assim
    ],
    ids=["aberto", "a_caminho", "em_atendimento", "resolvido", "fechado",
         "arquivado"],
)
def test_proprio_chamado_em_qualquer_status(api_module, client, fake_requests,
                                            monkeypatch, status, archived, extra):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A,
                                          status=status, archived=archived, **extra))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["ticket"]["status"] == status


# ── Caso H — IDOR por parâmetro do cliente ──────────────────────────────────

def test_reported_by_user_id_na_query_nao_move_a_identidade(api_module, client,
                                                            fake_requests,
                                                            monkeypatch):
    """`?reportedByUserId=<b>` não assume a identidade de B: o dono continua
    sendo o do token, então o chamado de B é negado."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))

    r = client.get(f"/api/chamados/dele?reportedByUserId={USER_B}", headers=headers)

    assert r.status_code == 403
    assert "ticket" not in r.get_json()
    # O parâmetro também não entrou na consulta ao banco.
    assert USER_B not in _url_do_detalhe(fake_requests)


def test_reported_by_user_id_na_url_de_outro_usuario_ainda_negado(api_module, client,
                                                                  fake_requests,
                                                                  monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))

    for query in (f"?reportedByUserId={USER_A}", f"?reported_by_user_id={USER_A}",
                  f"?owner={USER_A}", f"?mine=true"):
        r = client.get(f"/api/chamados/dele{query}", headers=headers)
        assert r.status_code == 403, f"query {query} furou o escopo"


def test_reported_by_user_id_no_body_e_ignorado(api_module, client, fake_requests,
                                                monkeypatch):
    """GET não lê body nesta rota; um payload forjado não abre nada."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))

    r = client.get("/api/chamados/dele", headers=headers,
                   json={"reportedByUserId": USER_A})

    assert r.status_code == 403


def test_header_de_identidade_do_cliente_nao_e_considerado(api_module, client,
                                                          fake_requests,
                                                          monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    headers["X-User-Id"] = USER_B
    headers["X-Forwarded-User"] = USER_B
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))

    r = client.get("/api/chamados/dele", headers=headers)

    assert r.status_code == 403


# ── Convenção de resposta (não virar enumeração de chamados) ─────────────────

def test_inexistente_404_e_inacessivel_403(api_module, client, fake_requests,
                                           monkeypatch):
    """A convenção que JÁ existia é preservada: 404 para o que não existe, 403
    para o que existe e não pode ser lido. Nenhuma mensagem nova foi introduzida
    e nenhuma das duas revela solicitante, workspace ou responsável."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])

    _route_detalhe(fake_requests, None)
    inexistente = client.get("/api/chamados/fantasma", headers=headers)
    assert inexistente.status_code == 404
    assert inexistente.get_json() == {"error": "Chamado não encontrado"}

    fake_requests.routes = [r for r in fake_requests.routes if r[1] != DETALHE]
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B))
    inacessivel = client.get("/api/chamados/dele", headers=headers)
    assert inacessivel.status_code == 403
    # Corpo mínimo: nem o erro revela o que existe ou de quem é.
    assert set(inacessivel.get_json()) == {"error"}
    assert inacessivel.get_json()["error"] == "Permissão insuficiente"
    assert "ticket" not in inacessivel.get_json()


def test_negado_nao_vaza_dados_do_chamado(api_module, client, fake_requests,
                                          monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="dele", reportedByUserId=USER_B,
                                          assignedTo="Tecnico 7",
                                          roomName="Sala Secreta"))

    r = client.get("/api/chamados/dele", headers=headers)
    corpo = r.get_data(as_text=True)

    assert r.status_code == 403
    for segredo in ("Sala Secreta", "Tecnico 7", "maria@test.com", USER_B):
        assert segredo not in corpo


def test_erro_do_supabase_continua_502(api_module, client, fake_requests,
                                       monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    fake_requests.route("GET", DETALHE, FakeResponse({"error": "x"},
                                                     status_code=500, ok=False))

    r = client.get("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 502


# ── Regressão: a Via B não(ITHOUT) enfraquecer as demais rotas ────────────────

def test_escrita_permanece_exigindo_ticket_view(api_module, client, fake_requests,
                                                monkeypatch):
    """Ser dono do chamado NÃO habilita PATCH. O detalhe é leitura; editar segue
    exigindo a Action derivada (`ticket.status`/`ticket.edit`)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    fake_requests.route("PATCH", "chamados_tickets?id=eq.", FakeResponse([]))

    r = client.patch("/api/chamados/meu-1", json={"status": "resolvido"},
                     headers=headers)

    assert r.status_code == 403


def test_delete_permanece_exigindo_ticket_delete(api_module, client, fake_requests,
                                                 monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))

    r = client.delete("/api/chamados/meu-1", headers=headers)

    assert r.status_code == 403


def test_eventos_do_chamado_agora_abrem_para_o_proprio_solicitante(api_module, client,
                                                                   fake_requests, monkeypatch):
    """#345: este teste JÁ afirmava `403` aqui, e a PR inverte a afirmação.

    A #339 abriu o DETALHE do próprio chamado mas deixou a timeline atrás, e este
    teste era o guardião dessa lacuna — a timeline exigia `ticket.view` mesmo para
    o dono. A #345 fecha a lacuna, então o 403 vira 200.

    O que NÃO muda, e o que a nova suíte (`test_chamados_own_timeline.py`)
    continua travando: chamado de terceiro, usuário sem relação e chamado de
    outra unidade seguem 403, e `ticket.view` continua sendo o que autoriza a
    via operacional. Aqui só se registra a mudança de contrato do dono, com o
    mesmo `select=workspace_id,reportedByUserId` que o handler monta.
    """
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    _route_detalhe(fake_requests, _ticket(id="meu-1", reportedByUserId=USER_A))
    fake_requests.route("GET", "rest/v1/ticket_events", FakeResponse([]))

    r = client.get("/api/chamados/meu-1/events", headers=headers)

    assert r.status_code == 200
    assert r.get_json() == {"events": []}


def test_lista_operacional_continua_exigindo_ticket_view(api_module, client,
                                                         fake_requests, monkeypatch):
    """#331: `mine=true` abre a lista pessoal; sem ele, a fila é da equipe de TI."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, [WS_A]), actions=[])
    fake_requests.route("GET", "chamados_tickets?select=", FakeResponse([]))

    r = client.get("/api/chamados", headers=headers)

    assert r.status_code == 403
    assert "tickets" not in r.get_json()
