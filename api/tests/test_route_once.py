"""Testes do registro idempotente de rotas e do guard de segredo de assinatura.

Cobre a revisão da PR #412:
  - @_route_once tolera re-execução do módulo (mesma rota/endpoint) — issue #413.
  - @_route_once FALHA ALTO em colisão real (mesmo endpoint, rota diferente) —
    não mascara o AssertionError que o @app.route padrão emitiria.
  - Tokens QR com segredo de assinatura vazio são rejeitados (fail-closed) e
    /api/tv/request-qr responde 503 em vez de emitir QR forjável.
"""
import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

from _api_loader import load_api

appmod = load_api()

_route_once = appmod._route_once


# ── @_route_once: idempotência e fail-loud ────────────────────────────────────
#
# Usa um Flask app DESCARTÁVEL (monkeypatch em appmod.app): na suíte completa
# outros testes já enviaram requests ao app compartilhado e o Flask recusa
# add_url_rule após a primeira request. O decorador lê o módulo-global `app`
# em tempo de chamada, então o patch isola o teste sem afetar os demais.


@pytest.fixture()
def fresh_app(monkeypatch):
    from flask import Flask

    fresh = Flask("_tv_route_once_test")
    monkeypatch.setattr(appmod, "app", fresh)
    return fresh


def test_reexecucao_mesma_rota_e_idempotente(fresh_app):
    """Registrar o MESMO endpoint na MESMA rota duas vezes (simula re-execução
    do módulo) registra a rota uma única vez e não levanta erro."""
    @_route_once('/_tv_test/once', methods=['GET'])
    def _tv_route_once_target():
        return 'ok'

    # segunda execução: novo objeto função, mesmo nome e mesma rota
    @_route_once('/_tv_test/once', methods=['GET'])
    def _tv_route_once_target():
        return 'ok'

    rules = [r.rule for r in fresh_app.url_map.iter_rules()
             if r.rule == '/_tv_test/once']
    assert len(rules) == 1


def test_colisao_endpoint_rota_diferente_falha_alto(fresh_app):
    """Mesmo endpoint em rota DIFERENTE é colisão real: deve falhar alto
    (comportamento do Flask padrão), nunca registrar silenciosamente."""
    @_route_once('/_tv_test/collision-a', methods=['GET'])
    def _tv_route_once_collision():
        return 'a'

    with pytest.raises(AssertionError, match='colisão de endpoint'):
        @_route_once('/_tv_test/collision-b', methods=['GET'])
        def _tv_route_once_collision():
            return 'b'

    # a rota B não pode ter sido registrada
    rules = [r.rule for r in fresh_app.url_map.iter_rules()
             if r.rule == '/_tv_test/collision-b']
    assert rules == []


# ── guard de segredo de assinatura vazio ─────────────────────────────────────

def test_token_segredo_vazio_e_rejeitado(monkeypatch):
    """HMAC com chave vazia seria forjável; verificação fail-closed."""
    monkeypatch.setattr(appmod, 'TV_REQUEST_SIGNING_SECRET', '')
    assert appmod._verify_request_token('qualquer.token.aqui') is None


@pytest.fixture()
def tv_qr_client(monkeypatch):
    """Client com device-auth de TV resolvido para um workspace válido."""
    from test_tv_public_request_isolation import FakeRequests, FakeResponse, headers_for

    fake = FakeRequests()
    monkeypatch.setattr(appmod, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(appmod, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.setattr(appmod, 'requests', fake)
    monkeypatch.setattr(appmod, 'redis', None)
    fake.route('GET', 'rest/v1/profiles', FakeResponse([{
        'id': 'dev-user-a', 'email': 'dev@labhub.local', 'name': 'Kiosk',
        'role': 'tv_device', 'is_super_admin': False, 'status': 'active',
    }]))
    fake.route('GET', 'rest/v1/memberships', FakeResponse([]))
    fake.route('GET', 'rest/v1/tv_devices?user_id=', FakeResponse([
        {'id': '11111111-1111-1111-1111-111111111111',
         'workspace_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
    ]))
    auth_mod = __import__('auth')
    monkeypatch.setattr(auth_mod, 'requests', fake)
    monkeypatch.setattr(auth_mod, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(auth_mod, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    appmod._rate_limit_store.clear()
    return appmod.app.test_client(), headers_for


def test_request_qr_segredo_indisponivel_retorna_503(tv_qr_client, monkeypatch):
    client, headers_for = tv_qr_client
    monkeypatch.setattr(appmod, 'TV_REQUEST_SIGNING_AVAILABLE', False)
    res = client.get('/api/tv/request-qr', headers=headers_for())
    assert res.status_code == 503
    assert 'error' in res.json
