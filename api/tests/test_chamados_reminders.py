"""Testes de lembretes de chamados não assumidos.

Cobre:
  - Chamado sem responsável recebe lembrete após intervalo.
  - Respeita intervalo de 2 minutos entre lembretes.
  - Interrompe quando assumido/resolvido/fechado/indeferido.
  - Isolamento por workspace.
  - Respeita RBAC2 e preferências de push (reaproveita _target_subs).
  - Controle de concorrência (sem duplicidade).
  - Execução atrasada não gera envio acumulado.
  - Reabertura inicia novo ciclo.
"""
import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / 'app.py'

WS_A = '25257d4b-9ec9-4119-be5b-88901ce7d94c'
WS_B = '5ee618dd-8f8d-44c5-b0c3-bbf6f0fa8cdf'


def _tid(n):
    return f'{n:08x}-0000-4000-8000-{n:012x}'


@pytest.fixture(scope='session')
def api_module():
    spec = importlib.util.spec_from_file_location('chamados_reminders_api', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['chamados_reminders_api'] = mod
    spec.loader.exec_module(mod)
    return mod


class _Resp:
    def __init__(self, ok, payload=None, status_code=200):
        self.ok = ok
        self._payload = payload or {}
        self.status_code = status_code
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload


class FakeRedis:
    """Mini fake do upstash_redis.Redis com suporte a setnx/get/setex/delete/expire."""

    def __init__(self):
        self.store = {}
        self.ttls = {}

    def get(self, key):
        return self.store.get(key)

    def setnx(self, key, value):
        if key in self.store:
            return 0
        self.store[key] = value
        return 1

    def expire(self, key, ttl):
        self.ttls[key] = ttl
        return 1

    def setex(self, key, ttl, value):
        self.store[key] = value
        self.ttls[key] = ttl
        return 1

    def delete(self, key):
        self.store.pop(key, None)
        self.ttls.pop(key, None)
        return 1


class FakeSupabase:
    """Fake do PostgREST para chamados_tickets."""

    def __init__(self, tickets=None):
        self.tickets = list(tickets or [])
        self.calls = []
        self.patches = []

    def get(self, url, **kwargs):
        self.calls.append(('GET', url, kwargs.get('headers')))
        if '/rest/v1/chamados_tickets' in url and 'id=eq.' not in url:
            # Listagem de chamados (usa na verificação de lembretes)
            rows = []
            for t in self.tickets:
                if t.get('status') == 'aberto' and str(t.get('assignedToUserId') or '') == '':
                    rows.append(t)
            return _Resp(True, rows)
        if '/rest/v1/chamados_tickets' in url and 'id=eq.' in url:
            # Busca individual por id
            tid = url.split('id=eq.')[1].split('&')[0]
            for t in self.tickets:
                if str(t.get('id')) == tid:
                    return _Resp(True, [t])
            return _Resp(True, [])
        return _Resp(True, [])

    def patch(self, url, **kwargs):
        self.calls.append(('PATCH', url, kwargs.get('headers'), kwargs.get('json')))
        self.patches.append((url, kwargs.get('json')))
        # Simula UPDATE atômico: só afeta se assignedToUserId está vazio
        tid = url.split('id=eq.')[1].split('&')[0]
        for i, t in enumerate(self.tickets):
            if str(t.get('id')) == tid:
                current_assigned = str(t.get('assignedToUserId') or '').strip()
                guard = 'or=(assignedToUserId.is.null,assignedToUserId.eq.)' in url
                if guard and current_assigned != '':
                    return _Resp(False, [], status_code=502)
                t.update(kwargs.get('json', {}))
                return _Resp(True, [t])
        return _Resp(False, [], status_code=502)


def _env(api_module, monkeypatch, tickets=None, supabase_url='https://test.supabase.co',
         service_key='test-service-key'):
    fake_db = FakeSupabase(tickets)
    fake_redis = FakeRedis()
    monkeypatch.setattr(api_module, 'redis', fake_redis)
    monkeypatch.setattr(api_module, '_SUPABASE_URL', supabase_url)
    monkeypatch.setattr(api_module, '_SUPABASE_SERVICE_KEY', service_key)
    monkeypatch.setattr(api_module, 'requests', fake_db)
    return fake_db, fake_redis


def _make_ticket(tid, ws=WS_A, number=1, status='aberto', assigned_to_user_id='',
                 created_at=None):
    if created_at is None:
        created_at = datetime.now(timezone.utc).isoformat()
    return {
        'id': tid,
        'workspace_id': ws,
        'ticketNumber': number,
        'roomName': 'Sala 101',
        'problemCategory': 'Internet',
        'status': status,
        'assignedToUserId': assigned_to_user_id,
        'createdAt': created_at,
        'updatedAt': created_at,
    }


# ── Testes ───────────────────────────────────────────────────────────────────


def test_chamado_sem_responsavel_recebe_lembrete(api_module, monkeypatch):
    """Chamado aberto sem assignedToUserId gera lembrete no primeiro ciclo."""
    ticket = _make_ticket(_tid(1), ws=WS_A, number=10)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Mock _target_subs para retornar um subscriber
    sub = {'key': 'k1', 'endpoint': 'https://push.example/1', 'user': {'id': 'u1'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['checked'] == 1
    assert result['sent'] == 1
    assert len(sent) == 1
    # Estado gravado no Redis
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1
    assert state['workspace_id'] == WS_A


def test_respeita_intervalo_de_dois_minutos(api_module, monkeypatch):
    """Segundo lembrete só é enviado após 2 minutos do primeiro."""
    ticket = _make_ticket(_tid(2), ws=WS_A, number=11)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k2', 'endpoint': 'https://push.example/2', 'user': {'id': 'u2'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Primeiro ciclo: envia
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1
    assert len(sent) == 1

    # Segundo ciclo imediato: NÃO envia (intervalo não chegou)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1  # não acumulou

    # Avança o tempo simulando 2 minutos depois (edita o estado no Redis)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Terceiro ciclo: envia novamente
    r3 = api_module._check_and_send_reminders()
    assert r3['sent'] == 1
    assert len(sent) == 2


def test_chamado_assumido_interrompe_lembretes(api_module, monkeypatch):
    """Chamado com assignedToUserId preenchido não gera lembrete."""
    ticket = _make_ticket(_tid(3), ws=WS_A, number=12, assigned_to_user_id='tec-1')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['checked'] == 0
    assert result['sent'] == 0
    assert len(sent) == 0


def test_chamado_resolvido_interrompe_lembretes(api_module, monkeypatch):
    """Chamado resolvido não gera lembrete."""
    ticket = _make_ticket(_tid(4), ws=WS_A, number=13, status='resolvido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_fechado_interrompe_lembretes(api_module, monkeypatch):
    """Chamado fechado não gera lembrete."""
    ticket = _make_ticket(_tid(5), ws=WS_A, number=14, status='fechado')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_indeferido_interrompe_lembretes(api_module, monkeypatch):
    """Chamado indeferido não gera lembrete."""
    ticket = _make_ticket(_tid(6), ws=WS_A, number=15, status='indeferido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_workspace_diferente_nao_recebe_lembrete_inedevido(api_module, monkeypatch):
    """Lembrete só é enviado para técnicos do workspace do chamado."""
    ticket_a = _make_ticket(_tid(7), ws=WS_A, number=16)
    ticket_b = _make_ticket(_tid(8), ws=WS_B, number=17)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket_a, ticket_b])

    calls = []
    def fake_target_subs(module=None, workspace_id=None, user_id=None, role=None, min_level=None):
        calls.append((module, workspace_id, min_level))
        if workspace_id == WS_A:
            return [{'key': 'kA', 'endpoint': 'https://push.example/A', 'user': {'id': 'uA'}}]
        return []

    monkeypatch.setattr(api_module, '_target_subs', fake_target_subs)
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 1
    # O lembrete só foi enviado para o workspace do chamado A (1 envio).
    # O workspace B foi consultado mas retornou vazio (não há destinatários),
    # portanto não recebeu lembrete indevido.
    ws_consulted = {c[1] for c in calls}
    assert WS_A in ws_consulted
    assert WS_B in ws_consulted  # consultado, mas sem destinatários


def test_rbac2_respeitado(api_module, monkeypatch):
    """_target_subs com min_level='full' é usado (RBAC2 fail-closed)."""
    ticket = _make_ticket(_tid(9), ws=WS_A, number=18)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    captured = {}
    def fake_target_subs(module=None, workspace_id=None, user_id=None, role=None, min_level=None):
        captured['module'] = module
        captured['workspace_id'] = workspace_id
        captured['min_level'] = min_level
        return [{'key': 'k9', 'endpoint': 'https://push.example/9', 'user': {'id': 'u9'}}]

    monkeypatch.setattr(api_module, '_target_subs', fake_target_subs)
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    api_module._check_and_send_reminders()

    assert captured['module'] == 'chamados'
    assert captured['workspace_id'] == WS_A
    assert captured['min_level'] == 'full'


def test_preferencia_push_desativada_eh_respeitada(api_module, monkeypatch):
    """Usuário com push desativado não recebe (via _target_subs notify_settings)."""
    ticket = _make_ticket(_tid(10), ws=WS_A, number=19)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # _target_subs retorna vazio se o usuário tem apps.chamados.push = false
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert len(sent) == 0


def test_duas_execucoes_nao_duplicam_envio(api_module, monkeypatch):
    """Lock atômico impede que duas execuções simultâneas enviem para o mesmo chamado."""
    ticket = _make_ticket(_tid(11), ws=WS_A, number=20)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k11', 'endpoint': 'https://push.example/11', 'user': {'id': 'u11'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Primeira execução adquire o lock e envia
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Segunda execução imediata: lock ainda está ativo (TTL 30s), não envia
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1


def test_execucao_atrasada_nao_gera_acumulado(api_module, monkeypatch):
    """Execução após intervalo longo envia apenas 1 lembrete (não compensa ciclos perdidos)."""
    ticket = _make_ticket(_tid(12), ws=WS_A, number=21)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k12', 'endpoint': 'https://push.example/12', 'user': {'id': 'u12'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Primeiro ciclo
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Simula execução atrasada em 1 hora (edita last_reminder_at para 1 hora atrás)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Execução atrasada: envia apenas 1, não 30 (para compensar 1 hora de intervalos perdidos)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    assert len(sent) == 2


def test_falha_no_envio_nao_corrompe_proximo_ciclo(api_module, monkeypatch):
    """Se push_notify falhar, o estado não é gravado e o próximo ciclo tenta novamente."""
    ticket = _make_ticket(_tid(13), ws=WS_A, number=22)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k13', 'endpoint': 'https://push.example/13', 'user': {'id': 'u13'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])

    call_count = {'n': 0}
    def flaky_push_notify(s, t, b, url=None):
        call_count['n'] += 1
        if call_count['n'] == 1:
            return False  # falha na primeira
        return True  # sucesso na segunda

    monkeypatch.setattr(api_module, 'push_notify', flaky_push_notify)

    # Primeiro ciclo: falha, não grava estado
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None

    # Segundo ciclo: tenta novamente e grava
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_reabertura_inicia_novo_ciclo(api_module, monkeypatch):
    """Chamado reaberto (status='aberto', assignedToUserId='') após ter sido fechado gera lembrete."""
    ticket = _make_ticket(_tid(14), ws=WS_A, number=23, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k14', 'endpoint': 'https://push.example/14', 'user': {'id': 'u14'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Já teve lembretes anteriores (estado no Redis com count > 0)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    prior_state = {
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_reminder_at': (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
        'reminder_count': 3,
    }
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(prior_state))

    # O chamado está aberto sem responsável → deve gerar novo lembrete (intervalo já passou)
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1
    state = json.loads(fake_redis.get(state_key))
    assert state['reminder_count'] == 4


def test_sem_destinatarios_nao_conta_como_lembrete(api_module, monkeypatch):
    """Se não há técnicos elegíveis no workspace, não grava estado de lembrete."""
    ticket = _make_ticket(_tid(15), ws=WS_A, number=24)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None
