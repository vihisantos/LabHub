"""Exposição de dados nos endpoints INTERNOS de Chamados.

Este arquivo não testa "o frontend não usa o campo". Testa o que realmente
importa em minimização de dados: **o campo não pode estar na resposta HTTP**.

Por que isso importa: `select=*` na lista e no detalhe devolvia a linha inteira
do banco. Dois campos dessa linha são internos e não têm consumidor nenhum:

  · `tracking_token_hash` — SHA-256 da credencial de acompanhamento do professor.
    É segredo de autenticação, usado só para validar o token no
    `@require_tracking_token`. A criação e a consulta por token já o tratavam
    corretamente; a leitura interna o vazava para qualquer um com `ticket.view`,
    em TODOS os chamados da unidade.
  · `reportedByUserId` — UUID do solicitante autenticado. É identidade interna,
    usada pelo backend no escopo pessoal de `mine=true` e na via pessoal do
    detalhe. O frontend não a lê em runtime em lugar nenhum.

Regra que estes testes fixam:

    Estar autorizado a VER um chamado não significa estar autorizado a receber
    todos os campos ARMAZENADOS desse chamado.

E o outro lado, para que a allowlist não vire regressão funcional: os campos com
consumidor real continuam saindo, e a scoping por workspace não afrouxa.
"""

import base64
import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
SUPABASE_URL = "https://fake.supabase.co"
SUPABASE_SERVICE_KEY = "service-key"
SUPABASE_JWT_SECRET = "jwt-secret"

USER_A = "user-a"
WS_A = "ws-a"
WS_B = "ws-b"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = (
        _b64url(json.dumps(header).encode()) + "." + _b64url(json.dumps(payload).encode())
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
    target = API_FILE.resolve()
    for _name, mod in list(sys.modules.items()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "chamados_datamin_api"
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

def _perfil(pid=USER_A, workspaces=(WS_A,)):
    return {
        "id": pid,
        "email": f"{pid}@test.com",
        "name": pid.upper(),
        "role": "viewer",
        "is_super_admin": False,
        "workspace_ids": list(workspaces),
        "status": "active",
    }


def _auth(api_module, fake_requests, monkeypatch, profile, actions):
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
    """Linha como o Postgres a devolve, com TUDO — inclusive o interno."""
    t = {
        "id": "t-1",
        "workspace_id": WS_A,
        "roomId": "r-1",
        "roomName": "Laboratório 03",
        "assetId": "a-1",
        "assetSource": "stock",
        "assetName": "Notebook Dell",
        "assetPatrimony": "PAT-0001",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": "Não liga",
        "status": "em_atendimento",
        "priority": "normal",
        "reportedBy": "Prof. Maria",
        "reportedByEmail": "maria@test.com",
        "reportedByUserId": USER_A,
        "assignedTo": "Tecnico 1",
        "assignedToUserId": "user-tec",
        "ticketNumber": 1042,
        "createdAt": "2026-10-01T10:00:00",
        "updatedAt": "2026-10-05T08:42:00",
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "photos": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
        # ── internos, que o banco tem e a API não deve devolver ──
        "tracking_token_hash": "a" * 64,
    }
    t.update(overrides)
    return t


LISTAGEM = "chamados_tickets?select="
DETALHE = "chamados_tickets?id=eq."
EVENTOS = "ticket_events?ticket_id=eq."


def _route_lista(fake_requests, tickets):
    fake_requests.route("GET", LISTAGEM, FakeResponse(list(tickets)))


def _route_detalhe(fake_requests, ticket):
    fake_requests.route("GET", DETALHE, FakeResponse([ticket] if ticket else []))


def _corpo(r):
    return r.get_data(as_text=True)


def _chamados_de(r):
    return r.get_json()


# ── FILA ────────────────────────────────────────────────────────────────────

class TestFila:
    def test_tracking_token_hash_nao_atravessa_a_resposta(self, api_module, client,
                                                           fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_lista(fake_requests, [_ticket()])

        r = client.get("/api/chamados", headers=headers)

        assert r.status_code == 200
        assert "tracking_token_hash" not in _corpo(r)
        assert "tracking_token_hash" not in _chamados_de(r)["tickets"][0]

    def test_reported_by_user_id_nao_atravessa_a_resposta(self, api_module, client,
                                                          fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_lista(fake_requests, [_ticket()])

        r = client.get("/api/chamados", headers=headers)

        assert "reportedByUserId" not in _corpo(r)

    def test_a_query_ao_banco_nao_pede_select_star(self, api_module, client,
                                                   fake_requests, monkeypatch):
        """A coluna nem precisa sair do Postgres: a allowlist vai no `select=`."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_lista(fake_requests, [_ticket()])

        client.get("/api/chamados", headers=headers)

        url = fake_requests.calls_for("GET", LISTAGEM)[0]["url"]
        assert "select=*" not in url
        # nem os dois campos internos são pedidos
        assert "tracking_token_hash" not in url
        assert "reportedByUserId," not in url and not url.endswith("reportedByUserId")

    def test_campos_com_consumidor_real_continuam_saindo(self, api_module, client,
                                                         fake_requests, monkeypatch):
        """A allowlist não pode virar regressão funcional."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_lista(fake_requests, [_ticket()])

        ticket = client.get("/api/chamados", headers=headers).get_json()["tickets"][0]

        for campo in ("id", "ticketNumber", "roomName", "assetName", "problemCategory",
                      "problemArea", "problemDescription", "status", "priority",
                      "reportedBy", "reportedByEmail", "assignedTo", "assignedToUserId",
                      "workspace_id", "createdAt", "updatedAt", "resolvedAt", "archived",
                      "closedAt", "closedBy", "statusNote", "photos", "feedbackRating",
                      "feedbackComment", "feedbackAt", "roomId", "assetId", "assetSource",
                      "assetPatrimony"):
            assert campo in ticket, f"consumidor existente quebrou: {campo}"

    def test_escopo_pessoal_tambem_nao_expoe(self, api_module, client, fake_requests,
                                             monkeypatch):
        """`mine=true` devolve só o que é do chamador — mas o hash ainda não pode sair."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), [])
        _route_lista(fake_requests, [_ticket()])

        r = client.get("/api/chamados?mine=true", headers=headers)

        assert r.status_code == 200
        assert "tracking_token_hash" not in _corpo(r)
        assert "reportedByUserId" not in _corpo(r)

    def test_filtro_de_dono_continua_sendo_onde_a_identidade_vive(self, api_module, client,
                                                                  fake_requests, monkeypatch):
        """`reportedByUserId` sai da RESPOSTA, nunca sai do filtro do banco: o
        escopo pessoal continua sendo decidido pelo servidor."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), [])
        _route_lista(fake_requests, [_ticket()])

        client.get("/api/chamados?mine=true", headers=headers)

        url = fake_requests.calls_for("GET", LISTAGEM)[0]["url"]
        assert f"reportedByUserId=eq.{USER_A}" in url


# ── DETALHE ─────────────────────────────────────────────────────────────────

class TestDetalhe:
    def test_hash_e_uuid_nao_saem_no_detalhe(self, api_module, client, fake_requests,
                                              monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket())

        r = client.get("/api/chamados/t-1", headers=headers)

        assert r.status_code == 200
        assert "tracking_token_hash" not in _corpo(r)
        assert "reportedByUserId" not in _corpo(r)

    def test_detalhe_do_proprio_solicitante_tambem_nao_expoe(self, api_module, client,
                                                              fake_requests, monkeypatch):
        """A via pessoal da #339 não pode virar um canal de exposição."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), [])
        _route_detalhe(fake_requests, _ticket(reportedByUserId=USER_A))

        r = client.get("/api/chamados/t-1", headers=headers)

        assert r.status_code == 200
        assert "tracking_token_hash" not in _corpo(r)
        assert "reportedByUserId" not in _corpo(r)

    def test_tecnico_continua_recebendo_o_contrato_completo(self, api_module, client,
                                                            fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket())

        ticket = client.get("/api/chamados/t-1", headers=headers).get_json()["ticket"]

        assert ticket["ticketNumber"] == 1042
        assert ticket["reportedByEmail"] == "maria@test.com"
        assert ticket["assetPatrimony"] == "PAT-0001"

    def test_remover_campos_nao_abre_bypass_de_workspace(self, api_module, client,
                                                         fake_requests, monkeypatch):
        """A allowlist é de PAYLOAD, não de acesso: o 403 de outra unidade continua."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket(workspace_id=WS_B))

        r = client.get("/api/chamados/t-1", headers=headers)

        assert r.status_code == 403
        assert "ticket" not in r.get_json()

    def test_acesso_indevido_continua_negado(self, api_module, client, fake_requests,
                                              monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), [])
        _route_detalhe(fake_requests, _ticket(reportedByUserId="user-b"))

        r = client.get("/api/chamados/t-1", headers=headers)

        assert r.status_code == 403
        assert "tracking_token_hash" not in _corpo(r)

    def test_404_continua_404(self, api_module, client, fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, None)

        assert client.get("/api/chamados/t-1", headers=headers).status_code == 404


# ── TIMELINE ────────────────────────────────────────────────────────────────

class TestTimeline:
    def test_eventos_nao_trazem_workspace_id_nem_ticket_id(self, api_module, client,
                                                           fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket())
        fake_requests.route(
            "GET", EVENTOS,
            FakeResponse([{
                "id": "ev-1", "ticket_id": "t-1", "workspace_id": WS_A,
                "type": "comentario", "content": "ok", "author": "Tecnico 1",
                "photo_urls": "[]", "createdAt": "2026-10-05T09:00:00",
            }]),
        )

        r = client.get("/api/chamados/t-1/events", headers=headers)

        assert r.status_code == 200
        ev = r.get_json()["events"][0]
        assert "workspace_id" not in ev
        assert "ticket_id" not in ev
        # e o que o consumidor usa continua lá
        assert ev["id"] == "ev-1"
        assert ev["content"] == "ok"
        assert ev["photos"] == []

    def test_a_query_da_timeline_e_explicita(self, api_module, client, fake_requests,
                                              monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket())
        fake_requests.route("GET", EVENTOS, FakeResponse([]))

        client.get("/api/chamados/t-1/events", headers=headers)

        url = fake_requests.calls_for("GET", EVENTOS)[0]["url"]
        assert "select=" in url
        assert "workspace_id" not in url


# ── IDENTIDADE: nenhum parâmetro do cliente declara quem é o solicitante ─────

class TestIdentidade:
    def test_parametro_do_cliente_nao_muda_a_identidade(self, api_module, client,
                                                         fake_requests, monkeypatch):
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), [])
        _route_detalhe(fake_requests, _ticket(reportedByUserId="user-b"))

        r = client.get(f"/api/chamados/t-1?reportedByUserId={USER_A}", headers=headers)

        assert r.status_code == 403
        assert "ticket" not in r.get_json()

    def test_reported_by_email_apenas_quem_tem_contrato(self, api_module, client,
                                                        fake_requests, monkeypatch):
        """`reportedByEmail` TEM consumidor (bloco do solicitante no detalhe e a
        busca do Coordenador), então continua — minimização não é apagar o que
        é usado."""
        headers = _auth(api_module, fake_requests, monkeypatch, _perfil(), ["ticket.view"])
        _route_detalhe(fake_requests, _ticket())

        ticket = client.get("/api/chamados/t-1", headers=headers).get_json()["ticket"]

        assert ticket["reportedByEmail"] == "maria@test.com"


# ── PÚBLICO: a projeção allowlist continua separada e intacta ───────────────

class TestPublico:
    def test_projecao_publica_continua_sem_campos_internos(self, api_module):
        row = _ticket()
        projetado = api_module._project_public_ticket(row)
        for campo in ("tracking_token_hash", "reportedByUserId", "reportedByEmail",
                      "assignedToUserId", "workspace_id", "statusNote"):
            assert campo not in projetado

    def test_projecao_publica_foi_escrita_para_acampar_todos_os_campos(self, api_module):
        """Trava estrutural: se alguém acrescentar coluna nova na tabela, a
        projeção pública não pode passar a vazá-la por omissão."""
        row = _ticket()
        projetado = api_module._project_public_ticket(row)
        # tudo que a projeção entrega tem que estar na allowlist interna
        assert set(projetado) <= set(api_module.CHAMADOS_TICKET_READ_COLS)
        # e o conjunto público é bem menor que o interno
        assert len(projetado) < len(api_module.CHAMADOS_TICKET_READ_COLS)
