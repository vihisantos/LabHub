"""Tests for PR 5 â€” TV app-data describe + purge (backup obrigatÃ³rio).

POST /api/admin/app-data/describe
POST /api/admin/app-data/purge

Cobertura neste nÃ­vel (API Flask):
  - matriz de autorizaÃ§Ã£o (401/403/200, device, super admin, cross-workspace);
  - workspace resolvido do contexto autenticado: o valor repassado ao banco Ã©
    SEMPRE g.workspace_id validado por membership â€” A nunca consegue purgar B;
  - contrato de atomicidade: a API emite EXATAMENTE UMA chamada rpc atÃ´mica
    (backup+deletes+audit vivem numa Ãºnica transaÃ§Ã£o SQL, migration 032) e
    NUNCA emite DELETE direto para tabelas tv_*;
  - guarda de tamanho (APP_DATA_BACKUP_TOO_LARGE â†’ 413, zero deletes);
  - falha do rpc â†’ mensagem segura sem vazamento, nenhum passo parcial.

As garantias internas da transaÃ§Ã£o SQL (rollback total, NULL workspace_id fora
do escopo, preservaÃ§Ã£o de settings/devices/codes/music requests) sÃ£o da funÃ§Ã£o
public.purge_tv_app_data e sÃ£o verificadas pelas queries de verificaÃ§Ã£o da
migration 032 + predicates explÃ­citos no DDL.
"""

import importlib.util
import json
import hashlib
import hmac
import base64
import sys
import time
from pathlib import Path

import pytest
import requests as requests_lib

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"

SUPABASE_URL = "https://test.supabase.co"
SUPABASE_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars!!"

WS_A_ID = "11111111-1111-1111-1111-111111111111"
WS_B_ID = "22222222-2222-2222-2222-222222222222"
ADMIN_U1 = "aaaaaaaa-0000-0000-0000-000000000001"

DESCRIBE_URL = "/api/admin/app-data/describe"
PURGE_URL = "/api/admin/app-data/purge"


# â”€â”€ Fakes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FakeResponse:
    def __init__(self, payload, status_code=200, ok=None):
        self._payload = payload
        self.status_code = status_code
        self.ok = (status_code == 200) if ok is None else ok
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        return self._payload


class FakeRequests:
    """Intercepta requests; rotas por substring de URL ou predicado."""

    exceptions = requests_lib.exceptions

    def __init__(self):
        self.calls = []
        self._routes = []
        self._default = FakeResponse([])

    def route(self, method, url_part, response):
        self._routes.append((method, url_part, response, None))

    def route_pred(self, method, predicate, response):
        self._routes.append((method, "", response, predicate))

    def route_fn(self, method, handler):
        """Rota dinâmica: handler(url, kwargs) -> FakeResponse."""
        self._routes.append((method, "", None, handler))

    def _match(self, method, url, kwargs):
        hay_params = kwargs.get("params") or {}
        joined_params = json.dumps(kwargs.get("json") or {}) + "&".join(
            f"{k}={v}" for k, v in hay_params.items()
        )
        for m, part, response, pred in reversed(self._routes):
            if m != method:
                continue
            if pred is not None:
                result = pred(url, kwargs)
                if isinstance(result, FakeResponse):
                    return result
                if result:
                    return response
            elif part and (part in url or part in joined_params or part in json.dumps(kwargs.get("json") or {})):
                return response
        return self._default

    def _do(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        return self._match(method, url, kwargs)

    def get(self, url, **kwargs):
        return self._do("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._do("POST", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._do("DELETE", url, **kwargs)

    # â”€â”€ inspeÃ§Ã£o â”€â”€
    def rpc_calls(self, name):
        return [c for c in self.calls if f"/rpc/{name}" in c["url"]]

    def direct_tv_deletes(self):
        return [
            c for c in self.calls
            if c["method"] == "DELETE" and "/rest/v1/tv_" in c["url"]
        ]

    def calls_touching_workspace(self, ws_id):
        def touches(c):
            blob = json.dumps(c["kwargs"].get("json") or {}) + c["url"] + json.dumps(
                {k: str(v) for k, v in (c["kwargs"].get("params") or {}).items()}
            )
            return ws_id in blob
        return [c for c in self.calls if touches(c)]


# â”€â”€ JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _make_jwt(payload: dict, secret: str = SUPABASE_JWT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = {"exp": int(time.time()) + 3600, **payload}

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    signing_input = f"{b64url(header)}.{b64url(body)}"
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _token_for(user_id=ADMIN_U1, role="tv_device"):
    claims = {
        "sub": user_id,
        "iss": f"{SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
    }
    if role:
        claims["user_metadata"] = {"role": role}
    return _make_jwt(claims)


AUTH_HEADERS = lambda tok=None: {"Authorization": f"Bearer {tok or _token_for()}"}


# â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.fixture(scope="session")
def root_api_module():
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def purge_env(root_api_module, monkeypatch):
    fake = FakeRequests()

    class AuthMod:
        pass

    monkeypatch.setattr(root_api_module, "_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(root_api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(root_api_module, "requests", fake)
    monkeypatch.setattr(root_api_module, "redis", None)

    auth_mod = sys.modules.get("auth")
    if auth_mod is not None:
        monkeypatch.setattr(auth_mod, "requests", fake)
        monkeypatch.setattr(auth_mod, "_SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setattr(auth_mod, "_SUPABASE_SERVICE_KEY", "test-service-key")

    monkeypatch.setenv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET)
    root_api_module._rate_limit_store.clear()
    return fake


@pytest.fixture()
def purge_client(purge_env, root_api_module):
    return root_api_module.app.test_client()


# â”€â”€ Mundo fake: perfis/workspaces/rpc â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DESCRIBE_RESULT = {
    "tables": {
        "tv_events": 42,
        "tv_playlists": 3,
        "tv_announcements": 8,
        "tv_galleries": 4,
        "tv_gallery_photos": 27,
        "tv_music_queues": 2,
        "tv_music_tracks": 18,
        "tv_urgent_announcements": 1,
        "tv_calendar_cache": 1,
    },
    "total": 106,
}

PURGE_RESULT = {
    "result": "purged",
    "backupId": "b0ac0ffe-0000-0000-0000-000000000001",
    "backupExpiresAt": "2026-08-26T12:00:00+00:00",
    "auditId": "aud1ce-0000-0000-0000-000000000001",
    "deleted": {
        "tv_gallery_photos": 27,
        "tv_music_tracks": 18,
        "tv_events": 42,
        "tv_playlists": 3,
        "tv_announcements": 8,
        "tv_music_queues": 2,
        "tv_galleries": 4,
        "tv_calendar_cache": 1,
        "tv_urgent_announcements": 1,
    },
    "totalDeleted": 106,
}


ALL_WORKSPACES = [
    {"id": WS_A_ID, "name": "WS A", "slug": "a", "disabled_apps": []},
    {"id": WS_B_ID, "name": "WS B", "slug": "b", "disabled_apps": []},
]


def install_profile(fake, *, user_id=ADMIN_U1, workspaces, role="admin", is_super_admin=False):
    """Perfil com as memberships informadas; workspaces resolvidos por
    id/slug conforme a query real do auth layer."""

    def ws_lookup(url, kw):
        params = kw.get("params") or {}
        if "slug" in params:
            slug = str(params["slug"]).removeprefix("eq.")
            return FakeResponse([w for w in ALL_WORKSPACES if w["slug"] == slug])
        wid = str(params.get("id", "")).removeprefix("eq.")
        return FakeResponse([w for w in ALL_WORKSPACES if w["id"] == wid])

    fake.route("GET", "/rest/v1/profiles", FakeResponse([{
        "id": user_id,
        "email": f"{user_id[:8]}@labhub.local",
        "name": "Admin A" if not is_super_admin else "Super Admin",
        "role": role,
        "status": "active",
        "is_super_admin": is_super_admin,
        "workspace_ids": workspaces,
    }]))
    fake.route_fn("GET", lambda url, kw: ws_lookup(url, kw) if "/rest/v1/workspaces" in url else None)


def install_admin_world(fake):
    """Admin comum do workspace A; rpcs felizes."""
    install_profile(fake, workspaces=[WS_A_ID])
    fake.route("POST", "/rpc/describe_tv_app_data", FakeResponse(DESCRIBE_RESULT))
    fake.route("POST", "/rpc/purge_tv_app_data", FakeResponse(PURGE_RESULT))
    return fake


# â”€â”€ AutorizaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestAuthorization:
    @pytest.mark.parametrize("path", [DESCRIBE_URL, PURGE_URL])
    def test_sem_auth_retorna_401(self, purge_client, purge_env, path):
        install_admin_world(purge_env)
        resp = purge_client.post(path, json={"appId": "tv", "workspace_id": WS_A_ID})
        assert resp.status_code == 401

    def test_usuario_comum_sem_role_admin_retorna_403(self, purge_client, purge_env):
        install_profile(purge_env, workspaces=[WS_A_ID], role="member")
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 403
        assert purge_env.rpc_calls("purge_tv_app_data") == []

    def test_describe_usuario_comum_retorna_403(self, purge_client, purge_env):
        install_profile(purge_env, workspaces=[WS_A_ID], role="member")
        resp = purge_client.post(DESCRIBE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 403
        assert purge_env.rpc_calls("describe_tv_app_data") == []

    def test_device_user_e_rejeitado(self, purge_client, purge_env):
        # Device real (usuÃ¡rio GoTrue kiosk-*) nÃ£o tem profile â†’ 401 na camada
        # de auth; mesmo que exista profile nÃ£o-admin â†’ 403 no gate. Nenhum caminho chega ao rpc.
        purge_env.route("GET", "/rest/v1/profiles", FakeResponse([]))  # sem perfil
        resp = purge_client.post(
            PURGE_URL,
            json={"appId": "tv", "workspace_id": WS_A_ID},
            headers=AUTH_HEADERS(_token_for("dddddddd-0000-0000-0000-00000000000d")),
        )
        assert resp.status_code in (401, 403)
        assert purge_env.direct_tv_deletes() == []
        assert purge_env.rpc_calls("purge_tv_app_data") == []

    def test_profile_de_device_nao_admin_retorna_403(self, purge_client, purge_env):
        install_profile(
            purge_env,
            user_id="dddddddd-0000-0000-0000-00000000000d",
            workspaces=[WS_A_ID],
            role="device",
        )
        resp = purge_client.post(
            PURGE_URL,
            json={"appId": "tv", "workspace_id": WS_A_ID},
            headers=AUTH_HEADERS(_token_for("dddddddd-0000-0000-0000-00000000000d")),
        )
        assert resp.status_code == 403

    def test_admin_do_workspace_pode_purgar(self, purge_client, purge_env):
        install_admin_world(purge_env)
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True
        assert body["totalDeleted"] == 106
        assert body["backupId"] == PURGE_RESULT["backupId"]
        assert body["auditId"] == PURGE_RESULT["auditId"]

    def test_super_admin_pode_purgar(self, purge_client, purge_env):
        install_profile(purge_env, workspaces=[], role="admin", is_super_admin=True)
        purge_env.route("POST", "/rpc/purge_tv_app_data", FakeResponse(PURGE_RESULT))
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True


# â”€â”€ Regra de ouro: workspace vem do contexto autenticado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestGoldenRuleWorkspace:
    def test_admin_a_tentando_purgar_b_retorna_403_e_zero_delete(self, purge_client, purge_env):
        install_admin_world(purge_env)  # u1 sÃ³ Ã© membro de A
        resp = purge_client.post(
            PURGE_URL,
            json={"appId": "tv", "workspaceId": WS_B_ID},
            headers=AUTH_HEADERS(),
        )
        assert resp.status_code == 403
        assert purge_env.rpc_calls("purge_tv_app_data") == [], "rpc chegou ao workspace B!"
        assert purge_env.direct_tv_deletes() == []
        assert purge_env.calls_touching_workspace(WS_B_ID) == [], "nenhuma escrita em B Ã© permitida"

    def test_rpc_recebe_exatamente_o_workspace_autenticado(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        calls = purge_env.rpc_calls("purge_tv_app_data")
        assert len(calls) == 1
        sent = calls[0]["kwargs"]["json"]
        assert sent["p_workspace"] == WS_A_ID

    def test_describe_rpc_recebe_workspace_autenticado(self, purge_client, purge_env):
        install_admin_world(purge_env)
        resp = purge_client.post(DESCRIBE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["workspaceId"] == WS_A_ID
        assert body["tables"]["tv_events"] == 42
        assert body["total"] == 106
        sent = purge_env.rpc_calls("describe_tv_app_data")[0]["kwargs"]["json"]
        assert sent["p_workspace"] == WS_A_ID

    def test_body_nao_consegue_redirecionar_para_outro_workspace_via_slug(self, purge_client, purge_env):
        # require_workspace resolve slug apenas como membership; admin A pedindo
        # slug 'b' (workspace B) â†’ 403 antes de qualquer rpc.
        install_admin_world(purge_env)
        resp = purge_client.post(
            PURGE_URL,
            json={"appId": "tv", "workspace": "b"},
            headers=AUTH_HEADERS(),
        )
        assert resp.status_code == 403
        assert purge_env.rpc_calls("purge_tv_app_data") == []


# â”€â”€ Describe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestDescribeContract:
    def test_contagens_vindas_do_backend_nao_do_cliente(self, purge_client, purge_env):
        install_admin_world(purge_env)
        resp = purge_client.post(
            DESCRIBE_URL,
            json={"appId": "tv", "tables": {"tv_events": 999}, "total": 99999, "workspace_id": WS_A_ID},
            headers=AUTH_HEADERS(),
        )
        body = resp.get_json()
        assert body["tables"] == DESCRIBE_RESULT["tables"], "contagem do cliente vazou!"
        assert body["total"] == 106

    def test_tabelas_vazias_devolvem_total_zero(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_env.route(
            "POST", "/rpc/describe_tv_app_data",
            FakeResponse({"tables": {t: 0 for t in DESCRIBE_RESULT["tables"]}, "total": 0}),
        )
        resp = purge_client.post(DESCRIBE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        body = resp.get_json()
        assert body["total"] == 0
        assert all(v == 0 for v in body["tables"].values())

    def test_contrato_contagens_incluem_tabelas_filhas_cascade(self, purge_client, purge_env):
        """Contagens e resultado cobrem pais E filhos (FK ON DELETE CASCADE):
        tv_gallery_photos via tv_galleries; tv_music_tracks via tv_music_queues.
        Mesmo escopo no describe, no snapshot de backup e no resumo do purge."""
        install_admin_world(purge_env)
        resp = purge_client.post(DESCRIBE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        tables = resp.get_json()["tables"]
        assert tables["tv_gallery_photos"] == 27
        assert tables["tv_music_tracks"] == 18

        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        deleted = resp.get_json()["deleted"]
        assert deleted["tv_gallery_photos"] == 27
        assert deleted["tv_music_tracks"] == 18

    def test_appid_invalido_rejeitado(self, purge_client, purge_env):
        install_admin_world(purge_env)
        for app_id in ("chamados-dashboard", "reservalab", "../tv"):
            resp = purge_client.post(
                DESCRIBE_URL,
                json={"appId": app_id, "workspace_id": WS_A_ID},
                headers=AUTH_HEADERS(),
            )
            assert resp.status_code == 400, app_id

    def test_appid_obrigatorio(self, purge_client, purge_env):
        install_admin_world(purge_env)
        resp = purge_client.post(DESCRIBE_URL, json={"workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 400


# â”€â”€ Backup / purge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestBackupBeforePurge:
    def test_purge_emite_unico_rpc_atomico_backup_deletes_audit(self, purge_client, purge_env):
        """BACKUPâ†’PURGE na mesma transaÃ§Ã£o SQL: a API nunca orquestra passos
        separados (nÃ£o existe janela backup-OK-sem-purge nem purge-parcial)."""
        install_admin_world(purge_env)
        purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        purge_calls = purge_env.rpc_calls("purge_tv_app_data")
        assert len(purge_calls) == 1
        sent = purge_calls[0]["kwargs"]["json"]
        expected_max_rows = sys.modules["root_api"].APP_DATA_PURGE_MAX_ROWS
        assert sent["p_max_rows"] == expected_max_rows
        assert sent["p_max_bytes"] > 0
        assert sent["p_actor_id"] == ADMIN_U1
        assert sent["p_actor_name"] == "Admin A"

    def test_parametros_do_cliente_nao_afrouxam_guardas(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_client.post(
            PURGE_URL,
            json={"appId": "tv", "workspace_id": WS_A_ID, "maxRows": 10**9, "maxBytes": 10**12},
            headers=AUTH_HEADERS(),
        )
        sent = purge_env.rpc_calls("purge_tv_app_data")[0]["kwargs"]["json"]
        expected_max_rows = sys.modules["root_api"].APP_DATA_PURGE_MAX_ROWS
        assert sent["p_max_rows"] == expected_max_rows

    def test_tamanho_excedido_zero_deletes_mensagem_segura(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_env.route(
            "POST", "/rpc/purge_tv_app_data",
            FakeResponse('{"message": "APP_DATA_BACKUP_TOO_LARGE_BYTES"}', status_code=400),
        )
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 413
        body = resp.get_json()
        assert body["code"] == "backup_too_large"
        assert "Nada foi removido" in body["error"]
        assert "APP_DATA_BACKUP_TOO_LARGE" not in body["error"], "detalhe interno vazou"
        assert purge_env.direct_tv_deletes() == []

    def test_falha_generica_no_purge_zero_deletes_e_mensagem_segura(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_env.route(
            "POST", "/rpc/purge_tv_app_data",
            FakeResponse('{"message": "internal error details"}', status_code=500),
        )
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 500
        body = resp.get_json()
        assert "Nenhum dado foi removido" in body["error"]
        assert "internal error details" not in body["error"]
        assert purge_env.direct_tv_deletes() == []
        assert len(purge_env.rpc_calls("purge_tv_app_data")) == 1  # sem retry parcial

    def test_resultado_empty_quando_workspace_sem_dados(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_env.route(
            "POST", "/rpc/purge_tv_app_data",
            FakeResponse({
                "result": "empty", "backupId": None, "auditId": None,
                "deleted": {}, "totalDeleted": 0,
            }),
        )
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True and body["empty"] is True
        assert body["totalDeleted"] == 0


# â”€â”€ Escopo: nada alÃ©m do rpc sai da API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestSqlScopeByConstruction:
    @pytest.mark.parametrize("path", [DESCRIBE_URL, PURGE_URL])
    def test_api_nunca_emite_delete_direto_em_tabelas_tv(self, purge_client, purge_env, path):
        install_admin_world(purge_env)
        purge_client.post(path, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert purge_env.direct_tv_deletes() == [], (
            "todo DELETE precisa nascer dentro da transaÃ§Ã£o SQL workspace-scoped"
        )

    def test_nenhuma_chamada_alcanca_workspace_b_em_cenario_feliz(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_client.post(DESCRIBE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert purge_env.calls_touching_workspace(WS_B_ID) == []


# â”€â”€ ConcorrÃªncia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestConcurrency:
    def test_cada_purge_e_uma_unica_transacao_serializavel_por_workspace(self, purge_client, purge_env):
        """A proteÃ§Ã£o anti-concorrÃªncia vive no advisory lock da funÃ§Ã£o SQL
        (pg_advisory_xact_lock por workspace): dois purges simultÃ¢neos sÃ£o
        serializados pelo banco â€” o segundo encontra zero linhas ('empty')."""
        install_admin_world(purge_env)
        r1 = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        r2 = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert r1.status_code == 200 and r2.status_code == 200

        # Simula o segundo chamador chegando apÃ³s o primeiro (lock liberado).
        purge_env.route(
            "POST", "/rpc/purge_tv_app_data",
            FakeResponse({
                "result": "empty", "backupId": None, "auditId": None,
                "deleted": {}, "totalDeleted": 0,
            }),
        )
        r3 = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert r3.status_code == 200
        assert r3.get_json()["empty"] is True


# â”€â”€ Audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestAuditContract:
    def test_actor_e_repassado_ao_banco_para_o_audit(self, purge_client, purge_env):
        install_admin_world(purge_env)
        purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        sent = purge_env.rpc_calls("purge_tv_app_data")[0]["kwargs"]["json"]
        assert sent["p_actor_id"] == ADMIN_U1
        assert sent["p_actor_name"]

    def test_audit_id_do_banco_e_devolvido_ao_cliente(self, purge_client, purge_env):
        install_admin_world(purge_env)
        resp = purge_client.post(PURGE_URL, json={"appId": "tv", "workspace_id": WS_A_ID}, headers=AUTH_HEADERS())
        assert resp.get_json()["auditId"] == PURGE_RESULT["auditId"]


