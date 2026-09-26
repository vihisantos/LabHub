"""Tests: rejeição real de contas (#286 PR-1) — endpoint, auth e frontend.

Rota nova:
  POST /api/admin/users/<id>/reject   Super-Admin-only
    pending -> rejected + identidade Auth DESATIVADA (ban, sem apagar auth.users)

Cobertura:
  - autorização no BACKEND (401 sem token, 403 para não super-admin);
  - validação de transição (pending->rejected; rejected idempotente; active e
    blocked => 409, sem transição silenciosa);
  - 404 para conta inexistente, 400 para id inválido;
  - `auth.users` NUNCA é deletado (nenhum DELETE no fluxo);
  - FALHA PARCIAL: erro do Auth no ban => 502 + compensação do status, e o erro
    do Auth é devolvido (não engolido); compensação que falha => 502 fail-closed
    mantendo `rejected`;
  - auditoria: grava `account_rejected` com o ator em `app_audit_logs`;
  - `require_auth` nega `rejected` e mantém `pending`/`blocked` como antes;
  - frontend: `rejectUser` chama o endpoint e NÃO faz mais DELETE de profiles.
"""
import base64
import hashlib
import hmac
import importlib.util
import json
import re
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
API_FILE = ROOT / "api" / "app.py"
ADMIN_SERVICE = ROOT / "src" / "core" / "auth" / "adminService.ts"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

UID_ADMIN = "aaaaaaaa-0000-0000-0000-000000000001"
UID_PENDING = "bbbbbbbb-0000-0000-0000-000000000002"
UID_ACTIVE = "cccccccc-0000-0000-0000-000000000003"
UID_BLOCKED = "dddddddd-0000-0000-0000-000000000004"
WS_A = "11111111-1111-1111-1111-111111111111"

ADMIN_PROFILE = {
    "id": UID_ADMIN, "email": "admin@test.com", "name": "Admin",
    "role": "technician", "is_super_admin": True,
    "workspace_ids": [WS_A], "status": "active",
}
COMMON_PROFILE = {
    "id": UID_PENDING, "email": "common@test.com", "name": "Comum",
    "role": "technician", "is_super_admin": False,
    "workspace_ids": [WS_A], "status": "active",
}


class FakeResponse:
    def __init__(self, payload, status_code=200, ok=True, text=""):
        self._payload = payload
        self.status_code = status_code
        self.ok = ok
        self.text = text or (payload if isinstance(payload, str) else str(payload))

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.calls = []
        self._routes = {}
        self._seq = {}
        self._param_routes = {}
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.setdefault(method, []).append((url_part, response))

    def route_seq(self, method, url_part, responses):
        """Rota com respostas SEQUENCIAIS (1ª chamada, 2ª, ...)."""
        self._seq.setdefault(method, []).append(
            (url_part, list(responses), {"i": 0})
        )

    def route_param(self, method, url_part, param_needle, response):
        """Rota que só casa quando `params` contém `param_needle`.

        Necessário porque `require_auth` (`_get_user_profile`) e o endpoint leem
        `profiles` na MESMA URL, distinguidos só por `params['id']`.
        """
        self._param_routes.setdefault(method, []).append(
            (url_part, param_needle, response)
        )

    def replace_param(self, method, url_part, param_needle, response):
        """Substitui a rota parametrizada (simula outro fluxo já ter mudado a linha)."""
        kept = [
            (p, n, r)
            for (p, n, r) in self._param_routes.get(method, [])
            if not (p == url_part and n == param_needle)
        ]
        self._param_routes[method] = kept + [(url_part, param_needle, response)]

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        for part, response in self._routes.get(method, []):
            if part in url:
                return response
        for part, responses, state in self._seq.get(method, []):
            if part in url:
                idx = min(state["i"], len(responses) - 1)
                state["i"] += 1
                return responses[idx]
        params = str(kwargs.get("params") or "")
        for part, needle, response in self._param_routes.get(method, []):
            if part in url and needle in params:
                return response
        return self._default

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self._do("PUT", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._do("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    def calls_for(self, method, url_part):
        return [c for c in self.calls if c["method"] == method and url_part in c["url"]]


@pytest.fixture(scope="session")
def api_module():
    # Mesma chave dos demais arquivos de api/tests: o módulo do Flask é
    # carregado UMA vez. Recarregar re-registra rotas numa app já usada e o
    # Werkzeug lança AssertionError.
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
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
    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake_requests)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    api_module._rate_limit_store.clear()
    return api_module.app.test_client()


def _make_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(SUPABASE_JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _setup(monkeypatch, fake_requests, actor, target_status="pending", target_exists=True):
    """Monta o cenário: `actor` é quem chama; o alvo é `target_status`."""
    monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": actor["id"]})
    # require_auth -> _get_user_profile (ator)
    fake_requests.route_param("GET", "/rest/v1/profiles", f"eq.{actor['id']}",
                              FakeResponse([actor]))
    # endpoint -> leitura do alvo
    target = [] if not target_exists else [
        {"id": UID_PENDING, "email": "p@test.com", "name": "P", "status": target_status}
    ]
    fake_requests.route_param("GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
                              FakeResponse(target))
    fake_requests.route("GET", "/auth/v1/admin/users", FakeResponse({"id": UID_PENDING}))
    fake_requests.route("GET", "/rest/v1/memberships", FakeResponse([]))
    fake_requests.route("PUT", "/auth/v1/admin/users", FakeResponse({"id": UID_PENDING}))
    fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([{"id": UID_PENDING}]))
    fake_requests.route("POST", "/rest/v1/app_audit_logs", FakeResponse({"id": "log-1"}))
    return {"Authorization": f"Bearer {_make_jwt({'sub': actor['id']})}"}


# ─────────────────────────── autorização (backend) ───────────────────────────
class TestRejeicaoAutorizacao:
    def test_sem_token_401(self, client):
        assert client.post(f"/api/admin/users/{UID_PENDING}/reject").status_code == 401

    def test_usuario_comum_403(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, COMMON_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 403
        # nada foi escrito
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []

    def test_coordenador_403(self, client, fake_requests, monkeypatch):
        coord = dict(COMMON_PROFILE, role="coordinator")
        headers = _setup(monkeypatch, fake_requests, coord)
        assert client.post(f"/api/admin/users/{UID_PENDING}/reject",
                           headers=headers).status_code == 403

    def test_lider_403(self, client, fake_requests, monkeypatch):
        lider = dict(COMMON_PROFILE, role="lider")
        headers = _setup(monkeypatch, fake_requests, lider)
        assert client.post(f"/api/admin/users/{UID_PENDING}/reject",
                           headers=headers).status_code == 403

    def test_usuario_pendente_403(self, client, fake_requests, monkeypatch):
        pending_actor = dict(COMMON_PROFILE, status="pending")
        headers = _setup(monkeypatch, fake_requests, pending_actor)
        assert client.post(f"/api/admin/users/{UID_PENDING}/reject",
                           headers=headers).status_code == 403


# ─────────────────────────── transição de estado ───────────────────────────
class TestRejeicaoTransicao:
    def test_id_invalido_400(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        assert client.post("/api/admin/users/nao-uuid/reject",
                           headers=headers).status_code == 400

    def test_conta_inexistente_404(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE,
                         target_exists=False)
        assert client.post(f"/api/admin/users/{UID_PENDING}/reject",
                           headers=headers).status_code == 404

    def test_pending_para_rejected_ok(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True
        assert body["status"] == "rejected"
        assert body["auth_disabled"] is True

        # gravou o status
        patch_calls = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert patch_calls, "o status não foi gravado"
        assert patch_calls[0]["kwargs"]["json"]["status"] == "rejected"

        # desativou a identidade com ban (PUT), preservando auth.users
        ban_calls = fake_requests.calls_for("PUT", "/auth/v1/admin/users")
        assert ban_calls, "a identidade Auth não foi desativada"
        assert ban_calls[0]["kwargs"]["json"] == {"ban_duration": "876000h"}
        assert fake_requests.calls_for("DELETE", "/auth/v1/admin/users") == [], (
            "auth.users NÃO pode ser apagado na rejeição"
        )

    def test_auditoria_com_ator(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        audit = fake_requests.calls_for("POST", "/rest/v1/app_audit_logs")
        assert audit, "a rejeição não foi auditada"
        payload = audit[0]["kwargs"]["json"]
        assert payload["action"] == "account_rejected"
        assert payload["actor_id"] == UID_ADMIN, "o ator precisa ser registrado"
        assert payload["entity_id"] == UID_PENDING
        assert payload["meta"]["prev_status"] == "pending"
        assert payload["meta"]["new_status"] == "rejected"

    def test_rejected_e_idempotente(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE,
                         target_status="rejected")
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["idempotent"] is True
        # não reescreveu nem re-baniu
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []

    def test_active_409_sem_transicao_silenciosa(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE, target_status="active")
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 409
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []

    def test_blocked_409(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE, target_status="blocked")
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 409
        assert fake_requests.calls_for("PATCH", "/rest/v1/profiles") == []


# ─────────────────────────── falha parcial ───────────────────────────
# ───────────────── atomicidade / corrida (approve x reject) ─────────────────
class TestRejeicaoAtomicidade:
    """A transição `pending -> rejected` precisa ser garantida pelo BANCO.

    O bug (TOCTOU) anterior era: ler o status -> PATCH só por `id`. Duas
    requisições simultâneas (aprovar + rejeitar) podiam deixar `profile active`
    com Auth banido. Agora o filtro `status = 'pending'` mora no próprio UPDATE
    e o resultado é verificado pela contagem de linhas devolvidas.
    """

    def test_escrita_traz_a_condicao_pending_no_update(self, client, fake_requests,
                                                      monkeypatch):
        """Guard estrutural: o PATCH da transição NÃO pode ser só por `id`."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        patches = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert patches, "nenhum PATCH em profiles"
        first_params = patches[0]["kwargs"]["params"]
        assert "status" in first_params, (
            f"o PATCH da transição precisa filtrar por status (TOCTOU): {first_params}"
        )
        assert first_params["status"] == "eq.pending", (
            f"condição atômica errada: {first_params['status']}"
        )
        assert first_params["id"] == f"eq.{UID_PENDING}"

    def test_aprova_ganha_a_corrida_409_e_nao_bane(self, client, fake_requests,
                                                   monkeypatch):
        """Caso B: outro fluxo gravou `active` -> a condição não casa.

        Resultado exigido: 409 e NENHUM ban (banir aqui deixaria uma conta já
        aprovada com a identidade banida).
        """
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        # a escrita condicional não casa (0 linhas) ...
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([]))
        # ... e a releitura mostra que a aprovação aconteceu
        fake_requests.replace_param(
            "GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
            FakeResponse([{"id": UID_PENDING, "email": "p@test.com", "name": "P",
                           "status": "active"}]),
        )
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 409
        assert resp.get_json()["status"] == "active"
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == [], (
            "NÃO pode banir uma conta que já foi aprovada"
        )
        assert fake_requests.calls_for("POST", "/rest/v1/app_audit_logs") == [], (
            "não deve auditar uma rejeição que não ocorreu"
        )

    def test_corrida_e_alvo_removido_404(self, client, fake_requests, monkeypatch):
        """Condição não casa e a linha sumiu -> 404, sem ban."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([]))
        fake_requests.replace_param(
            "GET", "/rest/v1/profiles", f"eq.{UID_PENDING}", FakeResponse([]),
        )
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 404
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []

    def test_corrida_e_ja_rejected_idempotente(self, client, fake_requests,
                                                monkeypatch):
        """Condição não casa porque OUTRO reject já concluiu -> 200 idempotente."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([]))
        fake_requests.replace_param(
            "GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
            FakeResponse([{"id": UID_PENDING, "email": "p@test.com", "name": "P",
                           "status": "rejected"}]),
        )
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["idempotent"] is True
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []

    def test_200_sem_linhas_alteradas_nao_e_sucesso(self, client, fake_requests,
                                                     monkeypatch):
        """HTTP 200 com 0 linhas não pode virar 200 de sucesso."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route("PATCH", "/rest/v1/profiles", FakeResponse([]))
        fake_requests.replace_param(
            "GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
            FakeResponse([{"id": UID_PENDING, "status": "blocked"}]),
        )
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 409, "200 indevido para transição que não ocorreu"
        assert resp.get_json()["status"] == "blocked"

    def test_compensacao_tambem_e_condicional(self, client, fake_requests,
                                              monkeypatch):
        """A reversão só acontece se a linha ainda estiver no estado gravado."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PUT", None)
        fake_requests.route("PUT", "/auth/v1/admin/users",
                           FakeResponse({"msg": "boom"}, 500, ok=False))
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 502
        patches = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert len(patches) == 2
        back_params = patches[1]["kwargs"]["params"]
        assert back_params.get("status") == "eq.rejected", (
            f"a compensação também deve ser condicional: {back_params}"
        )

    def test_compensacao_sem_linhas_cai_em_fail_closed(self, client, fake_requests,
                                                      monkeypatch):
        """Se a compensação não casou, é fail-closed (rolled_back=False)."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PUT", None)
        fake_requests.route("PUT", "/auth/v1/admin/users",
                           FakeResponse({"msg": "boom"}, 500, ok=False))
        # 1a escrita casa; a compensação responde 200 porém com 0 linhas
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route_seq("PATCH", "/rest/v1/profiles", [
            FakeResponse([{"id": UID_PENDING}]),
            FakeResponse([]),
        ])
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["rolled_back"] is False
        assert body["auth_disabled"] is False


class TestFalhaParcial:
    def test_ban_falha_compensa_e_nao_retorna_sucesso(self, client, fake_requests, monkeypatch):
        """Caso B: Auth não desativou => status volta e 502 (sem falso sucesso)."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PUT", None)
        fake_requests.route("PUT", "/auth/v1/admin/users",
                           FakeResponse({"msg": "boom"}, 500, ok=False))
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["auth_disabled"] is False
        assert body["rolled_back"] is True
        patches = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert len(patches) == 2, "esperava escrita + compensação"
        assert patches[0]["kwargs"]["json"]["status"] == "rejected"
        assert patches[1]["kwargs"]["json"]["status"] == "pending", "não compensou"

    def test_ban_falha_e_compensacao_falha_fail_closed(self, client, fake_requests, monkeypatch):
        """Caso C: nem ban nem volta => 502 e o profile PERMANECE rejected."""
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PATCH", None)
        fake_requests._routes.pop("PUT", None)
        fake_requests.route("PUT", "/auth/v1/admin/users",
                           FakeResponse({"msg": "boom"}, 500, ok=False))
        # 1a escrita (rejected) OK; a compensação (voltar para pending) falha.
        fake_requests.route_seq("PATCH", "/rest/v1/profiles", [
            FakeResponse([{"id": UID_PENDING}]),
            FakeResponse({"msg": "boom"}, 500, ok=False),
        ])
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["rolled_back"] is False
        assert body["auth_disabled"] is False
        # fail-closed: a 1a escrita deixou o profile em `rejected`
        patches = fake_requests.calls_for("PATCH", "/rest/v1/profiles")
        assert patches[0]["kwargs"]["json"]["status"] == "rejected"

    def test_update_do_profile_falha_nao_chega_ao_auth(self, client, fake_requests, monkeypatch):
        headers = _setup(monkeypatch, fake_requests, ADMIN_PROFILE)
        fake_requests._routes.pop("PATCH", None)
        fake_requests.route("PATCH", "/rest/v1/profiles",
                           FakeResponse({"msg": "boom"}, 500, ok=False))
        resp = client.post(f"/api/admin/users/{UID_PENDING}/reject", headers=headers)
        assert resp.status_code == 502
        assert fake_requests.calls_for("PUT", "/auth/v1/admin/users") == []


# ─────────────────────────── require_auth ───────────────────────────
class TestRequireAuthRejected:
    def _call(self, client, fake_requests, monkeypatch, status):
        profile = {"id": UID_PENDING, "email": "u@test.com", "name": "U",
                   "role": "viewer", "is_super_admin": False, "status": status}
        monkeypatch.setattr("auth._verify_jwt", lambda t: {"sub": UID_PENDING})
        fake_requests.route_param("GET", "/rest/v1/profiles", f"eq.{UID_PENDING}",
                                  FakeResponse([profile]))
        return client.get(
            "/api/app-notifications",
            headers={"Authorization": f"Bearer {_make_jwt({'sub': UID_PENDING})}"},
        )

    def test_rejected_401(self, client, fake_requests, monkeypatch):
        resp = self._call(client, fake_requests, monkeypatch, "rejected")
        assert resp.status_code == 401
        assert "rejected" in resp.get_json()["error"].lower()

    def test_blocked_401_mantem_comportamento(self, client, fake_requests, monkeypatch):
        resp = self._call(client, fake_requests, monkeypatch, "blocked")
        assert resp.status_code == 401
        assert "blocked" in resp.get_json()["error"].lower()

    def test_pending_nao_e_bloqueado(self, client, fake_requests, monkeypatch):
        """`pending` mantém o comportamento existente (não vira bloqueio)."""
        resp = self._call(client, fake_requests, monkeypatch, "pending")
        assert resp.status_code != 401, (
            f"pending passou a ser bloqueado: {resp.get_json()}"
        )


# ─────────────────────────── frontend ───────────────────────────
@pytest.fixture(scope="module")
def source():
    return ADMIN_SERVICE.read_text(encoding="utf-8")


class TestFrontendRejeicao:

    def test_reject_user_chama_o_endpoint(self, source):
        m = re.search(r"rejectUser:[\s\S]*?\n  \},", source)
        assert m, "rejectUser não encontrado no adminService"
        body = m.group(0)
        assert "/reject" in body, "rejectUser não chama o endpoint de rejeição"
        assert "fetch(" in body
        assert 'method: \'POST\'' in body or 'method: "POST"' in body

    def test_reject_user_nao_deleta_profiles(self, source):
        m = re.search(r"rejectUser:[\s\S]*?\n  \},", source)
        assert ".from('profiles')" not in m.group(0), (
            "rejectUser ainda apaga o profile"
        )
        assert ".delete()" not in m.group(0)

    def test_nenhum_delete_de_profiles_no_frontend(self):
        offenders = []
        for pattern in ("src/**/*.ts", "src/**/*.tsx"):
            for path in ROOT.glob(pattern):
                if "__tests__" in path.parts:
                    continue
                text = path.read_text(encoding="utf-8", errors="ignore")
                for match in re.finditer(r"\.from\('profiles'\)", text):
                    window = text[match.start(): match.start() + 200]
                    if ".delete()" in window:
                        offenders.append(str(path.relative_to(ROOT)))
        assert offenders == [], f"DELETE de profiles ainda existe em: {offenders}"

    def test_fila_continua_somente_pending(self):
        src = (ROOT / "src" / "core" / "auth" / "adminService.ts").read_text(encoding="utf-8")
        m = re.search(r"listPendingProfiles:[\s\S]*?\n  \},", src)
        assert m and "status', 'pending'" in m.group(0), (
            "a fila deve filtrar apenas status=pending (rejected não aparece)"
        )
