import importlib.util
import json
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'


@pytest.fixture(scope='session')
def push_module():
    spec = importlib.util.spec_from_file_location('reservalab_api', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_api'] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def client(push_module):
    return push_module.app.test_client()


def test_check_all_sem_cron_secret_fica_fechado(client, monkeypatch):
    """Sem CRON_SECRET configurado o endpoint retorna 503 (fail-closed)."""
    monkeypatch.delenv('CRON_SECRET', raising=False)
    resp = client.get('/api/push/check-all')
    assert resp.status_code == 503


def test_check_all_exige_header_com_cron_secret(client, monkeypatch):
    """Com CRON_SECRET configurado, sem o header Authorization → 401."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get('/api/push/check-all')
    assert resp.status_code == 401


def test_check_all_rejeita_header_errado(client, monkeypatch):
    """Com CRON_SECRET configurado, header errado → 401."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get('/api/push/check-all', headers={'Authorization': 'Bearer segredo-errado'})
    assert resp.status_code == 401


def test_check_all_aceita_header_correto(client, monkeypatch):
    """Com CRON_SECRET configurado, header `Bearer ${CRON_SECRET}` → 200 (padrão do Vercel Cron)."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get(
        '/api/push/check-all',
        headers={'Authorization': 'Bearer segredo-teste-123'},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body.get('checked') is True
    assert 'results' in body


# ── Proteção por CRON_SECRET nos demais endpoints de check ────────────────

CHECK_ENDPOINTS = ['/api/push/check', '/api/push/check-overdue', '/api/push/check-pcare']


@pytest.mark.parametrize('endpoint', CHECK_ENDPOINTS)
def test_checks_sem_cron_secret_ficam_abertos(client, monkeypatch, endpoint):
    """Sem CRON_SECRET os endpoints mantem o comportamento legado (aberto)."""
    monkeypatch.delenv('CRON_SECRET', raising=False)
    resp = client.get(endpoint)
    assert resp.status_code != 401


@pytest.mark.parametrize('endpoint', CHECK_ENDPOINTS)
def test_checks_exigem_header_com_cron_secret(client, monkeypatch, endpoint):
    """Com CRON_SECRET configurado, sem o header Authorization -> 401."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get(endpoint)
    assert resp.status_code == 401


@pytest.mark.parametrize('endpoint', CHECK_ENDPOINTS)
def test_checks_rejeitam_header_errado(client, monkeypatch, endpoint):
    """Com CRON_SECRET configurado, header errado -> 401."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get(endpoint, headers={'Authorization': 'Bearer segredo-errado'})
    assert resp.status_code == 401


@pytest.mark.parametrize('endpoint', CHECK_ENDPOINTS)
def test_checks_aceitam_header_correto(client, monkeypatch, endpoint):
    """Com CRON_SECRET configurado, header correto nao retorna 401 (padrao do Vercel Cron)."""
    monkeypatch.setenv('CRON_SECRET', 'segredo-teste-123')
    resp = client.get(endpoint, headers={'Authorization': 'Bearer segredo-teste-123'})
    assert resp.status_code != 401


# ── Filtro por workspace no alerta de reserva próxima ──────────────────────

class FakeRedis:
    """Fake mínimo do cliente Redis usado pelos checks de push."""

    def __init__(self, members=None):
        self._members = members if members is not None else set()

    def smembers(self, key):
        return set(self._members)

    def get(self, key):
        return None

    def setex(self, *args, **kwargs):
        pass

    def delete(self, key):
        self._members = set()

    def sadd(self, key, value):
        self._members.add(value)


def _push_sub(user):
    return {
        'key': 'k-' + user['id'],
        'endpoint': f'https://push.example/{user["id"]}',
        'keys': {},
        'user': user,
    }


def test_target_subs_filtra_por_workspace(push_module, monkeypatch):
    """Alerta de tablets de um campus só chega para quem tem acesso àquele workspace.

    Cobre a mudança do /api/push/check: reserva de tablets com workspace_id passa
    a mirar apenas os assinantes do campus (super admin vê todos).
    """
    admin = {'id': 'u-admin', 'role': 'admin', 'is_super_admin': True, 'workspace_ids': ['a', 'b'], 'apps': {}, 'notify_settings': {}}
    tech_a = {'id': 'u-a', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': True}, 'notify_settings': {}}
    tech_b = {'id': 'u-b', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['b'], 'apps': {'reservalab': True}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(admin), ensure_ascii=False),
        json.dumps(_push_sub(tech_a), ensure_ascii=False),
        json.dumps(_push_sub(tech_b), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)

    out = push_module._target_subs(module='reservalab', workspace_id='a')
    ids = sorted(s['user']['id'] for s in out)

    # Admin absoluto vê todos; tech do campus B fica de fora
    assert ids == ['u-a', 'u-admin']


def test_target_subs_sem_workspace_atinge_todos(push_module, monkeypatch):
    """Reserva de tablets sem workspace_id mantém o comportamento legado (todos os assinantes)."""
    tech_a = {'id': 'u-a', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': True}, 'notify_settings': {}}
    tech_b = {'id': 'u-b', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['b'], 'apps': {'reservalab': True}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(tech_a), ensure_ascii=False),
        json.dumps(_push_sub(tech_b), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)

    out = push_module._target_subs(module='reservalab')
    ids = sorted(s['user']['id'] for s in out)

    assert ids == ['u-a', 'u-b']
