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

CHECK_ENDPOINTS = ['/api/push/check', '/api/push/check-overdue', '/api/push/check-pcare', '/api/push/tablets/cleanup']


# ── Cleanup de reservas de tablets canceladas (retention 1 mês) ───────────


def test_tablets_cleanup_sem_supabase_skips(push_module, monkeypatch):
    """Sem SUPABASE_URL/KEY configurados, o cleanup não falha — retorna skipped."""
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_SERVICE_KEY', raising=False)
    result = push_module._internal_tablets_cleanup()
    assert result.get('checked') is False
    assert 'skipped' in result


def test_tablets_cleanup_retention_default_30_dias(push_module, monkeypatch):
    """Default de retenção é 30 dias (1 mês); env invalido cai no default."""
    monkeypatch.delenv('PUSH_TABLET_RETENTION_DAYS', raising=False)
    assert push_module._tablet_retention_days() == 30
    monkeypatch.setenv('PUSH_TABLET_RETENTION_DAYS', 'abc')
    assert push_module._tablet_retention_days() == 30
    monkeypatch.setenv('PUSH_TABLET_RETENTION_DAYS', '7')
    assert push_module._tablet_retention_days() == 7


def test_tablets_cleanup_deleta_so_canceladas_antigas(push_module, monkeypatch):
    """DELETE usa status=cancelada e cancelled_at < cutoff (soft-deletes antigos)."""
    calls = {}

    class FakeResp:
        ok = True
        status_code = 200
        @staticmethod
        def json():
            return [{'id': 'r1'}, {'id': 'r2'}]

    def fake_delete(url, **kwargs):
        calls['url'] = url
        return FakeResp()

    def fake_patch(url, **kwargs):
        return FakeResp()

    monkeypatch.setattr(push_module.requests, 'delete', fake_delete)
    monkeypatch.setattr(push_module.requests, 'patch', fake_patch)
    monkeypatch.setenv('PUSH_TABLET_RETENTION_DAYS', '30')

    result = push_module._internal_tablets_cleanup()
    assert result == {'checked': True, 'removed': 2, 'stamped': 2, 'retention_days': 30}
    assert 'status=eq.cancelada' in calls['url']
    assert 'cancelled_at=lt.' in calls['url']


def test_tablets_cleanup_backfill_carimba_canceladas_sem_cancelled_at(push_module, monkeypatch):
    """Canceladas sem cancelled_at (pré-051/cliente sem carimbo) recebem now()
    antes do DELETE — a retenção passa a contar a partir da primeira varredura."""
    calls = {}

    class FakeResp:
        ok = True
        status_code = 200
        @staticmethod
        def json():
            return []

    def fake_delete(url, **kwargs):
        calls['deleted'] = True
        return FakeResp()

    def fake_patch(url, **kwargs):
        calls['patch_url'] = url
        calls['patch_body'] = kwargs.get('json')
        return FakeResp()

    monkeypatch.setattr(push_module.requests, 'delete', fake_delete)
    monkeypatch.setattr(push_module.requests, 'patch', fake_patch)

    result = push_module._internal_tablets_cleanup()
    assert result['checked'] is True
    assert result['stamped'] == 0
    assert result['removed'] == 0
    assert 'cancelled_at=is.null' in calls['patch_url']
    assert 'status=eq.cancelada' in calls['patch_url']
    assert 'cancelled_at' in calls['patch_body']
    assert calls['deleted'] is True  # DELETE roda depois do backfill


def test_tablets_cleanup_backfill_falha_nao_bloqueia_delete(push_module, monkeypatch):
    """Se o backfill falhar, o DELETE de retenção ainda executa."""
    calls = {}

    class FakeResp:
        ok = True
        status_code = 200
        @staticmethod
        def json():
            return []

    def fake_delete(url, **kwargs):
        calls['deleted'] = True
        return FakeResp()

    def fake_patch(url, **kwargs):
        class Err:
            ok = False
            status_code = 500
            @staticmethod
            def json():
                return {}
        return Err()

    monkeypatch.setattr(push_module.requests, 'delete', fake_delete)
    monkeypatch.setattr(push_module.requests, 'patch', fake_patch)

    result = push_module._internal_tablets_cleanup()
    assert result['checked'] is True
    assert result['stamped'] == 0
    assert calls['deleted'] is True


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


# ── Janela de antecedência (default 30 min, unificada lab+tablet) ──────────


def test_push_advance_minutes_default_30(push_module, monkeypatch):
    """Default da janela de aviso é 30 min; env inválida cai no default."""
    monkeypatch.delenv('PUSH_ADVANCE_MINUTES', raising=False)
    assert push_module._push_advance_minutes() == 30
    monkeypatch.setenv('PUSH_ADVANCE_MINUTES', 'abc')
    assert push_module._push_advance_minutes() == 30
    monkeypatch.setenv('PUSH_ADVANCE_MINUTES', '10')
    assert push_module._push_advance_minutes() == 10


def test_workspaces_with_spreadsheet_sem_supabase_retorna_vazio(push_module, monkeypatch):
    """Sem Supabase configurado, não há como escopar por campus → [] (fallback)."""
    monkeypatch.setattr(push_module, '_SUPABASE_URL', '')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', '')
    assert push_module._workspaces_with_spreadsheet() == []


def test_push_check_reserva_de_lab_mira_so_o_campus(push_module, monkeypatch):
    """Reserva de lab de um campus deve mirar apenas os assinantes daquele
    workspace — não vazar para campi vizinhos."""
    from datetime import date, datetime

    class CampusRedis(FakeRedis):
        def __init__(self):
            super().__init__({'x'})

    class Resp:
        ok = True

        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    def fake_get(url, **kwargs):
        if 'select=id,slug,spreadsheet_url' in url:
            return Resp([{'id': 'ws-a', 'slug': 'campus-a', 'spreadsheet_url': 'https://share.example/a.xlsx'}])
        if 'select=lab_count' in url:
            return Resp([{'lab_count': 2}])
        raise AssertionError(f'URL inesperada: {url}')

    class CampusRequests:
        @staticmethod
        def get(url, **kwargs):
            return fake_get(url, **kwargs)

    monkeypatch.setattr(push_module, 'redis', CampusRedis())
    monkeypatch.setattr(push_module, 'requests', CampusRequests())
    monkeypatch.setattr(push_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_SERVICE_KEY', raising=False)
    monkeypatch.setattr(push_module, 'get_today_sp', lambda: date(2026, 9, 11))
    monkeypatch.setattr(push_module, 'get_now_sp', lambda: datetime(2026, 9, 11, 7, 20))

    reserva = {
        'lab': 'LAB01', 'labs': ['LAB01'], 'horario': '07h30 às 09h20',
        'responsavel': 'Prof. A', 'observacao': 'Matemática', 'alunos': '30',
        'data': '11/09/2026',
    }
    monkeypatch.setattr(push_module, 'get_reservas', lambda *a, **k: ([dict(reserva)], []))

    campus_sub = {'key': 'k', 'endpoint': 'https://push.example/a', 'keys': {}, 'user': {'id': 'u-a'}}
    calls = []

    def fake_target_subs(**kw):
        calls.append(kw)
        return [campus_sub] if kw.get('workspace_id') == 'ws-a' else []

    monkeypatch.setattr(push_module, '_target_subs', fake_target_subs)
    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, title, body: sent.append((sub['user']['id'], title, body)))

    result = push_module._internal_push_check()

    assert result['sent'] == 1
    assert [s[0] for s in sent] == ['u-a']
    assert any(c.get('workspace_id') == 'ws-a' for c in calls)


def test_target_subs_filtra_por_workspace(push_module, monkeypatch):
    """Alerta de tablets de um campus só chega para quem tem acesso àquele workspace.

    RBAC2: destino = super admin (bypass) + membership ATIVA com Action do
    módulo resolvida NO workspace do campus (9.3-B). O payload da inscrição
    (apps/workspace_ids) nunca decide — o tech do campus B com `apps` True e
    membro de B não recebe o alerta de A.
    """
    admin = {'id': '11111111-1111-4111-8111-111111111111', 'role': 'adm', 'is_super_admin': True, 'workspace_ids': [], 'apps': {}, 'notify_settings': {}}
    tech_a = {'id': '22222222-2222-4222-8222-222222222222', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': [], 'apps': {'reservalab': False}, 'notify_settings': {}}
    tech_b = {'id': '33333333-3333-4333-8333-333333333333', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': [], 'apps': {'reservalab': True}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(admin), ensure_ascii=False),
        json.dumps(_push_sub(tech_a), ensure_ascii=False),
        json.dumps(_push_sub(tech_b), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {
        '22222222-2222-4222-8222-222222222222': {'a': 'role-tec'},
        '33333333-3333-4333-8333-333333333333': {'b': 'role-tec'},
    }, {'role-tec': {'reservelab.tablet.reserve'}})

    out = push_module._target_subs(module='reservalab', workspace_id='a', min_level='full')
    ids = sorted(s['user']['id'] for s in out)

    # Admin absoluto vê todos; tech do campus B fica de fora (mesmo com apps True)
    assert ids == ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']


def test_target_subs_workspace_resolvido_por_memberships(push_module, monkeypatch):
    """O payload gravado é ignorado: manda quem tem membership ativa (9.3-B).

    O `workspace_ids` do snapshot aponta para 'stale'; a membership ativa
    resolve 'a' — e sem membership no workspace pedido, ninguém é selecionado.
    """
    tech = {'id': '22222222-2222-4222-8222-222222222222', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['stale'], 'apps': {'reservalab': True}, 'notify_settings': {}}

    fake = FakeRedis({json.dumps(_push_sub(tech), ensure_ascii=False)})
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {
        '22222222-2222-4222-8222-222222222222': {'a': 'role-tec'},
    }, {'role-tec': {'reservelab.tablet.reserve'}})

    out = push_module._target_subs(module='reservalab', workspace_id='a', min_level='full')
    assert [s['user']['id'] for s in out] == ['22222222-2222-4222-8222-222222222222']

    out = push_module._target_subs(module='reservalab', workspace_id='stale', min_level='full')
    assert out == []


def _mock_rbac(push_module, monkeypatch, memberships, role_actions, overrides=None):
    """Fake do PostgREST para o targeting RBAC2 do _target_subs.

    - memberships: {uid: {workspace_id: role_slug}} → memberships ativas com id
      e role_id próprios (ignoradas as colunas extras do SELECT);
    - role_actions: {role_slug: set(action)} → linhas de role_permissions
      (escopo 'workspace' — o fake devolve tudo, sem filtrar os in.(...));
    - overrides: {mem_id: {action: effect}} → membership_overrides.
    """

    class _Resp:
        ok = True

        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    def _handle(url):
        if '/rest/v1/memberships' in url:
            rows = []
            for uid, ws_map in (memberships or {}).items():
                for ws, role_slug in ws_map.items():
                    rows.append({
                        'profile_id': uid,
                        'workspace_id': ws,
                        'status': 'active',
                        'id': f'mem-{uid}-{ws}',
                        'role_id': role_slug,
                    })
            return _Resp(rows)
        if '/rest/v1/role_permissions' in url:
            rows = []
            for role_slug, actions in (role_actions or {}).items():
                for a in actions:
                    rows.append({'role_id': role_slug, 'action': a, 'scope': 'workspace'})
            return _Resp(rows)
        if '/rest/v1/membership_overrides' in url:
            rows = []
            for mem_id, effs in (overrides or {}).items():
                for a, eff in effs.items():
                    rows.append({'membership_id': mem_id, 'action': a, 'effect': eff})
            return _Resp(rows)
        raise AssertionError(f'URL inesperada: {url}')

    class _Requests:
        @staticmethod
        def get(url, **kwargs):
            return _handle(url)

    monkeypatch.setattr(push_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(push_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
    monkeypatch.setattr(push_module, 'requests', _Requests())


def test_target_subs_sem_workspace_atinge_todos(push_module, monkeypatch):
    """Push de tablets sem workspace_id mantém o comportamento legado: todos os
    assinantes ELEGÍVEIS do módulo (membership + Action resolvidas) recebem."""
    tech_a = {'id': '22222222-2222-4222-8222-222222222222', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': True}, 'notify_settings': {}}
    tech_b = {'id': '33333333-3333-4333-8333-333333333333', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['b'], 'apps': {'reservalab': False}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(tech_a), ensure_ascii=False),
        json.dumps(_push_sub(tech_b), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {
        '22222222-2222-4222-8222-222222222222': {'a': 'role-tec'},
        '33333333-3333-4333-8333-333333333333': {'b': 'role-tec'},
    }, {'role-tec': {'reservelab.tablet.reserve'}})

    out = push_module._target_subs(module='reservalab', min_level='full')
    ids = sorted(s['user']['id'] for s in out)

    # O `apps.reservalab: False` do tech_b NÃO exclui — quem decide é a Action
    assert ids == ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']


# ── Filtro por nível mínimo (full) no push de reservas ─────────────────────


def test_target_subs_requer_membership_e_action(push_module, monkeypatch):
    """Push de reserva só chega para quem tem membership ativa + Action do módulo.

    Usuário com membership mas SEM Action (ex.: role sem reservelab) ainda
    assina o push, mas não recebe o alerta deste app.
    """
    com_action = {'id': '44444444-4444-4444-8444-444444444444', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': 'full'}, 'notify_settings': {}}
    sem_action = {'id': '55555555-5555-4555-8555-555555555555', 'role': 'viewer', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': 'full'}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(com_action), ensure_ascii=False),
        json.dumps(_push_sub(sem_action), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {
        '44444444-4444-4444-8444-444444444444': {'a': 'role-tec'},
        '55555555-5555-4555-8555-555555555555': {'a': 'role-vis'},
    }, {'role-tec': {'reservelab.tablet.reserve'}, 'role-vis': {'ticket.view'}})

    out = push_module._target_subs(module='reservalab', min_level='full')
    ids = sorted(s['user']['id'] for s in out)

    # O `apps: {'reservalab': 'full'}` no payload NÃO basta: sem Action, fica fora
    assert ids == ['44444444-4444-4444-8444-444444444444']


def test_target_subs_super_admin_sempre_recebe(push_module, monkeypatch):
    """Super admin recebe o push de reservas mesmo sem membership/Action resolvida."""
    admin = {'id': 'u-admin', 'role': 'coordinator', 'is_super_admin': True, 'workspace_ids': [], 'apps': {}, 'notify_settings': {}}
    read = {'id': 'u-read', 'role': 'viewer', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'reservalab': 'read'}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(admin), ensure_ascii=False),
        json.dumps(_push_sub(read), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {}, {})

    out = push_module._target_subs(module='reservalab', min_level='full')
    ids = sorted(s['user']['id'] for s in out)

    assert ids == ['u-admin']


def test_target_subs_modulo_sem_criterio_somente_super_admin(push_module, monkeypatch):
    """Módulo sem Actions cadastradas (ex.: plataforma) ⇒ fail-closed: só super admin."""
    admin = {'id': 'u-admin', 'role': 'adm', 'is_super_admin': True, 'workspace_ids': [], 'apps': {}, 'notify_settings': {}}
    tech = {'id': 'u-tech', 'role': 'tech', 'is_super_admin': False, 'workspace_ids': ['a'], 'apps': {'auth': True}, 'notify_settings': {}}

    fake = FakeRedis({
        json.dumps(_push_sub(admin), ensure_ascii=False),
        json.dumps(_push_sub(tech), ensure_ascii=False),
    })
    monkeypatch.setattr(push_module, 'redis', fake)
    _mock_rbac(push_module, monkeypatch, {'u-tech': {'a': 'role-tec'}}, {'role-tec': {'ticket.edit'}})

    # Mesmo com `apps.auth: True` no payload, um não-super sem Action de 'auth'
    # (módulo não mapeado) não é destinatário — espelha o fim do role 'admin'.
    out = push_module._target_subs(module='auth')
    ids = sorted(s['user']['id'] for s in out)

    assert ids == ['u-admin']
