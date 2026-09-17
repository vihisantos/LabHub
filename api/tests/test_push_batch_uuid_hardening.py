"""Hardening de `_resolve_batch_memberships`: ids não-UUID não podem
envenenar o lote de memberships (PostgREST 400/22P02) e derrubar TODA a
seleção de destinatários de push.

Incidente real: inscrições de teste com `user.id = 'user-1'` faziam a query
`profile_id=in.("user-1", "<uuid>")` ser rejeitada com
`22P02 invalid input syntax for type uuid`; o batch retornava {} (fail-closed)
e TODOS os não-super-admin deixavam de receber Chamados (o super admin passa
por bypass, então só ele recebia).

O fake PostgREST abaixo replica o comportamento real: se qualquer id não-UUID
entrar no `in.(...)`, responde 400/22P02 — qualquer regressão faz os asserts
de seleção falharem por contrato.
"""
import importlib.util
import json
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import unquote

import pytest

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'

WS_A = '25257d4b-9ec9-4119-be5b-88901ce7d94c'
WS_B = '5ee618dd-8f8d-44c5-b0c3-bbf6f0fa8cdf'

SUPER = {'id': '11111111-1111-4111-8111-111111111111', 'name': 'Super', 'role': 'admin', 'is_super_admin': True, 'workspace_ids': [], 'apps': {'chamados': True}, 'notify_settings': {}}
FULL_A = {'id': '22222222-2222-4222-8222-222222222222', 'name': 'Full A', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': True}, 'notify_settings': {}}
FULL_B = {'id': '33333333-3333-4333-8333-333333333333', 'name': 'Full B', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_B], 'apps': {'chamados': True}, 'notify_settings': {}}
READ_A = {'id': '44444444-4444-4444-8444-444444444444', 'name': 'Read A', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': 'read'}, 'notify_settings': {}}
NO_WS = {'id': '55555555-5555-4555-8555-555555555555', 'name': 'Sem ws', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [], 'apps': {'chamados': True}, 'notify_settings': {}}
DASH_A = {'id': '66666666-6666-4666-8666-666666666666', 'name': 'Dash A', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': 'dash'}, 'notify_settings': {}}
USER1 = {'id': 'user-1', 'name': 'user-1', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': True}, 'notify_settings': {}}
USER2 = {'id': 'user-2', 'name': 'user-2', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': True}, 'notify_settings': {}}

MEMBERSHIPS = {
    FULL_A['id']: [WS_A],
    FULL_B['id']: [WS_B],
    READ_A['id']: [WS_A],
}


@pytest.fixture(scope='module')
def push_module():
    spec = importlib.util.spec_from_file_location('reservalab_api_uuid_hardening', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_api_uuid_hardening'] = mod
    spec.loader.exec_module(mod)
    return mod


def _sub(user):
    return {
        'key': 'k',
        'endpoint': 'https://fcm.googleapis.com/fcm/send/seg',
        'expirationTime': None,
        'keys': {'p256dh': 'p', 'auth': 'a'},
        'user': user,
    }


_LEGACY_SUB = {
    'key': 'legacy',
    'endpoint': 'https://fcm.googleapis.com/fcm/send/legacy',
    'expirationTime': None,
    'keys': {'p256dh': 'pl', 'auth': 'al'},
}


class FakeRedis:
    def __init__(self, subs):
        self.subs = subs

    def smembers(self, key):
        return [json.dumps(s) for s in self.subs]


def _ids_in_url(url):
    m = re.search(r'profile_id=in\.\(([^)]*)\)', url)
    if not m:
        return []
    raw = unquote(m.group(1))
    return [x.strip().strip('"') for x in raw.split(',') if x.strip()]


def _is_uuid(value):
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError):
        return False


class _Resp:
    def __init__(self, ok, payload):
        self.ok = ok
        self._payload = payload

    def json(self):
        return self._payload


class FakePostgRest:
    """Replica o PostgREST: 400/22P02 se algum id não-UUID entrar no in.(...)."""

    def __init__(self, by_user, *, ok=True):
        self.by_user = by_user
        self._ok = ok
        self.calls = 0
        self.urls = []

    def get(self, url, **kwargs):
        self.calls += 1
        self.urls.append(url)
        if not self._ok:
            return _Resp(False, {'message': 'efeito de falha real (ex.: rede/upstream)'})
        for i in _ids_in_url(url):
            if not _is_uuid(i):
                return _Resp(False, {
                    'code': '22P02',
                    'message': f'invalid input syntax for type uuid: "{i}"',
                })
        ids = _ids_in_url(url)
        rows = []
        for uid, ws_ids in self.by_user.items():
            if uid in ids:
                for ws in ws_ids:
                    rows.append({'profile_id': uid, 'workspace_id': ws, 'status': 'active'})
        return _Resp(True, rows)


def _env(push_module, monkeypatch, subs, *, ok=True):
    fake_http = FakePostgRest(MEMBERSHIPS, ok=ok)
    monkeypatch.setattr(push_module, 'redis', FakeRedis(subs))
    monkeypatch.setattr(push_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.setattr(push_module, 'requests', fake_http)
    return fake_http


def _select(push_module, workspace_id, *, min_level='full'):
    return sorted(s['user']['id'] for s in push_module._target_subs(
        module='chamados', workspace_id=workspace_id, min_level=min_level,
    ))


def test_apenas_uuids_validos_preserva_selecao(push_module, monkeypatch):
    """A) Sem ids inválidos: comportamento inalterado (FULL do ws; read fica fora)."""
    fake_http = _env(push_module, monkeypatch, [_sub(FULL_A), _sub(READ_A), _sub(FULL_B)])
    ids = _select(push_module, WS_A)
    assert ids == [FULL_A['id']]
    for url in fake_http.urls:
        assert all(_is_uuid(i) for i in _ids_in_url(url))


def test_incidente_equivalente_user1_validos_preservados(push_module, monkeypatch, caplog):
    """B) Caso real user-1: o inválido é ignorado e os UUIDs válidos seguem selecionados."""
    fake_http = _env(push_module, monkeypatch, [_sub(FULL_A), _sub(USER1)])
    with caplog.at_level('WARNING', logger='reservalab_api_uuid_hardening'):
        ids = _select(push_module, WS_A)
    assert ids == [FULL_A['id']]  # sob o bug o lote 400ava e ninguém não-super era selecionado
    assert all(_is_uuid(i) for i in _ids_in_url(fake_http.urls[-1]))
    assert any('não-UUID' in m and 'user-1' in m for m in caplog.messages)
    assert not any('fcm.googleapis.com' in m for m in caplog.messages)  # sem dados sensíveis


def test_varios_validos_e_varios_invalidos(push_module, monkeypatch, caplog):
    """C) Múltiplos válidos + 'user-1', 'user-2' e legado sem user: válidos intactos."""
    fake_http = _env(push_module, monkeypatch, [_sub(FULL_A), _sub(READ_A), _sub(FULL_B), _sub(USER1), _sub(USER2), _LEGACY_SUB])
    with caplog.at_level('WARNING', logger='reservalab_api_uuid_hardening'):
        ids = _select(push_module, WS_A)
    assert ids == [FULL_A['id']]
    queried = set()
    for url in fake_http.urls:
        queried |= set(_ids_in_url(url))
    assert all(_is_uuid(i) for i in queried)
    assert queried == {FULL_A['id'], READ_A['id'], FULL_B['id']}
    assert any('2 user_id(s) não-UUID' in m for m in caplog.messages)


def test_apenas_ids_invalidos_sem_query_e_sem_22p02(push_module, monkeypatch):
    """D) Só ids inválidos: nem consulta é feita (elimina o risco de 400/22P02)."""
    fake_http = _env(push_module, monkeypatch, [_sub(USER1), _sub(USER2), _LEGACY_SUB])
    ids = _select(push_module, WS_A)
    assert ids == []
    assert fake_http.calls == 0


def test_erro_real_do_supabase_fail_closed(push_module, monkeypatch):
    """E) Falha genuína do Supabase continua fail-closed (algum não fica sem envio)."""
    fake_http = _env(push_module, monkeypatch, [_sub(FULL_A), _sub(FULL_B)], ok=False)
    ids = _select(push_module, WS_A)
    assert ids == []
    assert fake_http.calls == 1


def test_super_admin_comportamento_preservado(push_module, monkeypatch):
    """F) Super admin continua passando (bypass de workspace/min_level)."""
    fake_http = _env(push_module, monkeypatch, [_sub(SUPER), _sub(FULL_A)])
    ids = _select(push_module, WS_A)
    assert ids == sorted([SUPER['id'], FULL_A['id']])
    assert fake_http.calls == 1


def test_usuario_sem_membership_excluido(push_module, monkeypatch):
    """G) UUID válido sem membership ativa no workspace: excluído (vazio de sucesso, não do bug)."""
    fake_http = _env(push_module, monkeypatch, [_sub(NO_WS)])
    ids = _select(push_module, WS_A)
    assert ids == []
    assert fake_http.calls == 1


def test_min_level_full_exclui_read_e_dash(push_module, monkeypatch):
    """H) min_level='full' mantém full; read e dash ficam fora (rank preservado)."""
    fake_http = _env(push_module, monkeypatch, [_sub(FULL_A), _sub(READ_A), _sub(DASH_A)])
    ids = _select(push_module, WS_A)
    assert ids == [FULL_A['id']]