"""`GET /api/chamados?mine=true` — escopo pessoal do solicitante, decidido no servidor.

Por que este arquivo existe: `reportedByUserId` é preenchido pelo backend a
partir do `sub` do JWT desde a creation, mas até aqui a única forma de ver
"meus chamados" era a lista operacional (`ticket.view`) filtrada no cliente. Isso
é um filtro de apresentação, não autorização: um papel sem `ticket.view` — hoje
`lider` — via o módulo mas não conseguia acompanhar o que tinha aberto.

`mine=true` é um caminho de escopo pessoal no MESMO endpoint:

  · o dono vem SEMPRE da sessão (`g.user_id`, o `sub` do JWT validado por
    `@require_auth`); o cliente não escolhe o UUID;
  · NÃO exige `ticket.view` — é o motivo de existir;
  · é histórico: resolvidos, fechados e arquivados entram, sem filtro de
    `archived`;
  · `?reportedByUserId=` do cliente não é lido em nenhum ramo;
  · não cria Action nem altera `role_permissions`/RLS — é regra de acesso ao
    recurso baseada na identidade autenticada.

Os testes abaixo chamam a API DIRETO (sem passar pelo frontend), que é a única
forma de provar a afirmação de segurança: "o backend nunca devolve chamados de
outro usuário".
"""

import base64
import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# ── bootstrap do módulo (mesmo padrão dos demais arquivos de auth) ─────────────

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

    Mesma estratégia de test_chamados_authorization_hardening.py: reexecutar o
    módulo depois da primeira requisição falha no Flask (`_check_setup_finished`).
    """
    target = API_FILE.resolve()
    for _name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_mine_api"
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


def _perfil(pid, workspaces, is_super_admin=False):
    """Perfil mockado. `workspace_ids` ? consumido pelo mock de memberships
    abaixo, para reproduzir as linhas ativas que `require_auth` deriva."""
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
    """Autentica como `profile` concedendo EXATAMENTE o conjunto `actions`.

    `actions` é a lista de Actions que o papel tem; passar `[]` reproduz um
    solicitante SEM `ticket.view` — o caso que motiva esta PR.
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


def _auth_com_memberships(api_module, fake_requests, monkeypatch, profile, memberships,
                         actions):
    """Como `_auth_as`, mas com memberships explícitas (multiunidade)."""
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "_verify_jwt", lambda t: {"sub": profile["id"]})
    fake_requests.route(
        "GET", f"/rest/v1/profiles?id=eq.{profile['id']}", FakeResponse([profile])
    )
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse(memberships))
    monkeypatch.setattr(api_module, "rbac_two_can", lambda *a: str(a[2]) in actions)
    return {"Authorization": f"Bearer {_make_jwt({'sub': profile['id']})}"}


def _ticket(**overrides):
    t = {
        "id": "t-1",
        "workspace_id": "ws-a",
        "roomName": "Sala 101",
        "problemCategory": "Internet",
        "status": "aberto",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "maria@test.com",
        "reportedByUserId": None,
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


LISTAGEM = "chamados_tickets?select=*"


def _route_listagem(fake_requests, tickets):
    fake_requests.route("GET", LISTAGEM, FakeResponse(list(tickets)))


def _url_da_listagem(fake_requests):
    calls = fake_requests.calls_for("GET", LISTAGEM)
    return calls[0]["url"] if calls else ""


# ── Caso A — usuário com chamados próprios ───────────────────────────────────

def test_mine_devolve_somente_os_chamados_do_caller(api_module, client, fake_requests,
                                                    monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [_ticket(id="meu-1", reportedByUserId=USER_A)])

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    tickets = r.get_json()["tickets"]
    assert [t["id"] for t in tickets] == ["meu-1"]


# ── Caso B — usuário sem chamados próprios ──────────────────────────────────

def test_mine_sem_chamados_devolve_lista_vazia(api_module, client, fake_requests,
                                               monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["tickets"] == []


# ── Caso C — tentativa de forçar outro usuário ──────────────────────────────

def test_reportedByUserId_do_cliente_nao_altera_o_escopo(api_module, client, fake_requests,
                                                         monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [_ticket(id="meu-1", reportedByUserId=USER_A)])

    r = client.get(f"/api/chamados?mine=true&reportedByUserId={USER_B}",
                   headers=headers)

    assert r.status_code == 200
    # A URL montada pelo servidor NÃO contém o UUID do cliente.
    url = _url_da_listagem(fake_requests)
    assert USER_B not in url
    assert f"reportedByUserId=eq.{USER_A}" in url


def test_reportedByUserId_sozinho_nao_e_aceito_como_autorizacao(api_module, client,
                                                               fake_requests, monkeypatch):
    """Sem `mine`, o parametro do cliente não abre nada: a lista continua
    exigindo `ticket.view`."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get(f"/api/chamados?reportedByUserId={USER_B}", headers=headers)

    assert r.status_code == 403


# ── Caso D — chamado anônimo ────────────────────────────────────────────────

def test_mine_nao_devolve_chamado_anonimo(api_module, client, fake_requests, monkeypatch):
    """`reportedByUserId = NULL` nunca casa com `eq.<uuid>` — o PostgREST
    descarta a linha. Nenhum `ilike` por nome/e-mail entra na query."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    client.get("/api/chamados?mine=true", headers=headers)

    url = _url_da_listagem(fake_requests)
    # Nenhuma busca por texto livre: nem `ilike` (nome/e-mail), nem um
    # `reportedBy=eq` que poderia casar por acaso.
    assert "ilike" not in url
    assert "reportedBy=" not in url
    assert f"reportedByUserId=eq.{USER_A}" in url


# ── Caso E — solicitante SEM ticket.view (o motivo da PR) ────────────────────

def test_solicitante_sem_ticket_view_acessa_os_proprios(api_module, client,
                                                        fake_requests, monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [_ticket(id="meu-1", reportedByUserId=USER_A)])

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    assert [t["id"] for t in r.get_json()["tickets"]] == ["meu-1"]


def test_solicitante_sem_ticket_view_continua_sem_a_lista_geral(api_module, client,
                                                                 fake_requests, monkeypatch):
    """Caso F: `mine=true` NÃO pode enfraquecer a proteção da lista geral."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get("/api/chamados", headers=headers)

    assert r.status_code == 403
    assert "tickets" not in r.get_json()


# ── Isolamento entre usuários ───────────────────────────────────────────────

def test_isolamento_entre_usuarios_no_escopo_pessoal(api_module, client, fake_requests,
                                                     monkeypatch):
    """O filtro de dono é SEMPRE o do JWT, para qualquer caller."""
    for caller, outro in ((USER_A, USER_B), (USER_B, USER_A)):
        api_module._rate_limit_store.clear()
        fake_requests.routes.clear()
        fake_requests.calls.clear()
        headers = _auth_as(api_module, fake_requests, monkeypatch,
                           _perfil(caller, ["ws-a"]), actions=[])
        _route_listagem(fake_requests, [])

        client.get("/api/chamados?mine=true", headers=headers)

        url = _url_da_listagem(fake_requests)
        assert f"reportedByUserId=eq.{caller}" in url
        assert f"reportedByUserId=eq.{outro}" not in url


# ── Caso G — cross-workspace ────────────────────────────────────────────────

def test_mine_com_workspace_id_usa_ambos_filtros(api_module, client, fake_requests,
                                                 monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a", "ws-b"]), actions=[])
    _route_listagem(fake_requests, [_ticket(id="meu-1", reportedByUserId=USER_A,
                                             workspace_id="ws-b")])

    r = client.get("/api/chamados?mine=true&workspace_id=ws-b", headers=headers)

    assert r.status_code == 200
    url = _url_da_listagem(fake_requests)
    assert f"reportedByUserId=eq.{USER_A}" in url
    assert "workspace_id=eq.ws-b" in url


def test_mine_com_workspace_sem_membership_e_negado(api_module, client, fake_requests,
                                                   monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get("/api/chamados?mine=true&workspace_id=ws-z", headers=headers)

    assert r.status_code == 403


def test_mine_sem_workspace_id_usa_apenas_as_unidades_com_membership(api_module, client,
                                                                     fake_requests,
                                                                     monkeypatch):
    """Sem `workspace_id`, o escopo pessoal é estreitado pelas memberships —
    nunca pela Action `ticket.view` de outra unidade."""
    headers = _auth_com_memberships(
        api_module, fake_requests, monkeypatch,
        _perfil(USER_A, []),
        [
            {"profile_id": USER_A, "workspace_id": "ws-a", "status": "active"},
            {"profile_id": USER_A, "workspace_id": "ws-b", "status": "active"},
        ],
        actions=[],
    )
    _route_listagem(fake_requests, [])

    client.get("/api/chamados?mine=true", headers=headers)

    url = _url_da_listagem(fake_requests)
    assert f"reportedByUserId=eq.{USER_A}" in url
    assert "ws-a" in url and "ws-b" in url
    # E NÃO é o ramo que filtra por `ticket.view`.
    assert "in.(" in url or "workspace_id=eq." in url


def test_mine_sem_nenhuma_membership_devolve_vazio(api_module, client, fake_requests,
                                                  monkeypatch):
    """Fail-closed: sem membership não há o que listar, e a fila não vaza."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, []), actions=[])
    fake_requests.route("GET", LISTAGEM, FakeResponse([_ticket()]))

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    assert r.get_json()["tickets"] == []
    assert _url_da_listagem(fake_requests) == ""


# ── Histórico ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "estado",
    [
        {"status": "aberto", "archived": False},
        {"status": "a_caminho", "archived": False},
        {"status": "em_atendimento", "archived": False},
        {"status": "resolvido", "archived": False},
        {"status": "fechado", "archived": True},
    ],
)
def test_mine_e_consulta_historica_inclui_resolvidos_e_fechados(api_module, client,
                                                                fake_requests, monkeypatch,
                                                                estado):
    """Meus Chamados NÃO copia a regra operacional de "Minha fila": não há
    filtro de `archived` nem de status nesta consulta."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests,
                    [_ticket(id="meu-1", reportedByUserId=USER_A, **estado)])

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    assert [t["id"] for t in r.get_json()["tickets"]] == ["meu-1"]


def test_mine_com_filtro_de_status_aplica_o_status(api_module, client, fake_requests,
                                                   monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    client.get("/api/chamados?mine=true&status=resolvido", headers=headers)

    url = _url_da_listagem(fake_requests)
    assert f"reportedByUserId=eq.{USER_A}" in url
    assert "status=eq.resolvido" in url


# ── Parse da flag ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("flag", ["1", "true", "TRUE", "yes", "Yes"])
def test_mine_aceita_literais_verdadeiros(api_module, client, fake_requests, monkeypatch,
                                          flag):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    client.get(f"/api/chamados?mine={flag}", headers=headers)

    assert f"reportedByUserId=eq.{USER_A}" in _url_da_listagem(fake_requests)


@pytest.mark.parametrize("flag", ["0", "false", "no", "", "banana", "  "])
def test_mine_nao_e_ativado_por_literals_falsos(api_module, client, fake_requests,
                                                monkeypatch, flag):
    """`?mine` só liga com literal verdadeiro: `?mine=0` e `?mine=false` mantém a
    lista operacional (que exige `ticket.view`)."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get(f"/api/chamados?mine={flag}", headers=headers)

    assert r.status_code == 403  # sem ticket.view => cai na proteção da fila
    assert _url_da_listagem(fake_requests) == ""


# ── A consulta geral NÃO mudou ──────────────────────────────────────────────

def test_lista_geral_continua_exigindo_ticket_view(api_module, client, fake_requests,
                                                   monkeypatch):
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=["ticket.view"])
    _route_listagem(fake_requests, [_ticket(id="t-1")])

    r = client.get("/api/chamados", headers=headers)

    assert r.status_code == 200
    assert [t["id"] for t in r.get_json()["tickets"]] == ["t-1"]
    # Sem filtro de dono: a lista operacional é a fila inteira da unidade.
    assert "reportedByUserId" not in _url_da_listagem(fake_requests)


def test_lista_geral_de_tecnico_inalterada(api_module, client, fake_requests, monkeypatch):
    """Técnico com `ticket.view` vê a fila; e com `mine=true` vê só o que abriu."""
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]),
                       actions=["ticket.view"])
    _route_listagem(fake_requests, [_ticket(id="t-1"), _ticket(id="meu-1")])

    assert client.get("/api/chamados", headers=headers).get_json()["tickets"]
    assert "reportedByUserId" not in _url_da_listagem(fake_requests)


def test_exige_autenticacao(api_module, client, fake_requests, monkeypatch):
    r = client.get("/api/chamados?mine=true")

    assert r.status_code == 401


# ── Invariantes estruturais: nenhum RBAC foi tocado ─────────────────────────

def test_mine_nao_cria_nenhuma_exception_no_motor_rbac(api_module, client, fake_requests,
                                                        monkeypatch):
    """A regra é identidade-do-recurso, não RBAC: nenhuma chamada extra ao motor
    acontece no ramo `mine`, e nenhuma tabela de permissão é lida."""
    vistos = []

    def _spy(*args):
        vistos.append(args[2] if len(args) > 2 else None)
        return False

    monkeypatch.setattr(api_module, "rbac_two_can", _spy)
    headers = _auth_as(api_module, fake_requests, monkeypatch,
                       _perfil(USER_A, ["ws-a"]), actions=[])
    _route_listagem(fake_requests, [])

    r = client.get("/api/chamados?mine=true", headers=headers)

    assert r.status_code == 200
    assert vistos == []


def test_endpoint_nao_declara_acao_de_rbac_nova():
    """Nenhuma Action nova pode ter sido introduzida junto: `mine` resolve por
    identidade, e a lista geral continua nas Actions de ticket."""
    fonte = API_FILE.read_text(encoding="utf-8")
    # As Actions de ticket já existentes seguem sendo as mesmas de antes.
    for action in ("ticket.view", "ticket.report", "ticket.comment", "ticket.status"):
        assert action in fonte
    # E não há Action com cara de escopo pessoal (`mine`, `own`, `requester`).
    for proibida in ("ticket.mine", "ticket.own", "ticket.viewOwn", "mine.view"):
        assert proibida not in fonte, f"Action nova não autorizada: {proibida}"
