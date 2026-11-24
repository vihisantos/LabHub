import importlib.util
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_store_fakes import PgStoreFakeMixin

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

class FakeRedis(PgStoreFakeMixin):
    """Fake do store com dedup reserva/confirmação fenciada.

    Reproduz a semântica atômica de reserva/confirmação/liberação por token,
    agora exposta também via métodos do pg_store. Não substitui PostgreSQL real.
    """

    def __init__(self, members=None):
        self._members = members if members is not None else set()
        self.store = {}
        self.expires = {}
        self.now = 0

    def _purge(self, key):
        expires_at = self.expires.get(key)
        if expires_at is not None and self.now >= expires_at:
            self.store.pop(key, None)
            self.expires.pop(key, None)

    def smembers(self, key):
        return set(self._members)

    def get(self, key):
        self._purge(key)
        return self.store.get(key)

    def ttl(self, key):
        self._purge(key)
        if key not in self.store:
            return -2
        expires_at = self.expires.get(key)
        if expires_at is None:
            return -1
        return max(0, expires_at - self.now)

    def set(self, key, value, ex=None, nx=None, **kwargs):
        self._purge(key)
        if nx and key in self.store:
            return None
        self.store[key] = value
        if ex is not None:
            self.expires[key] = self.now + int(ex)
        else:
            self.expires.pop(key, None)
        return True

    def setex(self, key, ttl, value):
        self.store[key] = value
        self.expires[key] = self.now + int(ttl)

    def delete(self, key):
        self._members = set()
        existed = self.store.pop(key, None) is not None
        self.expires.pop(key, None)
        return existed

    def eval(self, script, keys=None, args=None):
        script = script or ''
        key = (keys or [None])[0]
        token = (args or [None])[0]
        self._purge(key)
        raw = self.store.get(key)
        if raw is None:
            return 0
        value = str(raw)
        if ':' not in value:
            return 0
        state, current = value.split(':', 1)
        if '-- push-dedup-confirm' in script:
            if state != 'reserved' or current != token:
                return 0
            remaining = self.ttl(key)
            if remaining <= 0:
                remaining = int((args or [None, 3600])[1])
            self.setex(key, remaining, 'accepted:' + token)
            return 1
        if '-- push-dedup-release' in script:
            if state != 'reserved' or current != token:
                return 0
            return 1 if self.delete(key) else 0
        return 0

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
            # Uma inscrição válida qualquer: basta sinalizar que há assinantes
            # para o core do cron seguir em frente com o direcionamento.
            super().__init__({json.dumps({'endpoint': 'https://push.example/x'})})

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
    monkeypatch.setattr(
        push_module, 'push_notify',
        lambda sub, title, body, **kwargs: (
            sent.append((sub['user']['id'], title, body)) or push_module.PUSH_ACCEPTED
        ),
    )

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


def test_periodic_reservations_require_campus_and_durable_queue(push_module, monkeypatch):
    from datetime import date, datetime
    from unittest.mock import Mock
    from zoneinfo import ZoneInfo

    monkeypatch.setattr(push_module, "_push_store_ready", lambda: True)
    monkeypatch.setattr(push_module, "_workspaces_with_spreadsheet", lambda: [
        {"id": "ws-a", "slug": "campus-a", "spreadsheet_url": "https://example.com/a.xlsx"},
    ])
    monkeypatch.setattr(push_module, "_get_workspace_lab_count", lambda _: 2)
    monkeypatch.setattr(push_module, "get_today_sp", lambda: date(2026, 11, 24))
    monkeypatch.setattr(push_module, "get_now_sp", lambda: datetime(2026, 11, 24, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo")))
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-only")
    monkeypatch.setattr(push_module, "_parse_spreadsheet", lambda *a, **k: ([{
        "reservation_id": "lab-reservation-a", "data": "24/11/2026", "lab": "LAB01", "horario": "10h30 às 12h00",
        "responsavel": "Professor", "observacao": "",
    }], []))
    response = Mock(ok=True)
    response.json.return_value = [
        {"id": "tablet-1", "workspace_id": "ws-a", "horario_inicio": "2026-11-24T13:30:00Z", "finalidade": ""},
        {"id": "tablet-unscoped", "workspace_id": None, "horario_inicio": "2026-11-24T13:30:00Z", "finalidade": ""},
    ]
    get = Mock(return_value=response)
    monkeypatch.setattr(push_module.requests, "get", get)
    queue = Mock(return_value="queued")
    monkeypatch.setattr(push_module, "_queue_push_event", queue)
    legacy = Mock(side_effect=AssertionError("periodic path cannot send legacy Push"))
    monkeypatch.setattr(push_module, "_push_notify_subs_dedup", legacy)

    result = push_module._internal_push_check(strict_scope=True)
    assert result["queued"] == 2
    assert result["failures"] == 1
    assert result["error"]
    for call in queue.call_args_list:
        assert call.kwargs["workspace_id"] == "ws-a"
        assert call.kwargs["min_level"] == "full"
        assert call.kwargs["expires_at"] == "2026-11-24T10:30:00-03:00"
        assert call.kwargs["persist_inapp"] is True
        assert call.kwargs["reservation_id"]
    ids = [call.args[0] for call in queue.call_args_list]
    assert "%2B" not in get.call_args.args[0]  # local timestamps have negative UTC offset

    queue.reset_mock()
    queue.return_value = "duplicate"
    assert push_module._internal_push_check(strict_scope=True)["queued"] == 0
    assert [call.args[0] for call in queue.call_args_list] == ids

    queue.reset_mock()
    queue.return_value = None
    result = push_module._internal_push_check(strict_scope=True)
    assert result["queued"] == 0
    assert result["failures"] == 3
    legacy.assert_not_called()


def test_periodic_never_uses_global_spreadsheet_fallback(push_module, monkeypatch):
    from unittest.mock import Mock
    monkeypatch.setattr(push_module, "_push_store_ready", lambda: True)
    monkeypatch.setattr(push_module, "_workspaces_with_spreadsheet", lambda: [])
    global_sheet = Mock(side_effect=AssertionError("unscoped fallback forbidden"))
    monkeypatch.setattr(push_module, "get_reservas", global_sheet)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    result = push_module._internal_push_check(strict_scope=True)
    assert result["error"]
    global_sheet.assert_not_called()


def test_periodic_approval_persists_bell_and_push_atomically(push_module, monkeypatch):
    from unittest.mock import Mock
    monkeypatch.setattr(push_module, "_push_store_ready", lambda: True)
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-only")
    monkeypatch.setattr(push_module.pg_store, "is_configured", lambda: True)
    response = Mock(ok=True)
    response.json.return_value = [{"id": "pending-a", "email": "qa@example.test", "name": "QA"}]
    monkeypatch.setattr(push_module.requests, "get", Mock(return_value=response))
    atomic = Mock(return_value=True)
    monkeypatch.setattr(push_module.pg_store.store, "notification_create_with_outbox", atomic)
    legacy = Mock(side_effect=AssertionError("periodic approval must use atomic persistence"))
    monkeypatch.setattr(push_module, "_queue_push_event", legacy)

    result = push_module._check_pending_users(require_outbox=True)
    assert result["queued"] == 1
    notification, payload = atomic.call_args.args
    assert notification["target_super_admin"] is True
    assert notification["audience"] == "role"
    assert notification["type"] == "approval"
    assert payload["context"] == "pending-user"
    assert payload["target_super_admin"] is True
    assert payload["action_url"] == notification["action_url"]

    atomic.return_value = False
    assert push_module._check_pending_users(require_outbox=True)["queued"] == 0
    assert atomic.call_args.args[0]["id"] == notification["id"]
    atomic.side_effect = RuntimeError("database unavailable")
    assert push_module._check_pending_users(require_outbox=True)["failures"] == 1
    legacy.assert_not_called()


def test_periodic_reservations_cross_midnight_without_scanning_full_tablet_day(push_module, monkeypatch):
    from datetime import date, datetime
    from unittest.mock import Mock
    from zoneinfo import ZoneInfo

    monkeypatch.setattr(push_module, "_push_store_ready", lambda: True)
    monkeypatch.setattr(push_module, "_workspaces_with_spreadsheet", lambda: [
        {"id": "ws-a", "slug": "campus-a", "spreadsheet_url": "https://example.test/a.xlsx"},
    ])
    monkeypatch.setattr(push_module, "_get_workspace_lab_count", lambda _: 2)
    monkeypatch.setattr(push_module, "_push_advance_minutes", lambda: 30)
    monkeypatch.setattr(push_module, "get_today_sp", lambda: date(2026, 11, 24))
    monkeypatch.setattr(push_module, "get_now_sp", lambda: datetime(2026, 11, 24, 23, 50, tzinfo=ZoneInfo("America/Sao_Paulo")))
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-only")
    monkeypatch.setattr(push_module, "_parse_spreadsheet", lambda *a, **k: ([], [
        {"reservation_id": "next-day", "data": date(2026, 11, 25), "lab": "LAB01",
         "horario": "00h10 às 01h00", "responsavel": "QA", "observacao": None},
        {"reservation_id": "too-late", "data": date(2026, 11, 25), "lab": "LAB02",
         "horario": "01h00 às 02h00", "responsavel": "QA"},
    ]))
    response = Mock(ok=True)
    response.json.return_value = [
        {"id": "tablet-next-day", "workspace_id": "ws-a", "horario_inicio": "2026-11-25T03:10:00Z"},
    ]
    get = Mock(return_value=response)
    monkeypatch.setattr(push_module.requests, "get", get)
    queue = Mock(return_value="queued")
    monkeypatch.setattr(push_module, "_queue_push_event", queue)
    result = push_module._internal_push_check(strict_scope=True)
    assert result == {"checked": True, "queued": 2, "sent": 0}
    assert {call.kwargs["reservation_id"] for call in queue.call_args_list} == {"next-day", "tablet-next-day"}
    assert all(call.kwargs["expires_at"] == "2026-11-25T00:10:00-03:00" for call in queue.call_args_list)
    assert "horario_inicio=gte.2026-11-24T23%3A50" in get.call_args.args[0]
    assert "horario_inicio=lte.2026-11-25T00%3A20" in get.call_args.args[0]


def test_strict_spreadsheet_distinguishes_fetch_failure_from_empty(push_module, monkeypatch):
    monkeypatch.setattr(push_module, "_ext_validate_source_url", lambda *_: True)
    monkeypatch.setattr(push_module, "_ext_fetch_source_bytes", lambda *a, **k: (None, "timeout"))
    with pytest.raises(RuntimeError, match="spreadsheet unavailable"):
        push_module._parse_spreadsheet("https://example.test/a.xlsx", strict=True)
    assert push_module._parse_spreadsheet("https://example.test/a.xlsx") == ([], [])


def test_push_override_failure_never_falls_back_to_role(push_module, monkeypatch):
    from unittest.mock import Mock
    user = {"id": "22222222-2222-4222-8222-222222222222", "is_super_admin": False}
    monkeypatch.setattr(push_module, "_get_subs", lambda: [{"user": user}])
    monkeypatch.setattr(push_module, "_resolve_batch_rbac", lambda _: {user["id"]: {
        "ws-a": {"membership_id": "m1", "role_id": "r1"}}})
    monkeypatch.setattr(push_module, "_resolve_batch_role_permissions", lambda _: {"r1": {"stock.item.edit"}})
    monkeypatch.setattr(push_module, "_resolve_batch_overrides", lambda _: None)
    with pytest.raises(RuntimeError, match="overrides unavailable"):
        push_module._target_subs(module="stock", workspace_id="ws-a")


def test_strict_push_revalidates_demoted_and_inactive_profiles(push_module, monkeypatch):
    from unittest.mock import Mock
    demoted = "22222222-2222-4222-8222-222222222222"
    inactive = "33333333-3333-4333-8333-333333333333"
    active_admin = "44444444-4444-4444-8444-444444444444"
    subs = [{"user": {"id": uid, "is_super_admin": True}} for uid in (demoted, inactive, active_admin)]
    monkeypatch.setattr(push_module, "_get_subs", lambda **_: subs)
    response = Mock(ok=True)
    response.json.return_value = [
        {"id": demoted, "status": "active", "is_super_admin": False, "notify_settings": {}},
        {"id": active_admin, "status": "active", "is_super_admin": True, "notify_settings": {}},
    ]
    monkeypatch.setattr(push_module.requests, "get", Mock(return_value=response))
    monkeypatch.setattr(push_module, "_resolve_batch_rbac", lambda *a, **k: {})
    monkeypatch.setattr(push_module, "_resolve_batch_role_permissions", lambda *a, **k: {})
    monkeypatch.setattr(push_module, "_resolve_batch_overrides", lambda *a, **k: {})
    selected = push_module._target_subs(module="stock", workspace_id="ws-a", strict=True)
    assert [sub["user"]["id"] for sub in selected] == [active_admin]


def test_stock_notification_derives_content_and_scope_from_committed_movement(push_module, monkeypatch):
    from flask import g
    from unittest.mock import Mock
    ws = "22222222-2222-4222-8222-222222222222"
    movement = "33333333-3333-4333-8333-333333333333"
    response = Mock(ok=True)
    response.json.return_value = [{"id": movement, "workspace_id": ws, "type": "emprestimo",
                                   "itemName": "Real", "borrowedBy": "QA"}]
    get = Mock(return_value=response)
    enqueue = Mock(return_value="queued")
    monkeypatch.setattr(push_module.requests, "get", get)
    monkeypatch.setattr(push_module, "_queue_push_event", enqueue)
    with push_module.app.test_request_context(json={"movement_id": movement, "itemName": "Fake"}):
        g.workspace_id = ws
        result, code = push_module._enqueue_stock_movement_notice("emprestimo")
        assert code == 202
    assert get.call_args.kwargs["params"]["workspace_id"] == f"eq.{ws}"
    assert enqueue.call_args.args[1] == "Empréstimo: Real"
    assert enqueue.call_args.kwargs["workspace_id"] == ws
    assert enqueue.call_args.kwargs["module"] == "stock"

    response.json.return_value[0]["workspace_id"] = movement
    enqueue.reset_mock()
    with push_module.app.test_request_context(json={"movement_id": movement}):
        g.workspace_id = ws
        assert push_module._enqueue_stock_movement_notice("emprestimo")[1] == 404
    enqueue.assert_not_called()
    with push_module.app.test_request_context(json={"movement_id": movement, "module": "chamados"}):
        g.workspace_id = ws
        assert push_module._enqueue_stock_movement_notice("emprestimo")[1] == 400
    enqueue.assert_not_called()
