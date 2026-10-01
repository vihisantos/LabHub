"""Targeting de push RBAC2 — F2-D-E: o destino é decidido NO SERVIDOR pela
membership ativa + Actions do role (service_role). O campo `apps` do snapshot
da inscrição NUNCA decide; módulo/nível sem critério ⇒ só super admin recebe.

Estes testes fixam os dez casos exigidos (§14) + os casos de segurança (§13):
  1. cliente não escala via `apps` (sem Action não recebe mesmo com apps);
  2. membership + Action do módulo ⇒ recebe;
  3. membership sem Action ⇒ não recebe (Action perdida reflete no próximo push);
  4. Action em outro workspace vs. evento ⇒ não recebe;
  5. múltiplas memberships por usuário resolvidas (evento escolhe o workspace);
  6. sem membership ativa ⇒ não recebe;
  7. notify_settings preservados (mudo global + canal push por app);
  8. filtros operacionais preservados (user_id, role);
  9. branches mortos de `role='admin'` removidos (auth ⇒ só super admin);
 10. payload da inscrição permanece compatível (módulo None = sem filtro).
"""
import importlib.util
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

import pytest

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'

WS_A = '25257d4b-9ec9-4119-be5b-88901ce7d94c'
WS_B = '5ee618dd-8f8d-44c5-b0c3-bbf6f0fa8cdf'


@pytest.fixture(scope='session')
def push_module():
    spec = importlib.util.spec_from_file_location('reservalab_push_rbac2', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_push_rbac2'] = mod
    spec.loader.exec_module(mod)
    return mod


def _uid(n):
    return f'{n:08x}-0000-4000-8000-{n:012x}'


SUPER = {'id': _uid(1), 'name': 'Super', 'role': 'coordinator', 'is_super_admin': True, 'workspace_ids': [], 'apps': {}, 'notify_settings': {}}
TEC_A = {'id': _uid(2), 'name': 'Tec A', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'reservalab': True}, 'notify_settings': {}}
VIS_A = {'id': _uid(3), 'name': 'Vis A', 'role': 'viewer', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'reservalab': True}, 'notify_settings': {}}
TEC_B = {'id': _uid(4), 'name': 'Tec B', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_B], 'apps': {'reservalab': 'full'}, 'notify_settings': {}}
MULTI = {'id': _uid(5), 'name': 'Multi', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A, WS_B], 'apps': {}, 'notify_settings': {}}
NO_WS = {'id': _uid(6), 'name': 'Sem ws', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [], 'apps': {'reservalab': 'full'}, 'notify_settings': {}}
MUTED = {'id': _uid(7), 'name': 'Mudo', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'reservalab': True}, 'notify_settings': {'muted': True}}
CH_OFF = {'id': _uid(8), 'name': 'Canal off', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'reservalab': True}, 'notify_settings': {'apps': {'reservalab': {'push': False}}}}
FAKE_FULL = {'id': _uid(9), 'name': 'Fake full', 'role': 'technician', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'reservalab': 'full'}, 'notify_settings': {}}
LEGACY_ADMIN = {'id': _uid(10), 'name': 'Legacy adm', 'role': 'admin', 'is_super_admin': False, 'workspace_ids': [WS_A], 'apps': {'chamados': True}, 'notify_settings': {}}

# Memberships: {uid: {ws: role}} — mem_id derivado é determinístico.
MEMBERSHIPS = {
    TEC_A['id']: {WS_A: 'role-tec'},
    VIS_A['id']: {WS_A: 'role-vis'},
    TEC_B['id']: {WS_B: 'role-tec'},
    MULTI['id']: {WS_A: 'role-tec', WS_B: 'role-tec'},
    MUTED['id']: {WS_A: 'role-tec'},
    CH_OFF['id']: {WS_A: 'role-tec'},
    FAKE_FULL['id']: {WS_A: 'role-vis'},
    LEGACY_ADMIN['id']: {WS_A: 'role-vis'},
}
ROLE_ACTIONS = {
    'role-tec': {'reservelab.tablet.reserve', 'reservelab.tablet.cancel', 'ticket.edit', 'ticket.status'},
    'role-vis': {'ticket.view'},
}

TABLET_RESERVA = dict(module='reservalab', workspace_id=WS_A, min_level='full')
CHAMADOS_FULL = dict(module='chamados', workspace_id=WS_A, min_level='full')


def _sub(user):
    return {
        'key': 'k-' + user['id'],
        'endpoint': f'https://push.example/{user["id"]}',
        'expirationTime': None,
        'keys': {'p256dh': 'p', 'auth': 'a'},
        'user': user,
    }


class _Resp:
    def __init__(self, ok, payload):
        self.ok = ok
        self._payload = payload

    def json(self):
        return self._payload


def _ids_in_url(url, param='profile_id'):
    m = re.search(re.escape(f'{param}=in.(') + r'([^)]*)\)', url)
    if not m:
        return []
    raw = unquote(m.group(1))
    return [x.strip().strip('"') for x in raw.split(',') if x.strip()]


class FakeRedis:
    def __init__(self, subs):
        self.subs = subs

    def smembers(self, key):
        return [json.dumps(s) for s in self.subs]


class FakePostgRest:
    """Fake do PostgREST para memberships + role_permissions + overrides."""

    def __init__(self, memberships=None, role_actions=None, overrides=None):
        self.memberships = memberships or {}
        self.role_actions = role_actions or {}
        self.overrides = overrides or {}
        self.calls = 0
        self.urls = []

    def get(self, url, **kwargs):
        self.calls += 1
        self.urls.append(url)
        if '/rest/v1/memberships' in url:
            wanted = set(_ids_in_url(url))
            rows = []
            for uid, ws_map in self.memberships.items():
                if uid in wanted:
                    for ws, role in ws_map.items():
                        rows.append({
                            'profile_id': uid,
                            'workspace_id': ws,
                            'status': 'active',
                            'id': f'mem-{uid}-{ws}',
                            'role_id': role,
                        })
            return _Resp(True, rows)
        if '/rest/v1/role_permissions' in url:
            rows = [
                {'role_id': r, 'action': a, 'scope': 'workspace'}
                for r, acts in self.role_actions.items() for a in acts
            ]
            return _Resp(True, rows)
        if '/rest/v1/membership_overrides' in url:
            rows = [
                {'membership_id': m, 'action': a, 'effect': e}
                for m, effs in self.overrides.items() for a, e in effs.items()
            ]
            return _Resp(True, rows)
        raise AssertionError(f'URL inesperada: {url}')


def _env(push_module, monkeypatch, users, *, memberships=MEMBERSHIPS,
         role_actions=ROLE_ACTIONS, overrides=None):
    fake_db = FakePostgRest(memberships, role_actions, overrides)
    monkeypatch.setattr(push_module, 'redis', FakeRedis([_sub(u) for u in users]))
    monkeypatch.setattr(push_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.setattr(push_module, 'requests', fake_db)
    return fake_db


def _select(push_module, **kw):
    return sorted(s['user']['id'] for s in push_module._target_subs(**kw))


# 1/3. Cliente não escala via `apps`: sem Action não recebe mesmo com apps cheio ─


def test_apps_nao_escala_targeting(push_module, monkeypatch):
    """`apps.reservalab='full'` no snapshot NÃO concede envio (sem Action)."""
    _env(push_module, monkeypatch, [TEC_A, FAKE_FULL])
    ids = _select(push_module, **TABLET_RESERVA)
    # FAKE_FULL tem o payload cheio mas só TEC_A tem a Action do módulo
    assert ids == [TEC_A['id']]


def test_apps_desligado_nao_bloqueia_targeting(push_module, monkeypatch):
    """`apps` ausente/desligado não exclui: a Action na membership é que decide."""
    off = dict(TEC_A)
    off['apps'] = {'reservalab': False}
    _env(push_module, monkeypatch, [off])
    assert _select(push_module, **TABLET_RESERVA) == [off['id']]


# 2. Membership + Action ⇒ recebe ────────────────────────────────────────────


def test_membership_e_action_recebe(push_module, monkeypatch):
    """O caminho feliz: role-tec (tablet.reserve) na membership do campus recebe."""
    _env(push_module, monkeypatch, [TEC_A, VIS_A])
    assert _select(push_module, **TABLET_RESERVA) == [TEC_A['id']]


# 3. Membership sem Action ⇒ não recebe (Action perdida reflete no próximo) ──


def test_membership_sem_action_nao_recebe(push_module, monkeypatch):
    """role-vis (só ticket.view) não recebe push de reserva do reservalab."""
    _env(push_module, monkeypatch, [VIS_A, TEC_A])
    assert _select(push_module, **TABLET_RESERVA) == [TEC_A['id']]


# 4. Action em outro workspace vs. evento ⇒ não recebe ───────────────────────


def test_action_em_outro_workspace_nao_recebe(push_module, monkeypatch):
    """TEC_B tem a Action, mas a membership é do WS_B — evento do WS_A não chega."""
    _env(push_module, monkeypatch, [TEC_B])
    assert _select(push_module, **TABLET_RESERVA) == []
    # no próprio workspace o mesmo usuário recebe
    assert _select(push_module, module='reservalab', workspace_id=WS_B, min_level='full') == [TEC_B['id']]


# 5. Múltiplas memberships por usuário: o evento escolhe o workspace ─────────


def test_multiplas_memberships_resolvem_workspace_correto(push_module, monkeypatch):
    """MULTI está em ws A e B; alerta do ws A resolve pela membership A (1 linha)."""
    _env(push_module, monkeypatch, [MULTI])
    out = push_module._target_subs(**TABLET_RESERVA)
    assert [s['user']['id'] for s in out] == [MULTI['id']]
    # uma linha por assinante, nunca por membership
    assert len(out) == 1


# 6. Sem membership ativa ⇒ não recebe ───────────────────────────────────────


def test_sem_membership_nao_recebe(push_module, monkeypatch):
    """NO_WS tem apps='full' mas nenhuma membership ativa ⇒ fora."""
    _env(push_module, monkeypatch, [NO_WS])
    assert _select(push_module, **TABLET_RESERVA) == []
    assert _select(push_module, module='reservalab', min_level='full') == []


# 7. notify_settings preservados ─────────────────────────────────────────────


def test_mudo_global_excluido(push_module, monkeypatch):
    _env(push_module, monkeypatch, [MUTED, TEC_A])
    assert _select(push_module, **TABLET_RESERVA) == [TEC_A['id']]


def test_canal_push_desativado_por_app_excluido(push_module, monkeypatch):
    _env(push_module, monkeypatch, [CH_OFF, TEC_A])
    assert _select(push_module, **TABLET_RESERVA) == [TEC_A['id']]


# 8. Filtros operacionais preservados ────────────────────────────────────────


def test_filtro_user_id_preservado(push_module, monkeypatch):
    _env(push_module, monkeypatch, [TEC_A, MULTI])
    ids = _select(push_module, **TABLET_RESERVA, user_id=TEC_A['id'])
    assert ids == [TEC_A['id']]


def test_filtro_role_preservado(push_module, monkeypatch):
    _env(push_module, monkeypatch, [TEC_A, VIS_A])
    ids = _select(push_module, module='chamados', workspace_id=WS_A, min_level='full', role='viewer')
    assert ids == []  # VIS_A não tem Action do tier full do chamados


def test_filtro_role_ateia_no_que_tem_action(push_module, monkeypatch):
    _env(push_module, monkeypatch, [TEC_A, TEC_B])
    ids = _select(push_module, **TABLET_RESERVA, role='technician')
    assert ids == [TEC_A['id']]


# 9. Brancos mortos de `role='admin'` removidos ──────────────────────────────


def test_role_admin_legado_sem_privilegio(push_module, monkeypatch):
    """role='admin' legado no payload NÃO concede mais nada: sem Action, sem envio."""
    _env(push_module, monkeypatch, [LEGACY_ADMIN])
    assert _select(push_module, **CHAMADOS_FULL) == []


def test_modulo_auth_so_super_admin(push_module, monkeypatch):
    """auth não tem Actions cadastradas ⇒ fail-closed: só super admin recebe."""
    _env(push_module, monkeypatch, [SUPER, LEGACY_ADMIN, TEC_A])
    assert _select(push_module, module='auth') == [SUPER['id']]


# 10. Payload da inscrição permanece compatível (módulo None = sem filtro) ───


def test_sem_modulo_retorna_todos_sem_filtro(push_module, monkeypatch):
    """Cron paths sem módulo (ex.: tablets/cleanup, assinantes) seguem ilesos."""
    _env(push_module, monkeypatch, [TEC_A, VIS_A, MUTED])
    out = push_module._target_subs()
    assert sorted(s['user']['id'] for s in out) == sorted([TEC_A['id'], VIS_A['id'], MUTED['id']])
    # forma do payload preservada (o consumer de push_send não muda)
    for s in out:
        assert set(('key', 'endpoint', 'keys')) <= set(s)
        assert 'user' in s


# Regressão do incidente 22P02 continua valendo no targeting RBAC2 ────────────


def test_ids_invalidos_filtrados_no_batch_rbac(push_module, monkeypatch, caplog):
    """user-1/user-2 não entram na query; o resto da seleção sobrevive."""
    bad1 = dict(TEC_A)
    bad1['id'] = 'user-1'
    bad1['key'] = 'k-user-1'
    bad2 = dict(VIS_A)
    bad2['id'] = 'user-2'
    bad2['key'] = 'k-user-2'
    fake_db = _env(push_module, monkeypatch, [TEC_A, bad1, bad2])
    with caplog.at_level('WARNING', logger='reservalab_push_rbac2'):
        ids = _select(push_module, **TABLET_RESERVA)
    assert ids == [TEC_A['id']]
    mem_urls = [u for u in fake_db.urls if 'profile_id=in.' in u]
    assert all('user-1' not in u and 'user-2' not in u for u in mem_urls)