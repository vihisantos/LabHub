"""Auditoria de inscrições push: GET /api/push/admin/subscriptions.

- Exige JWT (@require_auth) e super admin (@require_admin): 401/403;
- Lista inscrições com o payload de segmentação usado pelo _target_subs
  (apps, workspace_ids, notify_settings) para diagnosticar "por que X não
  recebe push";
- Filtros: ?user_id= e ?workspace_id= (super admins aparecem em qualquer
  filtro de workspace — mesmo comportamento do _target_subs nos envios);
- NUNCA expõe endpoint bruto nem chaves de criptografia da subscription.
"""
import importlib.util
import json
import sys
import time
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'


@pytest.fixture(scope='module')
def push_module():
    spec = importlib.util.spec_from_file_location('reservalab_api_admin_subs', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_api_admin_subs'] = mod
    spec.loader.exec_module(mod)
    return mod


SUB_MILENA = {
    'key': 'a' * 64,
    'endpoint': 'https://fcm.googleapis.com/fcm/send/segredo-1',
    'expirationTime': None,
    'keys': {'p256dh': 'k1', 'auth': 'a1'},
    'user': {
        'id': 'milena-1',
        'name': 'milenaossuna',
        'role': 'viewer',
        'is_super_admin': False,
        'workspace_ids': ['ws-a'],
        'apps': {'chamados': False},
        'notify_settings': {},
    },
}

SUB_VITOR = {
    'key': 'b' * 64,
    'endpoint': 'https://fcm.googleapis.com/fcm/send/segredo-2',
    'expirationTime': None,
    'keys': {'p256dh': 'k2', 'auth': 'a2'},
    'user': {
        'id': 'vitor-1',
        'name': 'Vitor Santos',
        'role': 'admin',
        'is_super_admin': True,
        'workspace_ids': [],
        'apps': {'chamados': True},
        'notify_settings': {},
    },
}

SUB_LEGADO_SEM_USER = {
    'key': 'c' * 64,
    'endpoint': 'https://fcm.googleapis.com/fcm/send/segredo-3',
    'keys': {'p256dh': 'k3', 'auth': 'a3'},
}

SUBS = [SUB_MILENA, SUB_VITOR, SUB_LEGADO_SEM_USER]


class FakeRedis:
    def smembers(self, key):
        return [json.dumps(s) for s in SUBS]


SUPER_ADMIN = {'id': 'admin-1', 'is_super_admin': True, 'status': 'active'}
TECH = {'id': 'tech-1', 'is_super_admin': False, 'status': 'active'}


def _auth(push_module, monkeypatch, profile):
    import auth as auth_mod
    monkeypatch.setattr(auth_mod, '_verify_jwt', lambda t: {'sub': profile['id'], 'exp': int(time.time()) + 60})
    monkeypatch.setattr(auth_mod, '_get_user_profile', lambda uid: profile)
    monkeypatch.setattr(push_module, 'redis', FakeRedis())
    return {'Authorization': 'Bearer token-valido'}


def _mock_memberships(push_module, monkeypatch, by_user):
    """Memberships ativas por usuário para resolução direta (9.3-B)."""

    class _Resp:
        ok = True

        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    class _Requests:
        @staticmethod
        def get(url, **kwargs):
            rows = []
            for uid, ws_ids in by_user.items():
                for ws in ws_ids:
                    rows.append({'profile_id': uid, 'workspace_id': ws, 'status': 'active'})
            return _Resp(rows)

    monkeypatch.setattr(push_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.setattr(push_module, 'requests', _Requests())


def test_sem_token_retorna_401(push_module, monkeypatch):
    client = push_module.app.test_client()
    resp = client.get('/api/push/admin/subscriptions')
    assert resp.status_code == 401


def test_nao_super_admin_retorna_403(push_module, monkeypatch):
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, TECH)
    resp = client.get('/api/push/admin/subscriptions', headers=headers)
    assert resp.status_code == 403


def test_super_admin_lista_todas_as_inscricoes(push_module, monkeypatch):
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    resp = client.get('/api/push/admin/subscriptions', headers=headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['total'] == 3
    names = [s['name'] for s in body['subscriptions']]
    assert 'milenaossuna' in names and 'Vitor Santos' in names
    # Inscrição legada sem user não quebra a listagem
    legado = [s for s in body['subscriptions'] if s['key'] == 'c' * 64][0]
    assert legado['user_id'] == '' and legado['apps'] == {}


def test_nao_expoe_endpoint_nem_chaves(push_module, monkeypatch):
    """O payload de auditoria nunca carrega o endpoint bruto nem as chaves."""
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    resp = client.get('/api/push/admin/subscriptions', headers=headers)
    text = resp.get_data(as_text=True)
    assert 'segredo-1' not in text and 'segredo-2' not in text and 'segredo-3' not in text
    for sub in resp.get_json()['subscriptions']:
        assert 'endpoint' not in sub and 'keys' not in sub


def test_carrega_segmentacao_para_diagnostico(push_module, monkeypatch):
    """O diagnóstico do 'por que não recebe' precisa dos campos de filtro."""
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    _mock_memberships(push_module, monkeypatch, {'milena-1': ['ws-a']})
    resp = client.get('/api/push/admin/subscriptions', headers=headers)
    milena = [s for s in resp.get_json()['subscriptions'] if s['name'] == 'milenaossuna'][0]
    assert milena['apps'] == {'chamados': False}  # ← causa raiz clássica
    assert milena['workspace_ids'] == ['ws-a']  # resolvido na hora, não do registro
    assert milena['is_super_admin'] is False


def test_filtro_por_user_id(push_module, monkeypatch):
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    resp = client.get('/api/push/admin/subscriptions?user_id=milena-1', headers=headers)
    body = resp.get_json()
    assert body['total'] == 1
    assert body['subscriptions'][0]['user_id'] == 'milena-1'


def test_filtro_por_workspace_inclui_super_admin(push_module, monkeypatch):
    """Mesma semântica do _target_subs: super admin recebe de qualquer workspace."""
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    _mock_memberships(push_module, monkeypatch, {'milena-1': ['ws-a']})
    resp = client.get('/api/push/admin/subscriptions?workspace_id=ws-a', headers=headers)
    body = resp.get_json()
    ids = {s['user_id'] for s in body['subscriptions']}
    assert ids == {'milena-1', 'vitor-1'}


def test_filtro_por_workspace_exclui_outros(push_module, monkeypatch):
    client = push_module.app.test_client()
    headers = _auth(push_module, monkeypatch, SUPER_ADMIN)
    resp = client.get('/api/push/admin/subscriptions?workspace_id=ws-inexistente', headers=headers)
    body = resp.get_json()
    ids = {s['user_id'] for s in body['subscriptions']}
    assert 'milena-1' not in ids  # não pertence ao workspace
