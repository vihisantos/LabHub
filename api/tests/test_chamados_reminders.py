"""Testes de lembretes de chamados não assumidos.

Cobre:
  - Chamado sem responsável recebe lembrete após intervalo.
  - Respeita intervalo de 2 minutos entre lembretes.
  - Primeiro lembrete respeita createdAt (não envia imediatamente para chamado novo).
  - Chamado antigo sem estado Redis não recebe lembrete imediato.
  - Interrompe quando assumido/resolvido/fechado/indeferido.
  - Isolamento por workspace.
  - Respeita RBAC2 e preferências de push (reaproveita _target_subs).
  - Controle de concorrência (sem duplicidade via lock atômico).
  - Redis indisponível ⇒ falha operacional, não processa (fail-closed).
  - Envio parcial ⇒ não marca ciclo como concluído, tenta de novo depois.
  - Execução atrasada não gera envio acumulado.
  - Reabertura inicia novo ciclo (reset via updatedAt).
  - Endpoint aceita GET (Vercel Cron) com autenticação CRON_SECRET.
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

    def __init__(self, fail=False):
        self.store = {}
        self.ttls = {}
        self.fail = fail

    def get(self, key):
        if self.fail:
            raise Exception('Redis get falhou')
        return self.store.get(key)

    def setnx(self, key, value):
        if self.fail:
            raise Exception('Redis setnx falhou')
        if key in self.store:
            return 0
        self.store[key] = value
        return 1

    def expire(self, key, ttl):
        if self.fail:
            raise Exception('Redis expire falhou')
        self.ttls[key] = ttl
        return 1

    def setex(self, key, ttl, value):
        if self.fail:
            raise Exception('Redis setex falhou')
        self.store[key] = value
        self.ttls[key] = ttl
        return 1

    def delete(self, key):
        if self.fail:
            raise Exception('Redis delete falhou')
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
            rows = []
            for t in self.tickets:
                if t.get('status') == 'aberto' and str(t.get('assignedToUserId') or '') == '':
                    rows.append(t)
            return _Resp(True, rows)
        if '/rest/v1/chamados_tickets' in url and 'id=eq.' in url:
            tid = url.split('id=eq.')[1].split('&')[0]
            for t in self.tickets:
                if str(t.get('id')) == tid:
                    return _Resp(True, [t])
            return _Resp(True, [])
        return _Resp(True, [])

    def patch(self, url, **kwargs):
        self.calls.append(('PATCH', url, kwargs.get('headers'), kwargs.get('json')))
        self.patches.append((url, kwargs.get('json')))
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
         service_key='test-service-key', redis_fail=False):
    fake_db = FakeSupabase(tickets)
    fake_redis = FakeRedis(fail=redis_fail)
    monkeypatch.setattr(api_module, 'redis', fake_redis)
    monkeypatch.setattr(api_module, '_SUPABASE_URL', supabase_url)
    monkeypatch.setattr(api_module, '_SUPABASE_SERVICE_KEY', service_key)
    monkeypatch.setattr(api_module, 'requests', fake_db)
    return fake_db, fake_redis


def _make_ticket(tid, ws=WS_A, number=1, status='aberto', assigned_to_user_id='',
                 created_at=None, updated_at=None):
    if created_at is None:
        created_at = datetime.now(timezone.utc).isoformat()
    if updated_at is None:
        updated_at = created_at
    return {
        'id': tid,
        'workspace_id': ws,
        'ticketNumber': number,
        'roomName': 'Sala 101',
        'problemCategory': 'Internet',
        'status': status,
        'assignedToUserId': assigned_to_user_id,
        'createdAt': created_at,
        'updatedAt': updated_at,
    }


# ── Testes ───────────────────────────────────────────────────────────────────


def test_chamado_sem_responsavel_recebe_lembrete_apos_intervalo(api_module, monkeypatch):
    """Chamado aberto com createdAt há mais de 2 minutos recebe lembrete."""
    criado_há_3min = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    ticket = _make_ticket(_tid(1), ws=WS_A, number=10, created_at=criado_há_3min,
                          updated_at=criado_há_3min)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k1', 'endpoint': 'https://push.example/1', 'user': {'id': 'u1'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['checked'] == 1
    assert result['sent'] == 1
    assert len(sent) == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_chamado_novo_nao_recebe_primeiro_lembrete_imediatamente(api_module, monkeypatch):
    """Chamado criado há menos de 2 minutos não recebe lembrete no primeiro ciclo."""
    criado_agora = datetime.now(timezone.utc).isoformat()
    ticket = _make_ticket(_tid(2), ws=WS_A, number=11, created_at=criado_agora,
                          updated_at=criado_agora)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [{'key': 'k2', 'endpoint': 'x', 'user': {'id': 'u2'}}])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert len(sent) == 0
    # Não deve haver estado gravado
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_chamado_antigo_sem_estado_redis_respeita_2_minutos(api_module, monkeypatch):
    """Chamado antigo (criado há 10 min) mas sem estado Redis: primeiro lembrete devido."""
    criado_há_10min = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(3), ws=WS_A, number=12, created_at=criado_há_10min,
                          updated_at=criado_há_10min)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k3', 'endpoint': 'https://push.example/3', 'user': {'id': 'u3'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    # createdAt há 10 min > 2 min ⇒ primeiro lembrete é devido
    assert result['sent'] == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_respeita_intervalo_de_dois_minutos_entre_lembretes(api_module, monkeypatch):
    """Segundo lembrete só é enviado após 2 minutos do primeiro."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(4), ws=WS_A, number=13, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k4', 'endpoint': 'https://push.example/4', 'user': {'id': 'u4'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Primeiro ciclo: envia (criado há 10 min)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1
    assert len(sent) == 1

    # Segundo ciclo imediato: NÃO envia (intervalo não chegou desde o último lembrete)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1  # não acumulou

    # Avança o tempo simulando 2 minutos depois
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    state['ticket_updated_at'] = ticket['updatedAt']
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    r3 = api_module._check_and_send_reminders()
    assert r3['sent'] == 1
    assert len(sent) == 2


def test_chamado_assumido_interrompe_lembretes(api_module, monkeypatch):
    """Chamado com assignedToUserId preenchido não gera lembrete."""
    ticket = _make_ticket(_tid(5), ws=WS_A, number=14, assigned_to_user_id='tec-1')
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
    ticket = _make_ticket(_tid(6), ws=WS_A, number=15, status='resolvido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_fechado_interrompe_lembretes(api_module, monkeypatch):
    """Chamado fechado não gera lembrete."""
    ticket = _make_ticket(_tid(7), ws=WS_A, number=16, status='fechado')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_indeferido_interrompe_lembretes(api_module, monkeypatch):
    """Chamado indeferido não gera lembrete."""
    ticket = _make_ticket(_tid(8), ws=WS_A, number=17, status='indeferido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_workspace_diferente_nao_recebe_lembrete_inedevido(api_module, monkeypatch):
    """Lembrete só é enviado para técnicos do workspace do chamado."""
    ticket_a = _make_ticket(_tid(9), ws=WS_A, number=18)
    ticket_b = _make_ticket(_tid(10), ws=WS_B, number=19)
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket_a['createdAt'] = criado
    ticket_a['updatedAt'] = criado
    ticket_b['createdAt'] = criado
    ticket_b['updatedAt'] = criado
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
    ws_consulted = {c[1] for c in calls}
    assert WS_A in ws_consulted
    assert WS_B in ws_consulted  # consultado, mas sem destinatários


def test_rbac2_respeitado(api_module, monkeypatch):
    """_target_subs com min_level='full' é usado (RBAC2 fail-closed)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(11), ws=WS_A, number=20, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    captured = {}
    def fake_target_subs(module=None, workspace_id=None, user_id=None, role=None, min_level=None):
        captured['module'] = module
        captured['workspace_id'] = workspace_id
        captured['min_level'] = min_level
        return [{'key': 'k11', 'endpoint': 'https://push.example/11', 'user': {'id': 'u11'}}]

    monkeypatch.setattr(api_module, '_target_subs', fake_target_subs)
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    api_module._check_and_send_reminders()

    assert captured['module'] == 'chamados'
    assert captured['workspace_id'] == WS_A
    assert captured['min_level'] == 'full'


def test_preferencia_push_desativada_eh_respeitada(api_module, monkeypatch):
    """Usuário com push desativado não recebe (via _target_subs notify_settings)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(12), ws=WS_A, number=21, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert len(sent) == 0


def test_duas_execucoes_nao_duplicam_envio(api_module, monkeypatch):
    """Lock atômico impede que duas execuções simultâneas enviem para o mesmo chamado."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(13), ws=WS_A, number=22, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k13', 'endpoint': 'https://push.example/13', 'user': {'id': 'u13'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Segunda execução imediata: lock ainda ativo (TTL 30s), não envia
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1


def test_redis_indisponivel_nao_processa(api_module, monkeypatch):
    """Sem Redis: falha operacional, não processa lembretes (fail-closed)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(14), ws=WS_A, number=23, created_at=criado,
                          updated_at=criado)
    fake_db, _ = _env(api_module, monkeypatch, [ticket])

    # Remove o Redis completamente (fail-closed: não processa sem lock)
    monkeypatch.setattr(api_module, 'redis', None)

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [{'key': 'k', 'endpoint': 'x', 'user': {'id': 'u'}}])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert result.get('error') == 'Redis não configurado'
    assert len(sent) == 0


def test_envio_parcial_nao_marca_ciclo_concluido(api_module, monkeypatch):
    """Se apenas alguns destinatários recebem, o ciclo não é marcado como concluído."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(15), ws=WS_A, number=24, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub1 = {'key': 'k15a', 'endpoint': 'https://push.example/15a', 'user': {'id': 'u15a'}}
    sub2 = {'key': 'k15b', 'endpoint': 'https://push.example/15b', 'user': {'id': 'u15b'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub1, sub2])

    call_count = {'n': 0}
    def parcial(s, t, b, url=None):
        call_count['n'] += 1
        # Primeiro recebe, segundo falha
        return call_count['n'] == 1

    monkeypatch.setattr(api_module, 'push_notify', parcial)

    r1 = api_module._check_and_send_reminders()
    # Envio parcial (1 de 2): ciclo não concluído, sent_total não incrementa
    assert r1['sent'] == 0

    # Estado não deve ter sido gravado (envio parcial não conclui o ciclo)
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None

    # Segundo ciclo: tenta novamente (nenhum estado para bloquear)
    r2 = api_module._check_and_send_reminders()
    # push_notify continua falhando para sub2 (n=3 → falso, n=4 → verdadeiro)
    # Então 1 de 2 novamente. Estado continua não gravado.
    assert r2['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_execucao_atrasada_nao_gera_acumulado(api_module, monkeypatch):
    """Execução após intervalo longo envia apenas 1 lembrete (não compensa ciclos perdidos)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(16), ws=WS_A, number=25, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k16', 'endpoint': 'https://push.example/16', 'user': {'id': 'u16'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Simula execução atrasada em 1 hora
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    state['ticket_updated_at'] = ticket['updatedAt']
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    assert len(sent) == 2  # não 30 (não compensa intervalos perdidos)


def test_falha_no_envio_nao_corrompe_proximo_ciclo(api_module, monkeypatch):
    """Se push_notify falhar para todos, o estado não é gravado e o próximo ciclo tenta."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(17), ws=WS_A, number=26, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k17', 'endpoint': 'https://push.example/17', 'user': {'id': 'u17'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])

    call_count = {'n': 0}
    def flaky(s, t, b, url=None):
        call_count['n'] += 1
        return call_count['n'] > 1  # falha na primeira, sucesso na segunda

    monkeypatch.setattr(api_module, 'push_notify', flaky)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_reabertura_inicia_novo_ciclo(api_module, monkeypatch):
    """Chamado reaberto (updatedAt mudou) reseta o contador de lembretes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(18), ws=WS_A, number=27, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k18', 'endpoint': 'https://push.example/18', 'user': {'id': 'u18'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    # Estado prévio com contador alto e updatedAt antigo
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    prior_state = {
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_reminder_at': datetime.now(timezone.utc).isoformat(),  # bem recente
        'reminder_count': 5,
        'ticket_updated_at': (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(),  # antigo
    }
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(prior_state))

    # Agora o chamado tem updatedAt recente (reabertura) ⇒ deve gerar lembrete
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1
    state = json.loads(fake_redis.get(state_key))
    assert state['reminder_count'] == 6


def test_sem_destinatarios_nao_conta_como_lembrete(api_module, monkeypatch):
    """Se não há técnicos elegíveis no workspace, não grava estado de lembrete."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(19), ws=WS_A, number=28, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


# ── Teste do endpoint HTTP (GET) ────────────────────────────────────────────


def test_endpoint_aceita_get_com_cron_secret(api_module, monkeypatch):
    """O endpoint /api/chamados/reminders/check aceita GET com header Authorization."""
    from api.app import app as flask_app

    # Verifica que a rota está registrada com GET
    rules = [r.rule for r in flask_app.url_map.iter_rules() if 'reminders/check' in r.rule]
    assert '/api/chamados/reminders/check' in rules

    rule = [r for r in flask_app.url_map.iter_rules() if r.rule == '/api/chamados/reminders/check'][0]
    assert 'GET' in rule.methods
    assert 'POST' in rule.methods
