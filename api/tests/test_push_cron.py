import importlib.util
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


def test_check_all_sem_cron_secret_fica_aberto(client, monkeypatch):
    """Sem CRON_SECRET configurado o endpoint mantém o comportamento legado (aberto)."""
    monkeypatch.delenv('CRON_SECRET', raising=False)
    resp = client.get('/api/push/check-all')
    assert resp.status_code == 200


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
