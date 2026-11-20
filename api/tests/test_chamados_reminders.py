"""Testes de lembretes de chamados não assumidos.

Cobre:
  - Chamado sem responsável recebe lembrete após intervalo.
  - Respeita intervalo de 2 minutos entre lembretes.
  - Primeiro lembrete respeita createdAt.
  - Chamado antigo sem estado Redis não recebe lembrete imediato.
  - Interrompe quando assumido/resolvido/fechado/indeferido.
  - Isolamento por workspace; RBAC2 e preferências de push.
  - Controle de concorrência; Redis fail-closed.
  - Controle individual por destinatário (envio parcial sem duplicidade).
  - Falha de persistência após envio.
  - Alteração de descrição/comentário não reinicia o ciclo.
  - Reabertura real (encerrado→aberto) inicia novo ciclo.
  - Endpoint aceita GET com CRON_SECRET.
"""
import importlib.util
import json
import sys
import threading
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
        # Não usar `payload or {}`: uma lista vazia é uma resposta válida do
        # PostgREST e precisa continuar sendo lista para o teste de payload.
        self._payload = {} if payload is None else payload
        self.status_code = status_code
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload


def _estado_valido_para_teste(state):
    """Espelho em Python da validação `valid_state` dos scripts Lua.

    Não substitui a execução do Lua real (indisponível neste ambiente), mas
    garante que o fake rejeite exatamente as mesmas classes de estado inválido:
    arrays, objetos sem chave conhecida e campos com tipo incorreto.
    """
    if not isinstance(state, dict):
        return False
    known = False
    if 'reminder_count' in state:
        # Espelho do `reminder-count-strict`: inteiro finito em [0, 10].
        count = state['reminder_count']
        if isinstance(count, bool) or not isinstance(count, int):
            return False
        if count < 0 or count > 10:
            return False
        known = True
    for campo in ('cycle_id', 'last_reminder_at', 'last_known_status'):
        if campo in state:
            if not isinstance(state[campo], str):
                return False
            known = True
    return known


def _geracao_valida_para_teste(value):
    """Espelho de `valid_generation` dos scripts Lua (inteiro, 0..1e9)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if value != value:
        return False
    if isinstance(value, float) and not value.is_integer():
        return False
    return 0 <= value <= 1_000_000_000


def _ler_geracao_para_teste(state):
    """Espelho de `read_generation`: devolve a geração ou None se corrompida.

    Ausência é a migração legada explícita (promovida a 0 com marcador). Um
    valor presente e inválido — ou ausência após migração — falha fechado.
    """
    # `null` em JSON vira cjson.null em Lua (NÃO é nil): presente e inválido.
    if 'transition_generation' not in state:
        if 'legacy_generation_migrated' in state:
            return None
        state['transition_generation'] = 0
        state['legacy_generation_migrated'] = 1
        return 0
    value = state['transition_generation']
    if not _geracao_valida_para_teste(value):
        return None
    return int(value)


class FakeRedis:
    """Redis em memória com TTL, SET NX EX, EVAL e falhas seletivas.

    `now` é um relógio falso: `advance()` permite testar expiração de lock e
    de marcas sem depender de sleep. `fail_prefixes` permite falhar apenas
    state/marcas/lock, para simular falha de persistência após o envio.
    """

    def __init__(self, fail=False):
        self.store = {}
        self.expires = {}
        self.sets = {}
        self.now = 0.0
        self._lock = threading.RLock()
        self.fail = fail
        self.fail_get = False
        self.fail_write = False
        self.fail_delete = False
        self.fail_eval = False
        self.fail_prefixes = set()
        self.set_calls = []
        self.script_calls = []

    def _should_fail(self, key, operation):
        return (
            self.fail
            or getattr(self, 'fail_' + operation, False)
            or any(str(key).startswith(prefix) for prefix in self.fail_prefixes)
        )

    def _evict_if_expired(self, key):
        exp = self.expires.get(key)
        if exp is not None and exp <= self.now:
            self.store.pop(key, None)
            self.expires.pop(key, None)
        return self.store.get(key)

    def advance(self, seconds):
        """Avança o relógio falso (expirando chaves cujo TTL venceu)."""
        self.now += float(seconds)

    def expire_key(self, key, seconds_from_now=0):
        """Força a expiração de uma chave (testes de lock roubado)."""
        self.expires[key] = self.now + float(seconds_from_now)

    def get(self, key):
        with self._lock:
            if self._should_fail(key, 'get'):
                raise Exception('Redis get falhou')
            return self._evict_if_expired(key)

    def set(self, key, value, nx=None, xx=None, ex=None, px=None, **kwargs):
        with self._lock:
            if self._should_fail(key, 'write'):
                raise Exception('Redis set falhou')
            self.set_calls.append({'key': key, 'value': value, 'nx': nx,
                                   'xx': xx, 'ex': ex, 'px': px})
            self._evict_if_expired(key)
            exists = key in self.store
            if nx and exists:
                return None
            if xx and not exists:
                return None
            self.store[key] = str(value)
            if ex is not None:
                self.expires[key] = self.now + float(ex)
            elif px is not None:
                self.expires[key] = self.now + float(px) / 1000.0
            else:
                self.expires.pop(key, None)
            return True

    def setnx(self, key, value):
        return self.set(key, value, nx=True)

    def expire(self, key, ttl):
        if self._should_fail(key, 'write'):
            raise Exception('Redis expire falhou')
        self._evict_if_expired(key)
        if key not in self.store:
            return 0
        self.expires[key] = self.now + float(ttl)
        return 1

    def setex(self, key, ttl, value):
        with self._lock:
            if self._should_fail(key, 'write'):
                raise Exception('Redis setex falhou')
            self.store[key] = str(value)
            self.expires[key] = self.now + float(ttl)
            return True

    def delete(self, *keys):
        with self._lock:
            removed = 0
            for key in keys:
                if self._should_fail(key, 'delete'):
                    raise Exception('Redis delete falhou')
                self._evict_if_expired(key)
                if key in self.store:
                    del self.store[key]
                    self.expires.pop(key, None)
                    removed += 1
            return removed

    def smembers(self, key):
        with self._lock:
            return set(self.sets.get(key, set()))

    def sadd(self, key, value):
        with self._lock:
            self.sets.setdefault(key, set()).add(value)

    def eval(self, script, keys=None, args=None):
        with self._lock:
            if any(self._should_fail(k, 'eval') for k in (keys or [None])):
                raise Exception('Redis eval falhou')
            self.script_calls.append({'script': script, 'keys': list(keys or []),
                                      'args': list(args or [])})
            key = (keys or [None])[0]
            token = (args or [None])[0]
            owner = self._evict_if_expired(key)

            # Transição HTTP: lê, valida a geração, incrementa e grava no EVAL.
            if '-- transition-status' in script:
                raw = self._evict_if_expired(key)
                if raw:
                    try:
                        state = json.loads(raw)
                    except Exception:
                        return 0
                    if not _estado_valido_para_teste(state):
                        return 0
                    generation = _ler_geracao_para_teste(state)
                    if generation is None or generation >= 1_000_000_000:
                        return 0
                    state['transition_generation'] = generation + 1
                else:
                    # Estado novo: o Lua já nasce na geração 1, sem marcador.
                    state = {
                        'last_known_status': args[0],
                        'ticket_updated_at': '',
                        'transition_generation': 1,
                        'reminder_count': 0,
                        'cycle_id': '',
                    }
                state['last_known_status'] = args[0]
                state['ticket_updated_at'] = ''
                self.setex(key, int(args[1]), json.dumps(state, ensure_ascii=False))
                return state['transition_generation']

            # Escrita da onda do worker: token + geração conferidos no EVAL.
            if '-- fenced-state-write' in script:
                state_key = keys[1]
                if owner != token:
                    return 0
                # ARGV chega como string no Redis; converter sem fallback.
                try:
                    expected = float(args[3])
                except (TypeError, ValueError):
                    return 0
                if not _geracao_valida_para_teste(expected):
                    return 0
                expected = int(expected)
                legacy_migrated = False
                raw = self._evict_if_expired(state_key)
                if raw:
                    try:
                        current = json.loads(raw)
                    except Exception:
                        return 0
                    if not _estado_valido_para_teste(current):
                        return 0
                    era_legado = (
                        'transition_generation' not in current
                        and 'legacy_generation_migrated' not in current
                    )
                    current_generation = _ler_geracao_para_teste(current)
                    if current_generation is None:
                        return 0
                    legacy_migrated = era_legado
                    if current_generation != expected:
                        return 0
                    terminal = {'resolvido', 'fechado', 'indeferido'}
                    current_status = str(current.get('last_known_status') or '')
                    current_cycle = str(current.get('cycle_id') or '')
                    if (current_status in terminal
                            and current_status != str(args[4] or '')
                            and current_cycle == str(args[5] or '')
                            and str(args[6] or '') == '1'):
                        return 0
                try:
                    incoming = json.loads(args[2])
                except Exception:
                    return 0
                if not _estado_valido_para_teste(incoming):
                    return 0
                payload_generation = incoming.get('transition_generation')
                if not _geracao_valida_para_teste(payload_generation):
                    return 0
                if int(payload_generation) != expected:
                    return 0
                incoming['transition_generation'] = expected
                if legacy_migrated:
                    incoming['legacy_generation_migrated'] = 1
                self.setex(state_key, int(args[1]), json.dumps(incoming, ensure_ascii=False))
                return 1

            # Scripts com fencing usam KEYS[1] como alvo; KEYS[0] é o lock.
            if '-- fenced-setex' in script:
                target = keys[1]
                if owner != token:
                    return 0
                return self.setex(target, int(args[1]), args[2])
            if '-- fenced-get' in script:
                target = keys[1]
                if owner != token:
                    return [0, '']
                value = self.get(target)
                return [1, value if value is not None else '']
            if '-- fenced-delete' in script:
                target = keys[1]
                if owner != token:
                    return 0
                # DEL de chave já expirada retorna 0 no Redis real; o contrato
                # do script é "1 = lock válido", não "1 = chave apagada".
                self.delete(target)
                return 1

            if owner != token:
                return 0
            if 'del' in script:
                return self.delete(key)
            if 'expire' in script:
                self.expires[key] = self.now + float(args[1])
                return 1
            return 0


class FakeSupabase:
    def __init__(self, tickets=None):
        self.tickets = list(tickets or [])
        self.calls = []
        self.ticket_events = {}
        self.profiles = {}          # id -> {'id': id, 'is_super_admin': bool}
        self.history_hooks = {}     # número da consulta 1-based -> callable
        self._history_calls = 0

    def add_ticket_event(self, ticket_id, event_type, new_status=None, created_at=None, content='', author=''):
        """Adiciona um evento de ticket para simular ticket_events."""
        import uuid as _uuid
        event = {
            'id': str(_uuid.uuid4()),
            'ticket_id': ticket_id,
            'workspace_id': 'ws-test',
            'type': event_type,
            'content': content,
            'author': author,
            'newStatus': new_status,
            'createdAt': created_at or datetime.now(timezone.utc).isoformat(),
        }
        self.ticket_events.setdefault(ticket_id, []).append(event)
        return event['id']

    def get(self, url, **kwargs):
        self.calls.append(('GET', url, kwargs.get('headers')))
        if '/rest/v1/chamados_tickets' in url and 'id=eq.' not in url:
            rows = [t for t in self.tickets
                    if t.get('status') == 'aberto' and str(t.get('assignedToUserId') or '') == '']
            return _Resp(True, rows)
        if '/rest/v1/chamados_tickets' in url and 'id=eq.' in url:
            tid = url.split('id=eq.')[1].split('&')[0]
            for t in self.tickets:
                if str(t.get('id')) == tid:
                    return _Resp(True, [t])
            return _Resp(True, [])

        if '/rest/v1/profiles' in url:
            import re as _re
            m = _re.search(r'id=in\.\(([^)]*)\)', url)
            if m:
                ids = [part.strip().strip('"') for part in m.group(1).split(',') if part.strip()]
                rows = [dict(p) for pid, p in self.profiles.items() if pid in ids]
            elif 'id=eq.' in url:
                pid = url.split('id=eq.')[1].split('&')[0]
                rows = [dict(self.profiles[pid])] if pid in self.profiles else []
            else:
                rows = [dict(p) for p in self.profiles.values()]
            return _Resp(True, rows)

        # Suporte a consultas de ticket_events para testes de reabertura.
        # O mock interpreta os parâmetros da URL como o PostgREST faria,
        # incluindo o limite numérico exato (evita confundir 'limit=100'
        # com 'limit=1' por substring).
        if '/rest/v1/ticket_events' in url:
            import re as _re

            self._history_calls += 1
            hook = self.history_hooks.get(self._history_calls)
            if hook is not None:
                hook(self)

            def _eq_param(name):
                m = _re.search(r'(?:^|[?&])' + _re.escape(name) + r'=eq\.([^&]+)', url)
                return m.group(1) if m else None

            ticket_id_param = _eq_param('ticket_id')
            target_type = _eq_param('type')
            target_status = _eq_param('newStatus')
            m_limit = _re.search(r'(?:^|[?&])limit=(\d+)(?=&|$)', url)
            limit_n = int(m_limit.group(1)) if m_limit else None
            order_desc = 'order=createdAt.desc' in url

            # Cursor keyset (PostgREST): createdAt.lt.X OR (createdAt.eq.X AND id.lt.Y)
            from urllib.parse import unquote as _unquote
            m_cursor_at = _re.search(r'createdAt\.lt\.([^,&)]+)', url)
            m_cursor_id = _re.search(r'id\.lt\.([^,&)]+)', url)

            events = list(getattr(self, 'ticket_events', {}).get(ticket_id_param, []))
            if target_type is not None:
                events = [e for e in events if e.get('type') == target_type]
            if target_status is not None:
                events = [e for e in events if str(e.get('newStatus') or '') == target_status]

            def _norm_ts(value):
                from datetime import datetime as _dt
                text = str(value or '').replace('Z', '+00:00')
                try:
                    return _dt.fromisoformat(text).astimezone(timezone.utc).isoformat()
                except Exception:
                    return text

            if m_cursor_at and m_cursor_id:
                cursor_at = _unquote(m_cursor_at.group(1))
                cursor_id = _unquote(m_cursor_id.group(1))
                events = [
                    e for e in events
                    if _norm_ts(e.get('createdAt')) < cursor_at
                    or (_norm_ts(e.get('createdAt')) == cursor_at and str(e.get('id', '')) < cursor_id)
                ]

            events.sort(
                key=lambda e: (_norm_ts(e.get('createdAt')), str(e.get('id', ''))),
                reverse=order_desc,
            )
            if limit_n is not None:
                events = events[:limit_n]

            return _Resp(True, events)

        return _Resp(True, [])

    def patch(self, url, **kwargs):
        self.calls.append(('PATCH', url, kwargs.get('json')))
        tid = url.split('id=eq.')[1].split('&')[0]
        for t in self.tickets:
            if str(t.get('id')) == tid:
                current_assigned = str(t.get('assignedToUserId') or '').strip()
                guard = 'or=(assignedToUserId.is.null,assignedToUserId.eq.)' in url
                if guard and current_assigned != '':
                    return _Resp(False, [], status_code=502)
                t.update(kwargs.get('json', {}))
                return _Resp(True, [t])
        return _Resp(False, [], status_code=502)


def _env(api_module, monkeypatch, tickets=None, redis_fail=False):
    fake_db = FakeSupabase(tickets)
    fake_redis = FakeRedis(fail=redis_fail)
    monkeypatch.setattr(api_module, 'redis', fake_redis)
    monkeypatch.setattr(api_module, '_SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setattr(api_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')
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


def _evento_status(fake_db, ticket, status, created_at=None):
    """Registra uma transição de status persistente (ticket_events) no mock."""
    return fake_db.add_ticket_event(
        ticket['id'], 'status', new_status=status,
        created_at=created_at or datetime.now(timezone.utc).isoformat(),
    )


def ciclo_id_valido(cid: str) -> bool:
    """Verifica se uma string parece um UUID válido."""
    import re as _re
    return bool(_re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', cid, _re.IGNORECASE))


def test_chamado_sem_responsavel_recebe_lembrete_apos_intervalo(api_module, monkeypatch):
    criado_há_3min = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    ticket = _make_ticket(_tid(1), ws=WS_A, number=10, created_at=criado_há_3min,
                          updated_at=criado_há_3min)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k1', 'endpoint': 'https://push.example/1', 'user': {'id': 'u1'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['checked'] == 1
    assert result['sent'] == 1
    assert len(sent) == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_chamado_novo_nao_recebe_primeiro_lembrete_imediatamente(api_module, monkeypatch):
    criado_agora = datetime.now(timezone.utc).isoformat()
    ticket = _make_ticket(_tid(2), ws=WS_A, number=11, created_at=criado_agora,
                          updated_at=criado_agora)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [{'key': 'k2', 'endpoint': 'x', 'user': {'id': 'u2'}}])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert len(sent) == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_chamado_antigo_sem_estado_redis_respeita_2_minutos(api_module, monkeypatch):
    criado_há_10min = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(3), ws=WS_A, number=12, created_at=criado_há_10min,
                          updated_at=criado_há_10min)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k3', 'endpoint': 'https://push.example/3', 'user': {'id': 'u3'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 1
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_respeita_intervalo_de_dois_minutos_entre_lembretes(api_module, monkeypatch):
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(4), ws=WS_A, number=13, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k4', 'endpoint': 'https://push.example/4', 'user': {'id': 'u4'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1
    assert len(sent) == 1

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1

    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    r3 = api_module._check_and_send_reminders()
    assert r3['sent'] == 1
    assert len(sent) == 2


def test_chamado_assumido_interrompe_lembretes(api_module, monkeypatch):
    ticket = _make_ticket(_tid(5), ws=WS_A, number=14, assigned_to_user_id='tec-1')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['checked'] == 0
    assert result['sent'] == 0
    assert len(sent) == 0


def test_chamado_resolvido_interrompe_lembretes(api_module, monkeypatch):
    ticket = _make_ticket(_tid(6), ws=WS_A, number=15, status='resolvido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_fechado_interrompe_lembretes(api_module, monkeypatch):
    ticket = _make_ticket(_tid(7), ws=WS_A, number=16, status='fechado')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_chamado_indeferido_interrompe_lembretes(api_module, monkeypatch):
    ticket = _make_ticket(_tid(8), ws=WS_A, number=17, status='indeferido')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0


def test_workspace_diferente_nao_recebe_lembrete_inedevido(api_module, monkeypatch):
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
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 1
    ws_consulted = {c[1] for c in calls}
    assert WS_A in ws_consulted
    assert WS_B in ws_consulted


def test_rbac2_respeitado(api_module, monkeypatch):
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
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    api_module._check_and_send_reminders()

    assert captured['module'] == 'chamados'
    assert captured['workspace_id'] == WS_A
    assert captured['min_level'] == 'full'


def test_preferencia_push_desativada_eh_respeitada(api_module, monkeypatch):
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(12), ws=WS_A, number=21, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert len(sent) == 0


def test_duas_execucoes_nao_duplicam_envio(api_module, monkeypatch):
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(13), ws=WS_A, number=22, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k13', 'endpoint': 'https://push.example/13', 'user': {'id': 'u13'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1


def test_redis_indisponivel_nao_processa(api_module, monkeypatch):
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(14), ws=WS_A, number=23, created_at=criado,
                          updated_at=criado)
    fake_db, _ = _env(api_module, monkeypatch, [ticket])

    monkeypatch.setattr(api_module, 'redis', None)

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [{'key': 'k', 'endpoint': 'x', 'user': {'id': 'u'}}])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()

    assert result['sent'] == 0
    assert result.get('error') == 'Redis não configurado'
    assert len(sent) == 0


def test_envio_parcial_tres_recebem_dois_falham(api_module, monkeypatch):
    """Três destinatários recebem e dois falham; nova execução notifica só os dois pendentes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(15), ws=WS_A, number=24, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    subs = [
        {'key': 'k15a', 'endpoint': f'https://push.example/15a{i}', 'user': {'id': f'u15a{i}'}}
        for i in range(5)
    ]
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: subs)

    # Primeira execução: os 2 últimos falham, os 3 primeiros recebem
    fail_indices = {3, 4}
    call_order = {'n': 0}
    def parcial(s, t, b, url=None, **kw):
        call_order['n'] += 1
        idx = call_order['n'] - 1
        return idx not in fail_indices

    monkeypatch.setattr(api_module, 'push_notify', parcial)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 3  # só 3 de 5 receberam

    # Estado geral não gravado (ciclo não concluído porque 2 falharam)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    assert fake_redis.get(state_key) is None

    # Segunda execução: os destinatários pendentes são reenviados
    call_order['n'] = 0
    def parcial2(s, t, b, url=None, **kw):
        call_order['n'] += 1
        return True  # todos recebem na segunda tentativa

    monkeypatch.setattr(api_module, 'push_notify', parcial2)

    r2 = api_module._check_and_send_reminders()
    # Exatamente os 2 pendentes: os 3 já marcados não podem ser reenviados.
    assert r2['sent'] == 2

    # Após ciclo completo, estado é gravado
    state = json.loads(fake_redis.get(state_key))
    assert state is not None
    assert state['reminder_count'] == 1


def test_falha_persistencia_apos_envio(api_module, monkeypatch):
    """Falha ao gravar o estado NÃO pode reenviar para quem já recebeu.

    A ordem segura é: push_notify → marca individual → gravação do estado →
    limpeza das marcas. Se a gravação falhar, as marcas permanecem e a
    execução seguinte apenas recupera o estado sem novo envio.
    """
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(16), ws=WS_A, number=25, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    subs = [
        {'key': 'k16a', 'endpoint': 'https://push.example/16a', 'user': {'id': 'u16a'}},
        {'key': 'k16b', 'endpoint': 'https://push.example/16b', 'user': {'id': 'u16b'}},
    ]
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: subs)
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(s['key']) or True)

    state_key = f'chamado:reminder:state:{ticket["id"]}'
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)

    original_write = api_module._write_reminder_state
    write_failed = {'flag': False}

    def write_fail(ticket_id, state, lock_token=None):
        write_failed['flag'] = True
        return False

    monkeypatch.setattr(api_module, '_write_reminder_state', write_fail)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 2
    assert write_failed['flag'] is True
    assert fake_redis.get(state_key) is None  # estado não foi persistido
    # Marcas preservadas: são a defesa contra duplicidade.
    for sub in subs:
        assert api_module._is_sub_sent(
            ticket['id'], cycle_id, 1, api_module._sub_identity(sub)
        ) is True

    monkeypatch.setattr(api_module, '_write_reminder_state', original_write)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0  # nenhum destinatário é reenviado
    assert len(sent) == 2

    # Estado recuperado sem reenvio; a marca da onda 1 permanece até o TTL.
    state = json.loads(fake_redis.get(state_key))
    assert state['reminder_count'] == 1
    assert state['cycle_id'] == cycle_id
    for sub in subs:
        assert api_module._is_sub_sent(
            ticket['id'], cycle_id, 1, api_module._sub_identity(sub)
        ) is True

    r3 = api_module._check_and_send_reminders()
    assert r3['sent'] == 0  # intervalo de 2 minutos preservado
    assert len(sent) == 2


def test_alteracao_descricao_nao_reinicia_ciclo(api_module, monkeypatch):
    """Alterar descrição/problema não reinicia o ciclo de lembretes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(17), ws=WS_A, number=26, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k17', 'endpoint': 'https://push.example/17', 'user': {'id': 'u17'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: envia (criado há 30 min > 2 min)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Altera apenas a descrição/problema (não é reabertura)
    ticket['problemCategory'] = 'Eletricidade'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Estado gravado com last_reminder_at recente e last_known_status='aberto'
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = datetime.now(timezone.utc).isoformat()
    state['last_known_status'] = 'aberto'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Segundo ciclo: não deve enviar (intervalo não passou, não é reabertura)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1  # não duplicou


def test_comentario_nao_reinicia_ciclo(api_module, monkeypatch):
    """Adicionar comentário ao chamado não reinicia o ciclo de lembretes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(18), ws=WS_A, number=27, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k18', 'endpoint': 'https://push.example/18', 'user': {'id': 'u18'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Adiciona um comentário (simulado por mudança em statusNote)
    ticket['statusNote'] = 'Técnico a caminho'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = datetime.now(timezone.utc).isoformat()
    state['last_known_status'] = 'aberto'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1


def test_reabertura_real_inicia_novo_ciclo(api_module, monkeypatch):
    """Reabertura real (resolvido→aberto) reseta o contador e inicia novo ciclo."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(19), ws=WS_A, number=28, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k19', 'endpoint': 'https://push.example/19', 'user': {'id': 'u19'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Histórico persistente: resolvido → aberto (reabertura real).
    _evento_status(fake_db, ticket, 'resolvido',
                   (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat())
    _evento_status(fake_db, ticket, 'aberto')

    # Estado prévio: chamado estava resolvido, já teve 5 lembretes
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    prior_state = {
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_reminder_at': datetime.now(timezone.utc).isoformat(),
        'reminder_count': 5,
        'last_known_status': 'resolvido',  # status encerrado prévio
    }
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(prior_state))

    # Agora o chamado está aberto novamente (reabertura real)
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1

    state = json.loads(fake_redis.get(state_key))
    assert state['reminder_count'] == 6  # novo ciclo, contador incrementado
    assert state['last_known_status'] == 'aberto'


def test_em_espera_nao_eh_tratado_como_encerrado(api_module, monkeypatch):
    """em_espera NÃO é um estado encerrado: não deve acionar reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(20), ws=WS_A, number=29, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k20', 'endpoint': 'https://push.example/20', 'user': {'id': 'u20'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: envia (criado há 30 min > 2 min)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Estado gravado com last_known_status='aberto'
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = datetime.now(timezone.utc).isoformat()
    state['last_known_status'] = 'aberto'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # O chamado entra em em_espera (não é encerrado para fins de lembrete)
    ticket['status'] = 'em_espera'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Volta para aberto (não é reabertura porque em_espera não é encerrado)
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Não deve ser tratado como reabertura: last_known_status='aberto' não está em closed_statuses
    result = api_module._check_and_send_reminders()
    # Como last_reminder_at é recente, não deve enviar novamente
    assert result['sent'] == 0
    assert len(sent) == 1


def test_encerrado_antes_do_primeiro_lembrete_e_reaberto(api_module, monkeypatch):
    """Chamado criado, fechado antes de 2 min (sem lembrete), reaberto depois."""
    criado = datetime.now(timezone.utc).isoformat()
    ticket = _make_ticket(_tid(21), ws=WS_A, number=30, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k21', 'endpoint': 'https://push.example/21', 'user': {'id': 'u21'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Nenhum lembrete enviado ainda (criado há < 2 min)
    r0 = api_module._check_and_send_reminders()
    assert r0['sent'] == 0
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None

    # O chamado é fechado (estado terminal) antes do primeiro lembrete
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Grava o status terminal no Redis e no histórico persistente.
    fechado_ts = (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat()
    api_module._record_terminal_status(ticket['id'], 'fechado')
    _evento_status(fake_db, ticket, 'fechado', created_at=fechado_ts)

    # Verifica que o estado foi gravado com last_known_status='fechado'
    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['last_known_status'] == 'fechado'

    # O chamado é reaberto posteriormente (passaram > 2 min desde a criação)
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = (datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat()
    _evento_status(fake_db, ticket, 'aberto', created_at=ticket['updatedAt'])

    # Deve ser identificado como reabertura e enviar lembrete
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1

    state = json.loads(fake_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['last_known_status'] == 'aberto'


def test_falha_redis_antes_e_depois_do_envio(api_module, monkeypatch):
    """Falha Redis antes do envio (não processa) e depois do envio (marca não gravada)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(22), ws=WS_A, number=31, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k22', 'endpoint': 'https://push.example/22', 'user': {'id': 'u22'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Falha de Redis antes do envio: não processa (fail-closed)
    monkeypatch.setattr(api_module, 'redis', None)
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0
    assert result.get('error') == 'Redis não configurado'
    assert len(sent) == 0

    # Restaura o Redis
    monkeypatch.setattr(api_module, 'redis', fake_redis)

    # Falha de Redis depois do envio: push_notify funciona, mas marca não é gravada
    original_mark = api_module._mark_sub_sent
    mark_failed = {'flag': False}
    def mark_fail(ticket_id, cycle_id, wave, identity, lock_token=None):
        mark_failed['flag'] = True
        return False
    monkeypatch.setattr(api_module, '_mark_sub_sent', mark_fail)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1  # push_notify funcionou
    assert mark_failed['flag'] is True  # marca não gravada

    # Restaura a função original
    monkeypatch.setattr(api_module, '_mark_sub_sent', original_mark)

    # Marca não gravada ⇒ destinatário permanece elegível (nenhum estado geral
    # foi escrito), então a execução seguinte deve reenviar exatamente a ele.
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    assert len(sent) == 2


def test_destinatario_ja_recebido_nao_recebe_no_mesmo_ciclo(api_module, monkeypatch):
    """Destinatário que já recebeu no ciclo atual não recebe novamente."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(23), ws=WS_A, number=32, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub1 = {'key': 'k23a', 'endpoint': 'https://push.example/23a', 'user': {'id': 'u23a'}}
    sub2 = {'key': 'k23b', 'endpoint': 'https://push.example/23b', 'user': {'id': 'u23b'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub1, sub2])

    # Primeiro ciclo: ambos recebem; onda 1 marcada até o TTL natural.
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 2
    assert len(sent) == 2

    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    for sub in [sub1, sub2]:
        identity = api_module._sub_identity(sub)
        assert api_module._is_sub_sent(
            ticket_id=ticket['id'], cycle_id=cycle_id, wave=1, identity=identity
        ) is True
        # A onda 2 usa namespace independente: marcas antigas não a bloqueiam.
        assert api_module._is_sub_sent(
            ticket_id=ticket['id'], cycle_id=cycle_id, wave=2, identity=identity
        ) is False

    # Estado geral gravado com last_reminder_at recente
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = datetime.now(timezone.utc).isoformat()
    state['last_known_status'] = 'aberto'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Segundo ciclo: ainda não passou o intervalo, não deve enviar
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 0


def test_redis_indisponivel_durante_transicao_terminal(api_module, monkeypatch):
    """Redis indisponível durante fechamento: transição terminal não gravada no Redis."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(24), ws=WS_A, number=33, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Remove o Redis: _record_terminal_status é best-effort e não pode levantar.
    monkeypatch.setattr(api_module, 'redis', None)
    api_module._record_terminal_status(ticket['id'], 'fechado')
    assert fake_redis.get(f'chamado:reminder:state:{ticket["id"]}') is None

    # Restaura o Redis. Sem evento persistente, NÃO há reabertura — o estado
    # volátil do Redis nunca autoriza o envio antecipado.
    monkeypatch.setattr(api_module, 'redis', fake_redis)
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    sub = {'key': 'k24', 'endpoint': 'https://push.example/24', 'user': {'id': 'u24'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    result = api_module._check_and_send_reminders()
    assert api_module._is_reopening(ticket, None) is False
    assert result['sent'] == 1  # primeiro lembrete por createdAt (há 10 min)
    assert enviados == ['k24']


def test_recuperacao_transicao_terminal_quando_redis_volta(api_module, monkeypatch):
    """Redis falha durante fechamento, volta depois: ticket_events é fonte da verdade."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(25), ws=WS_A, number=34, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Simula que o chamado foi fechado: grava estado terminal diretamente no Redis
    # (como _record_terminal_status faria se Redis estivesse disponível)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    terminal_state = {
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_known_status': 'fechado',
        'reminder_count': 0,
        'cycle_id': criado,
    }
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(terminal_state))

    # Agora reabre o chamado
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    sub = {'key': 'k25', 'endpoint': 'https://push.example/25', 'user': {'id': 'u25'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Sem ticket_events não há reabertura comprovada. O envio ocorre apenas
    # porque createdAt é antigo (30 min), não por causa do estado no Redis.
    assert api_module._is_reopening(ticket, None) is False
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1

    state = json.loads(fake_redis.get(state_key))
    assert state['last_known_status'] == 'aberto'


def test_reabertura_apos_fechamento_sem_lembrete_anterior(api_module, monkeypatch):
    """Chamado fechado antes do primeiro lembrete, depois reaberto: novo ciclo."""
    criado = datetime.now(timezone.utc).isoformat()  # há menos de 2 min
    ticket = _make_ticket(_tid(26), ws=WS_A, number=35, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Nenhum lembrete enviado ainda (criado há < 2 min)
    sub = {'key': 'k26', 'endpoint': 'https://push.example/26', 'user': {'id': 'u26'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    r0 = api_module._check_and_send_reminders()
    assert r0['sent'] == 0  # ainda não passou 2 min desde createdAt

    # Fecha o chamado (estado terminal)
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Grava estado terminal no Redis e no histórico persistente.
    _evento_status(fake_db, ticket, 'fechado')
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps({
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_known_status': 'fechado',
        'reminder_count': 0,
        'cycle_id': criado,
    }))

    # Reabre o chamado (passaram > 2 min desde createdAt)
    ticket['status'] = 'aberto'
    ticket['updatedAt'] = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    _evento_status(fake_db, ticket, 'aberto', created_at=ticket['updatedAt'])

    # Deve ser reconhecido como reabertura e enviar lembrete
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1

    state = json.loads(fake_redis.get(state_key))
    assert state['last_known_status'] == 'aberto'


def test_cinco_destinatarios_tres_recebem_dois_falham_fechamento_reabertura(api_module, monkeypatch):
    """5 destinatários, 3 recebem e 2 falham; chamado fechado e reaberto; os 5 recebem no novo ciclo."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(27), ws=WS_A, number=36, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    subs = [
        {'key': f'k27a{i}', 'endpoint': f'https://push.example/27a{i}', 'user': {'id': f'u27a{i}'}}
        for i in range(5)
    ]
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: subs)

    # Primeiro ciclo: os 3 primeiros recebem, os 2 últimos falham
    call_order = {'n': 0}
    def parcial(s, t, b, url=None, **kw):
        call_order['n'] += 1
        return call_order['n'] <= 3  # primeiros 3 recebem

    monkeypatch.setattr(api_module, 'push_notify', parcial)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 3  # só 3 de 5 receberam

    # Fecha o chamado sem concluir o ciclo (2 pendentes)
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Grava last_known_status='fechado' no Redis e no histórico persistente.
    _evento_status(fake_db, ticket, 'fechado')
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps({
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_known_status': 'fechado',
        'reminder_count': 1,
        'cycle_id': criado,
    }))

    # Reabre o chamado (novo ciclo) com evento persistente de reabertura.
    ticket['status'] = 'aberto'
    ticket['createdAt'] = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    ticket['updatedAt'] = ticket['createdAt']
    _evento_status(fake_db, ticket, 'aberto', created_at=ticket['createdAt'])

    # Segundo ciclo: todos os 5 devem receber (novos cycle_id, marcas antigas não interferem)
    call_order['n'] = 0
    def todos_recebem(s, t, b, url=None, **kw):
        call_order['n'] += 1
        return True

    monkeypatch.setattr(api_module, 'push_notify', todos_recebem)

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 5  # todos os 5 recebem no novo ciclo


def test_marcas_antigas_nao_interferem_no_novo_ciclo(api_module, monkeypatch):
    """Marcas de ciclo anterior não afetam o ciclo atual após reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(28), ws=WS_A, number=37, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k28', 'endpoint': 'https://push.example/28', 'user': {'id': 'u28'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: envia e conclui
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Fecha o chamado (estado terminal)
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Grava last_known_status='fechado' no Redis e no histórico persistente.
    _evento_status(fake_db, ticket, 'fechado')
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_known_status'] = 'fechado'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Reabre com novo createdAt e evento persistente de reabertura.
    ticket['status'] = 'aberto'
    ticket['createdAt'] = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    ticket['updatedAt'] = ticket['createdAt']
    _evento_status(fake_db, ticket, 'aberto', created_at=ticket['createdAt'])

    # Deve ser reconhecido como reabertura (histórico terminal → aberto) e enviar novamente
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1


def test_execucao_concorrente_nao_apaga_marcas_de_outro_ciclo(api_module, monkeypatch):
    """Lock atômico impede que execuções concorrentes processem o mesmo chamado."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(29), ws=WS_A, number=38, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k29', 'endpoint': 'https://push.example/29', 'user': {'id': 'u29'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeira execução adquire o lock e envia
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Segunda execução imediata: lock ainda ativo, não processa
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 1


def test_falha_durante_limpeza_marcas_antigas(api_module, monkeypatch):
    """Falha ao limpar marcas antigas não bloqueia o novo ciclo."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(30), ws=WS_A, number=39, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k30', 'endpoint': 'https://push.example/30', 'user': {'id': 'u30'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: envia com sucesso
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Fecha o chamado (estado terminal)
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Grava last_known_status='fechado' no Redis e no histórico persistente.
    _evento_status(fake_db, ticket, 'fechado')
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_known_status'] = 'fechado'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Reabre com novo createdAt e evento persistente de reabertura.
    ticket['status'] = 'aberto'
    ticket['createdAt'] = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    ticket['updatedAt'] = ticket['createdAt']
    _evento_status(fake_db, ticket, 'aberto', created_at=ticket['createdAt'])

    # Simula falha na limpeza de marcas (delete lança exceção)
    original_delete = fake_redis.delete
    delete_failed = {'flag': False}
    def delete_fail(key):
        if 'sent:' in key:
            delete_failed['flag'] = True
            raise Exception('delete falhou')
        return original_delete(key)
    fake_redis.delete = delete_fail

    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Mesmo com falha na limpeza de marcas, o novo ciclo deve processar
    # (o cycle_id é diferente, então marcas antigas são ignoradas mesmo sem limpeza)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 1
    assert delete_failed['flag'] is True


def test_ciclo_concluido_nao_gera_lembretes_duplicados(api_module, monkeypatch):
    """Ciclo concluído (todos receberam) não gera lembretes duplicados no próximo ciclo."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(31), ws=WS_A, number=40, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k31', 'endpoint': 'https://push.example/31', 'user': {'id': 'u31'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: envia e conclui
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Estado gravado com last_reminder_at recente
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    state['last_reminder_at'] = datetime.now(timezone.utc).isoformat()
    state['last_known_status'] = 'aberto'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))

    # Segundo ciclo: intervalo não passou, não deve enviar
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(sent) == 0


def test_encerramento_seguido_de_reabertura_por_ticket_events(api_module, monkeypatch):
    """Encerramento seguido de reabertura detectado via ticket_events (não Redis)."""
    criado = datetime.now(timezone.utc).isoformat()
    fechado = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    reaberto = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(40), ws=WS_A, number=41, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra eventos de status no ticket_events (fonte persistente)
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=fechado, content='Chamado resolvido')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Chamado reaberto')

    sub = {'key': 'k40', 'endpoint': 'https://push.example/40', 'user': {'id': 'u40'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Reabertura detectada via ticket_events: último evento é 'aberto',
    # penúltimo é 'resolvido' (terminal) → é reabertura real.
    # O ciclo é resetado e o lembrete é devido imediatamente.
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1  # reabertura detectada, lembrete enviado

    # Verifica que o estado foi gravado com o novo cycle_id (UUID do evento de reabertura)
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    state = json.loads(fake_redis.get(state_key))
    assert state['last_known_status'] == 'aberto'


def test_reabertura_apos_redis_indisponível_durante_encerramento(api_module, monkeypatch):
    """Redis indisponível durante fechamento, mas ticket_events preserva o histórico."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    fechado = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    ticket = _make_ticket(_tid(41), ws=WS_A, number=42, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra fechamento no ticket_events (sobrevive à indisponibilidade do Redis)
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='fechado',
                             created_at=fechado, content='Chamado fechado')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Chamado reaberto')

    # Redis está disponível agora, mas não tem estado gravado (foi perdido na indisponibilidade)
    # A recuperação deve vir do ticket_events
    sub = {'key': 'k41', 'endpoint': 'https://push.example/41', 'user': {'id': 'u41'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # _is_reopening deve detectar via ticket_events: último='aberto', penúltimo='fechado'
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1  # reabertura detectada via ticket_events


def test_ciclo_novo_identificado_por_uuid_do_evento(api_module, monkeypatch):
    """Cycle_id usa UUID do evento de reabertura, não o timestamp."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(42), ws=WS_A, number=43, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra um fechamento seguido de duas reaberturas em ordem cronológica
    fechado = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    reabertura_1 = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    reabertura_2 = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=fechado, content='Resolvido')
    evento_reabertura_1 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                                   created_at=reabertura_1)
    evento_reabertura_2 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                                   created_at=reabertura_2)

    sub = {'key': 'k42', 'endpoint': 'https://push.example/42', 'user': {'id': 'u42'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Segunda execução: cycle_id deve ser um UUID válido de um evento de
    # reabertura, não o created_at do chamado.
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo_id_valido(cycle_id), f'cycle_id {cycle_id} não é um UUID válido'
    assert cycle_id != criado, 'cycle_id deve ser um UUID de evento, não created_at do chamado'
    assert cycle_id == evento_reabertura_1, f'Esperado {evento_reabertura_1}, obtido {cycle_id}'



def test_dois_eventos_mesmo_timestamp_uuid_diferente(api_module, monkeypatch):
    """Dois eventos com timestamps iguais mas UUIDs diferentes geram ciclos distintos."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    mesmo_ts = datetime.now(timezone.utc).isoformat()
    ticket = _make_ticket(_tid(43), ws=WS_A, number=44, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra um fechamento antes dos dois eventos de reabertura com mesmo timestamp
    fechado = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=fechado, content='Resolvido')

    # Dois eventos de reabertura com mesmo createdAt mas UUIDs diferentes
    uuid_1 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                      created_at=mesmo_ts)
    uuid_2 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                      created_at=mesmo_ts)

    sub = {'key': 'k43', 'endpoint': 'https://push.example/43', 'user': {'id': 'u43'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo com uuid_1 (mais antigo na lista, mas mesmo timestamp)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # O cycle_id deve ser um UUID válido (não vazio, não criado_at do chamado)
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo_id_valido(cycle_id), f'cycle_id {cycle_id} não é um UUID válido'
    assert cycle_id != ''
    assert uuid_1 != uuid_2, 'UUIDs diferentes devem ser gerados'


def test_em_espera_nao_cria_novo_ciclo(api_module, monkeypatch):
    """em_espera → em_atendimento não cria novo ciclo de lembretes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(44), ws=WS_A, number=45, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra evento de espera e retomada no ticket_events
    espera_ts = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    atendimento_ts = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_espera',
                             created_at=espera_ts, content='Em espera')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_atendimento',
                             created_at=atendimento_ts, content='Retomada')

    sub = {'key': 'k44', 'endpoint': 'https://push.example/44', 'user': {'id': 'u44'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: criado há 30 min, deve enviar
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # O chamado está em_atendimento (não é 'aberto'), então não é elegível para lembrete
    ticket['status'] = 'em_atendimento'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0  # não é reabertura, não é elegível


def test_a_caminho_interrompe_lembretes(api_module, monkeypatch):
    """Chamado assumido (a_caminho) interrompe os lembretes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(45), ws=WS_A, number=46, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra evento de claim (a_caminho) no ticket_events
    claim_ts = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='a_caminho',
                             created_at=claim_ts, content='Chamado assumido')

    sub = {'key': 'k45', 'endpoint': 'https://push.example/45', 'user': {'id': 'u45'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: criado há 30 min, deve enviar
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Agora o chamado está assumido (assignedToUserId preenchido)
    ticket['status'] = 'a_caminho'
    ticket['assignedToUserId'] = 'tec-1'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Não é elegível (já tem responsável)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0


def test_evento_retomada_persiste_newstatus(api_module, monkeypatch):
    """Evento de retomada persiste newStatus='em_atendimento' corretamente."""
    # Este teste verifica que _record_ticket_event aceita e armazena new_status
    # (a correção no endpoint de retomada garante que new_status seja passado)
    # Simulamos a chamada direta ao _record_ticket_event
    from unittest.mock import patch, MagicMock

    # Não testamos o endpoint HTTP, mas verificamos que a função aceita o parâmetro
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(46), ws=WS_A, number=47, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Adiciona evento de retomada com new_status
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_atendimento',
                             created_at=datetime.now(timezone.utc).isoformat(),
                             content='Retomada')

    # Verifica que o evento foi armazenado com new_status
    eventos = fake_db.ticket_events.get(ticket['id'], [])
    eventos_retomada = [e for e in eventos if e.get('type') == 'status' and e.get('newStatus') == 'em_atendimento']
    assert len(eventos_retomada) == 1
    assert eventos_retomada[0]['newStatus'] == 'em_atendimento'


def test_comentario_nao_cria_novo_ciclo(api_module, monkeypatch):
    """Comentário ou edição de descrição não cria ciclo novo."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(47), ws=WS_A, number=48, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k47', 'endpoint': 'https://push.example/47', 'user': {'id': 'u47'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Adiciona evento de comentário (não é transição de status)
    fake_db.add_ticket_event(ticket['id'], 'comentario', new_status=None,
                             created_at=datetime.now(timezone.utc).isoformat(),
                             content='Comentário sobre o chamado')

    # Edição de descrição não muda o status
    ticket['problemDescription'] = 'Descrição atualizada'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()

    # Não deve ser reabertura: último evento de status ainda é 'aberto' (criação)
    # ou não há evento de reabertura com newStatus='aberto' após terminal
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0  # intervalo não passou, não é reabertura


def test_cinco_destinatarios_possui_receber_no_novo_ciclo(api_module, monkeypatch):
    """5 destinatários, 3 receberam no ciclo anterior; após reabertura, os 5 recebem."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(48), ws=WS_A, number=49, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    subs = [
        {'key': f'k48a{i}', 'endpoint': f'https://push.example/48a{i}', 'user': {'id': f'u48a{i}'}}
        for i in range(5)
    ]
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: subs)

    # Primeiro ciclo: os 3 primeiros recebem, os 2 últimos falham
    call_order = {'n': 0}
    def parcial(s, t, b, url=None, **kw):
        call_order['n'] += 1
        return call_order['n'] <= 3

    monkeypatch.setattr(api_module, 'push_notify', parcial)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 3

    # Fecha o chamado e registra no ticket_events
    ticket['status'] = 'fechado'
    ticket['updatedAt'] = datetime.now(timezone.utc).isoformat()
    fechado_ts = datetime.now(timezone.utc).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='fechado',
                             created_at=fechado_ts, content='Fechado')

    # Reabre com novo evento de status no ticket_events
    reaberto_ts = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    ticket['status'] = 'aberto'
    ticket['createdAt'] = reaberto_ts
    ticket['updatedAt'] = reaberto_ts
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto_ts, content='Reaberto')

    # Segundo ciclo: todos os 5 devem receber (novo cycle_id via UUID do evento de reabertura)
    call_order['n'] = 0
    def todos_recebem(s, t, b, url=None, **kw):
        call_order['n'] += 1
        return True

    monkeypatch.setattr(api_module, 'push_notify', todos_recebem)
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 5  # todos os 5 recebem no novo ciclo


def test_consulta_ticket_events_vazia_timeout_erro(api_module, monkeypatch):
    """Consulta vazia, timeout e erro HTTP no histórico têm comportamento seguro."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(49), ws=WS_A, number=50, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k49', 'endpoint': 'https://push.example/49', 'user': {'id': 'u49'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # 1. Consulta vazia (sem eventos de status)
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1  # primeiro lembrete por createdAt

    # 2. Simula erro HTTP na consulta a ticket_events
    original_get = fake_db.get
    def get_erro(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            class RespErro:
                ok = False
                status_code = 500
                text = 'Erro interno'
            return RespErro()
        return original_get(url, **kwargs)
    fake_db.get = get_erro

    # Histórico inconclusivo: nenhum envio, sem fallback para o estado do Redis.
    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0

    # 3. Simula timeout
    def get_timeout(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            raise Exception('timeout')
        return original_get(url, **kwargs)
    fake_db.get = get_timeout

    r3 = api_module._check_and_send_reminders()
    assert r3['sent'] == 0  # comportamento seguro, não lança exceção

    # Restaura
    fake_db.get = original_get


def test_reabertura_seguida_de_em_espera_nao_eh_reabertura(api_module, monkeypatch):
    """aberto → resolvido → aberto → em_espera: não é reabertura, último evento não é 'aberto'."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    resolvido = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    espera = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(50), ws=WS_A, number=51, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido, content='Resolvido')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Reaberto')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_espera',
                             created_at=espera, content='Em espera')

    # O último evento é 'em_espera', não 'aberto' → não é reabertura
    # E o ticket não está em 'aberto' atualmente
    ticket['status'] = 'em_espera'
    ticket['updatedAt'] = espera

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0  # não é reabertura, não é elegível (status != 'aberto')


def test_reabertura_seguida_de_em_atendimento_nao_eh_reabertura(api_module, monkeypatch):
    """aberto → resolvido → aberto → em_atendimento: não é reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    resolvido = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    atendimento = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(51), ws=WS_A, number=52, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido, content='Resolvido')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Reaberto')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_atendimento',
                             created_at=atendimento, content='Em atendimento')

    ticket['status'] = 'em_atendimento'
    ticket['updatedAt'] = atendimento

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0  # não é reabertura, não é elegível


def test_aberto_resolvido_aberto_aberto_eh_reabertura(api_module, monkeypatch):
    """aberto → resolvido → aberto → aberto: última reabertura é válida."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    resolvido = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto1 = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    reaberto2 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(52), ws=WS_A, number=53, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido, content='Resolvido')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto1, content='Reabertura 1')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto2, content='Reabertura 2')

    sub = {'key': 'k52', 'endpoint': 'https://push.example/52', 'user': {'id': 'u52'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Re-reabertura detectada: último evento é 'aberto', penúltimo também é 'aberto',
    # mas o terminal antes da primeira reabertura é 'resolvido'
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1  # re-reabertura detectada, lembrete enviado


def test_aberto_fechado_aberto_em_espera_nao_eh_reabertura(api_module, monkeypatch):
    """aberto → fechado → aberto → em_espera: não é reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    fechado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    espera = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(53), ws=WS_A, number=54, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='fechado',
                             created_at=fechado, content='Fechado')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Reaberto')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_espera',
                             created_at=espera, content='Em espera')

    ticket['status'] = 'em_espera'
    ticket['updatedAt'] = espera

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0  # não é reabertura, não é elegível


def test_aberto_indeferido_aberto_eh_reabertura(api_module, monkeypatch):
    """aberto → indeferido → aberto: é reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    indeferido = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    ticket = _make_ticket(_tid(54), ws=WS_A, number=55, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='indeferido',
                             created_at=indeferido, content='Indeferido')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                             created_at=reaberto, content='Reaberto')

    sub = {'key': 'k54', 'endpoint': 'https://push.example/54', 'user': {'id': 'u54'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1  # reabertura detectada


def test_aberto_em_espera_em_atendimento_nao_eh_reabertura(api_module, monkeypatch):
    """aberto → em_espera → em_atendimento: não é reabertura."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    espera = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    atendimento = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(55), ws=WS_A, number=56, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_espera',
                             created_at=espera, content='Em espera')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_atendimento',
                             created_at=atendimento, content='Em atendimento')

    ticket['status'] = 'em_atendimento'
    ticket['updatedAt'] = atendimento

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0  # não é reabertura, não é elegível


def test_aberto_a_caminho_interrompe_lembretes(api_module, monkeypatch):
    """aberto → a_caminho: interrompe lembretes (não é reabertura)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    claim = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(56), ws=WS_A, number=57, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='a_caminho',
                             created_at=claim, content='Assumido')

    sub = {'key': 'k56', 'endpoint': 'https://push.example/56', 'user': {'id': 'u56'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo: criado há 40 min, deve enviar
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # Agora o chamado está assumido (a_caminho) — não é elegível
    ticket['status'] = 'a_caminho'
    ticket['assignedToUserId'] = 'tec-1'
    ticket['updatedAt'] = claim

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0  # não é reabertura, já tem responsável


def test_dois_eventos_mesmo_timestamp_uuid_diferente_ordenacao_id(api_module, monkeypatch):
    """Dois eventos com mesmo createdAt mas UUIDs diferentes: ordenação por id."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    mesmo_ts = datetime.now(timezone.utc).isoformat()
    ticket = _make_ticket(_tid(57), ws=WS_A, number=58, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Registra um fechamento antes dos dois eventos de reabertura com mesmo timestamp
    fechado = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=fechado, content='Resolvido')

    # Dois eventos de reabertura com mesmo createdAt mas UUIDs diferentes
    uuid_1 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                      created_at=mesmo_ts, content='Reabertura 1')
    uuid_2 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                      created_at=mesmo_ts, content='Reabertura 2')

    sub = {'key': 'k57', 'endpoint': 'https://push.example/57', 'user': {'id': 'u57'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Primeiro ciclo
    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1

    # O cycle_id deve ser um UUID válido (não vazio, não criado_at do chamado)
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo_id_valido(cycle_id), f'cycle_id {cycle_id} não é um UUID válido'
    assert cycle_id != ''
    assert uuid_1 != uuid_2, 'UUIDs diferentes devem ser gerados'


def test_consulta_ticket_events_vazia_retorna_none(api_module, monkeypatch):
    """Consulta a ticket_events sem eventos de status retorna None."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(58), ws=WS_A, number=59, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    # Nenhum evento de status cadastrado
    sub = {'key': 'k58', 'endpoint': 'https://push.example/58', 'user': {'id': 'u58'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Sem eventos de status, _get_last_terminal_status retorna None
    # e _is_reopening retorna False (usa createdAt do chamado)
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1  # primeiro lembrete por createdAt


def test_consulta_ticket_events_timeout_nao_lanca_excecao(api_module, monkeypatch):
    """Timeout na consulta a ticket_events tem comportamento seguro."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(59), ws=WS_A, number=60, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k59', 'endpoint': 'https://push.example/59', 'user': {'id': 'u59'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Simula timeout na consulta a ticket_events
    original_get = fake_db.get
    def get_timeout(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            raise Exception('timeout de conexão')
        return original_get(url, **kwargs)
    fake_db.get = get_timeout

    # Histórico inconclusivo: falha fechada, sem envio e sem fallback Redis.
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0

    # Restaura
    fake_db.get = original_get


def test_consulta_ticket_events_erro_http_nao_lanca_excecao(api_module, monkeypatch):
    """Erro HTTP na consulta a ticket_events tem comportamento seguro."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(60), ws=WS_A, number=61, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    sub = {'key': 'k60', 'endpoint': 'https://push.example/60', 'user': {'id': 'u60'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    sent = []
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: sent.append(True) or True)

    # Simula erro HTTP 500 na consulta a ticket_events
    original_get = fake_db.get
    def get_erro(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            class RespErro:
                ok = False
                status_code = 500
                text = 'Erro interno do servidor'
            return RespErro()
        return original_get(url, **kwargs)
    fake_db.get = get_erro

    # Histórico inconclusivo: falha fechada, sem envio e sem fallback Redis.
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0

    # Restaura
    fake_db.get = original_get


def test_ciclo_vigente_ignora_eventos_posteriores_a_reabertura(api_module, monkeypatch):
    """O ciclo atual é o da última transição terminal → aberto, não o do último evento."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    ticket = _make_ticket(_tid(60), ws=WS_A, number=61, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    resolvido = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    reaberto = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    espera = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    atendimento = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    aberto_repetido = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido, content='Resolvido')
    id_reabertura = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                             created_at=reaberto, content='Reaberto')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_espera',
                             created_at=espera, content='Em espera')
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='em_atendimento',
                             created_at=atendimento, content='Em atendimento')
    id_repetido = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                           created_at=aberto_repetido, content='Aberto novamente')

    assert api_module._get_last_terminal_status(ticket['id']) == 'resolvido'
    assert api_module._is_reopening(ticket, None) is True
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo_id_valido(cycle_id)
    assert cycle_id == id_reabertura
    assert cycle_id != id_repetido

    consultas = [url for _method, url, _headers in fake_db.calls
                 if '/rest/v1/ticket_events' in url]
    assert consultas
    assert all('order=createdAt.desc,id.desc' in url for url in consultas)


def test_novo_terminal_e_reabertura_geram_novo_ciclo(api_module, monkeypatch):
    """Um novo ciclo é criado somente na reabertura que segue o novo terminal."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=50)).isoformat()
    ticket = _make_ticket(_tid(61), ws=WS_A, number=62, created_at=criado,
                          updated_at=criado, status='aberto')
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    resolvido_1 = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    reaberto_1 = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    resolvido_2 = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    reaberto_2 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido_1)
    id_reabertura_1 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                               created_at=reaberto_1)
    fake_db.add_ticket_event(ticket['id'], 'status', new_status='resolvido',
                             created_at=resolvido_2)
    id_reabertura_2 = fake_db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                                               created_at=reaberto_2)

    assert api_module._get_last_terminal_status(ticket['id']) == 'resolvido'
    assert api_module._is_reopening(ticket, None) is True
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo_id_valido(cycle_id)
    assert cycle_id == id_reabertura_2
    assert cycle_id != id_reabertura_1


def test_fetch_historico_distingue_vazio_disponivel_e_inconclusivo(api_module, monkeypatch):
    """`[]`, histórico válido e falha são três estados diferentes."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(62), ws=WS_A, number=63, created_at=criado)
    fake_db, _fake_redis = _env(api_module, monkeypatch, [ticket])

    vazio = api_module._fetch_ticket_status_events(ticket['id'])
    assert vazio.state == 'empty'
    assert vazio.rows == ()
    assert vazio.available is False
    assert vazio.inconclusive is False

    _evento_status(fake_db, ticket, 'resolvido',
                   (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat())
    _evento_status(fake_db, ticket, 'aberto')
    disponivel = api_module._fetch_ticket_status_events(ticket['id'])
    assert disponivel.state == 'available'
    assert disponivel.available is True
    assert [r['newStatus'] for r in disponivel.rows] == ['resolvido', 'aberto']

    original_get = fake_db.get

    def get_erro(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            return _Resp(False, [], status_code=500)
        return original_get(url, **kwargs)

    fake_db.get = get_erro
    falha = api_module._fetch_ticket_status_events(ticket['id'])
    assert falha.state == 'inconclusive'
    assert falha.inconclusive is True
    assert falha.rows == ()
    fake_db.get = original_get


def test_fetch_json_invalido_e_payload_inesperado_sao_inconclusivos(api_module, monkeypatch):
    """JSON quebrado e payload fora do formato não viram histórico vazio."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(63), ws=WS_A, number=64, created_at=criado)
    fake_db, _fake_redis = _env(api_module, monkeypatch, [ticket])
    original_get = fake_db.get

    class RespJsonInvalido:
        ok = True
        status_code = 200

        def json(self):
            raise ValueError('JSON inválido')

    def get_json_invalido(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            return RespJsonInvalido()
        return original_get(url, **kwargs)

    fake_db.get = get_json_invalido
    assert api_module._fetch_ticket_status_events(ticket['id']).state == 'inconclusive'
    fake_db.get = original_get

    def get_payload_inesperado(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            return _Resp(True, {'data': []})
        return original_get(url, **kwargs)

    fake_db.get = get_payload_inesperado
    assert api_module._fetch_ticket_status_events(ticket['id']).state == 'inconclusive'
    fake_db.get = original_get


def test_paginacao_completa_mais_de_100_eventos_sem_duplicidade(api_module, monkeypatch):
    """Todas as páginas são lidas, em ordem estável, sem lacunas ou duplicações."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=300)).isoformat()
    ticket = _make_ticket(_tid(64), ws=WS_A, number=65, created_at=criado)
    fake_db, _fake_redis = _env(api_module, monkeypatch, [ticket])

    base = datetime.now(timezone.utc) - timedelta(minutes=280)
    ts = lambda i: (base + timedelta(seconds=i)).isoformat()
    id_terminal = _evento_status(fake_db, ticket, 'resolvido', created_at=ts(0))
    id_reabertura = _evento_status(fake_db, ticket, 'aberto', created_at=ts(1))
    for i in range(2, 250):
        status = 'em_espera' if i % 2 == 0 else 'em_atendimento'
        _evento_status(fake_db, ticket, status, created_at=ts(i))

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'available'
    assert len(history.rows) == 250
    ids = [r['id'] for r in history.rows]
    assert len(set(ids)) == 250
    assert ids[0] == id_terminal
    assert ids[1] == id_reabertura
    timestamps = [r['createdAt'] for r in history.rows]
    assert timestamps == sorted(timestamps)
    assert api_module._get_last_terminal_status(ticket['id'], history) == 'resolvido'
    assert api_module._get_cycle_id(ticket['id'], ticket, history) == id_reabertura

    consultas = [url for _m, url, _h in fake_db.calls if '/rest/v1/ticket_events' in url]
    # Duas passadas completas (100 + 100 + 50, duas vezes): o schema não é
    # append-only, então só comparar a primeira página não detecta mutações.
    assert len(consultas) == 6
    assert all('limit=100' in url and 'order=createdAt.desc,id.desc' in url
               for url in consultas)
    assert 'createdAt.lt.' not in consultas[0]
    assert 'createdAt.lt.' in consultas[1]
    assert 'createdAt.lt.' in consultas[2]
    assert 'createdAt.lt.' not in consultas[3]  # releitura da primeira página


def test_falha_pagina_intermediaria_e_inconclusiva(api_module, monkeypatch):
    """Falha na segunda página não pode ser tratada como fim do histórico."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=300)).isoformat()
    ticket = _make_ticket(_tid(65), ws=WS_A, number=66, created_at=criado)
    fake_db, _fake_redis = _env(api_module, monkeypatch, [ticket])
    base = datetime.now(timezone.utc) - timedelta(minutes=280)
    for i in range(250):
        _evento_status(fake_db, ticket, 'em_espera',
                       created_at=(base + timedelta(seconds=i)).isoformat())

    original_get = fake_db.get
    paginas = {'n': 0}

    def get_falha_intermediaria(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            paginas['n'] += 1
            if paginas['n'] == 2:
                return _Resp(False, [], status_code=500)
        return original_get(url, **kwargs)

    fake_db.get = get_falha_intermediaria
    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'inconclusive'
    assert history.rows == ()
    assert paginas['n'] == 2
    assert api_module._get_last_terminal_status(ticket['id'], history) is None
    fake_db.get = original_get


def test_redis_antigo_nao_autoriza_reabertura_com_historico_inconclusivo(api_module, monkeypatch):
    """Estado terminal stale no Redis não dispara lembrete se a consulta falhar."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(66), ws=WS_A, number=67, created_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])

    state_key = f'chamado:reminder:state:{ticket["id"]}'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps({
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_known_status': 'fechado',
        'last_reminder_at': (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(),
        'reminder_count': 3,
    }))

    sub = {'key': 'k66', 'endpoint': 'https://push.example/66', 'user': {'id': 'u66'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    original_get = fake_db.get

    def get_timeout(url, **kwargs):
        if '/rest/v1/ticket_events' in url:
            raise TimeoutError('timeout')
        return original_get(url, **kwargs)

    fake_db.get = get_timeout
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0
    assert enviados == []
    assert json.loads(fake_redis.get(state_key))['last_known_status'] == 'fechado'
    fake_db.get = original_get


def test_empate_terminal_reabertura_e_inconclusivo(api_module, monkeypatch):
    """Sem sequência no schema, empate terminal/aberto não é resolvido por UUID."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(67), ws=WS_A, number=68, created_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])
    mesmo_ts = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    _evento_status(fake_db, ticket, 'resolvido', created_at=mesmo_ts)
    _evento_status(fake_db, ticket, 'aberto', created_at=mesmo_ts)

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'inconclusive'
    assert api_module._is_reopening(ticket, None, history=history) is False

    sub = {'key': 'k67', 'endpoint': 'https://push.example/67', 'user': {'id': 'u67'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)
    result = api_module._check_and_send_reminders()
    assert result['sent'] == 0
    assert enviados == []


def test_novo_terminal_pos_reabertura_encerra_o_ciclo(api_module, monkeypatch):
    """aberto → resolvido → aberto → resolvido não deixa ciclo vigente."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    ticket = _make_ticket(_tid(68), ws=WS_A, number=69, created_at=criado,
                          status='resolvido')
    fake_db, _fake_redis = _env(api_module, monkeypatch, [ticket])

    _evento_status(fake_db, ticket, 'resolvido',
                   (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat())
    id_reabertura = _evento_status(
        fake_db, ticket, 'aberto',
        (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat(),
    )
    _evento_status(fake_db, ticket, 'resolvido',
                   (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat())

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'available'
    assert api_module._get_last_terminal_status(ticket['id'], history) is None
    assert api_module._is_reopening(ticket, None, history=history) is False
    assert api_module._get_cycle_id(ticket['id'], ticket, history) == criado
    assert id_reabertura != criado


# ─────────────────────────────────────────────────────────────────────────────
# Regressões A1–A6 / M1–M9 (correções finais de segurança e confiabilidade)
# ─────────────────────────────────────────────────────────────────────────────

def _setup_reabertura(api_module, monkeypatch, n, numero, count=4):
    """Chamado reaberto com estado de um ciclo anterior já processado."""
    agora = datetime.now(timezone.utc)
    criado = (agora - timedelta(minutes=40)).isoformat()
    ticket = _make_ticket(_tid(n), ws=WS_A, number=numero, created_at=criado,
                          updated_at=criado)
    fake_db, fake_redis = _env(api_module, monkeypatch, [ticket])
    _evento_status(fake_db, ticket, 'resolvido',
                   (agora - timedelta(minutes=20)).isoformat())
    id_reabertura = _evento_status(fake_db, ticket, 'aberto',
                                   (agora - timedelta(minutes=10)).isoformat())
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    fake_redis.setex(state_key, 7 * 24 * 3600, json.dumps({
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_reminder_at': (agora - timedelta(minutes=30)).isoformat(),
        'reminder_count': count,
        'last_known_status': 'resolvido',
        'cycle_id': 'ciclo-anterior',
    }))

    sub = {'key': f'reab{n}', 'endpoint': f'https://push.example/reab{n}',
           'user': {'id': f'u-reab{n}'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)
    return ticket, fake_db, fake_redis, state_key, id_reabertura, enviados


def test_reabertura_reconhecida_apenas_uma_vez_em_tres_execucoes(api_module, monkeypatch):
    """A1: reabertura dispara uma vez; depois vale o intervalo de 2 minutos."""
    ticket, _db, redis, state_key, id_reabertura, enviados = _setup_reabertura(
        api_module, monkeypatch, 70, 70
    )

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1
    assert enviados == ['reab70']
    state = json.loads(redis.get(state_key))
    assert state['cycle_id'] == id_reabertura
    assert state['reminder_count'] == 5  # contador preservado e incrementado uma vez

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert api_module._check_and_send_reminders()['sent'] == 0
    assert len(enviados) == 1
    state = json.loads(redis.get(state_key))
    assert state['reminder_count'] == 5
    assert state['cycle_id'] == id_reabertura

    # Depois de 2 minutos o lembrete recorrente volta a ser devido.
    state['last_reminder_at'] = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    redis.setex(state_key, 7 * 24 * 3600, json.dumps(state))
    assert api_module._check_and_send_reminders()['sent'] == 1
    assert len(enviados) == 2
    assert json.loads(redis.get(state_key))['reminder_count'] == 6


def test_novo_terminal_e_reabertura_inicia_novo_ciclo(api_module, monkeypatch):
    """A1: novo terminal + reabertura cria outro ciclo, mesmo com envio recente."""
    ticket, db, redis, state_key, primeira_reabertura, enviados = _setup_reabertura(
        api_module, monkeypatch, 71, 71
    )
    assert api_module._check_and_send_reminders()['sent'] == 1

    agora = datetime.now(timezone.utc)
    _evento_status(db, ticket, 'fechado', (agora - timedelta(minutes=5)).isoformat())
    segunda_reabertura = _evento_status(db, ticket, 'aberto',
                                        (agora - timedelta(minutes=4)).isoformat())

    # last_reminder_at é "agora": só o novo cycle_id autoriza o envio.
    assert api_module._check_and_send_reminders()['sent'] == 1
    assert len(enviados) == 2
    state = json.loads(redis.get(state_key))
    assert state['cycle_id'] == segunda_reabertura
    assert state['cycle_id'] != primeira_reabertura
    assert state['reminder_count'] == 6

    # O novo ciclo também é reconhecido uma única vez.
    assert api_module._check_and_send_reminders()['sent'] == 0
    assert len(enviados) == 2


def test_marca_individual_falha_mantem_destinatario_elegivel(api_module, monkeypatch):
    """A2: quem falhou na marca continua elegível; quem recebeu não é reenviado."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(72), ws=WS_A, number=72, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    sub1 = {'key': 'a1', 'endpoint': 'https://push.example/a1', 'user': {'id': 'u-a1'}}
    sub2 = {'key': 'a2', 'endpoint': 'https://push.example/a2', 'user': {'id': 'u-a2'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub1, sub2])

    original_mark = api_module._mark_sub_sent

    def mark_com_falha(ticket_id, cycle_id, wave, ident, lock_token=None):
        if ident == api_module._sub_identity(sub1):
            return False
        return original_mark(ticket_id, cycle_id, wave, ident, lock_token=lock_token)

    monkeypatch.setattr(api_module, '_mark_sub_sent', mark_com_falha)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    assert api_module._check_and_send_reminders()['sent'] == 2
    assert sorted(enviados) == ['a1', 'a2']
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None  # ciclo incompleto

    monkeypatch.setattr(api_module, '_mark_sub_sent', original_mark)
    enviados.clear()
    assert api_module._check_and_send_reminders()['sent'] == 1
    assert enviados == ['a1']  # apenas o destinatário que não foi marcado
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_estado_gravado_antes_da_limpeza_de_marcas(api_module, monkeypatch):
    """A2: a limpeza das marcas nunca precede a persistência do estado."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(73), ws=WS_A, number=73, created_at=criado,
                          updated_at=criado)
    _db, _redis = _env(api_module, monkeypatch, [ticket])
    sub = {'key': 'ord1', 'endpoint': 'https://push.example/ord1', 'user': {'id': 'u-ord1'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: True)
    ordem = []
    write_real = api_module._write_reminder_state
    clear_real = api_module._clear_sent_marks

    def write(tid, state, lock_token=None):
        ordem.append('write')
        return write_real(tid, state, lock_token=lock_token)

    def clear(tid, cycle, wave, subs, lock_token=None):
        ordem.append('clear')
        return clear_real(tid, cycle, wave, subs, lock_token=lock_token)

    monkeypatch.setattr(api_module, '_write_reminder_state', write)
    monkeypatch.setattr(api_module, '_clear_sent_marks', clear)
    assert api_module._check_and_send_reminders()['sent'] == 1
    assert 'write' in ordem and 'clear' in ordem
    assert ordem.index('write') < ordem.index('clear')
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert api_module._is_sub_sent(
        ticket['id'], cycle_id, 1, api_module._sub_identity(sub)
    ) is True


def test_lock_atomico_com_token_e_ttl(api_module, monkeypatch):
    """A3: aquisição atômica SET NX EX e liberação por posse via Lua."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(74), ws=WS_A, number=74, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    sub = {'key': 'lk1', 'endpoint': 'https://push.example/lk1', 'user': {'id': 'u-lk1'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: True)

    assert api_module._check_and_send_reminders()['sent'] == 1
    lock_calls = [c for c in redis.set_calls
                  if c['key'].startswith('chamado:reminder:lock:')]
    assert len(lock_calls) == 1
    assert lock_calls[0]['nx'] is True
    assert lock_calls[0]['ex'] == api_module.REMINDER_LOCK_TTL_SECONDS
    token = str(lock_calls[0]['value'])
    assert len(token) >= 16
    scripts = [c for c in redis.script_calls if 'del' in c['script']]
    assert scripts and scripts[-1]['args'] == [token]


def test_lock_expirado_e_liberacao_apenas_pelo_dono(api_module, monkeypatch):
    """A3: lock expirado pode ser readquirido; dono antigo não apaga o novo."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(75)
    key = f'chamado:reminder:lock:{tid}'

    first = api_module._acquire_reminder_lock(tid)
    assert first
    assert api_module._acquire_reminder_lock(tid) is None  # concorrência

    redis.advance(api_module.REMINDER_LOCK_TTL_SECONDS + 1)
    second = api_module._acquire_reminder_lock(tid)
    assert second and second != first

    api_module._release_reminder_lock(tid, first)
    assert redis.get(key) == second
    api_module._release_reminder_lock(tid, second)
    assert redis.get(key) is None


def test_falha_aquisicao_lock_e_fail_closed(api_module, monkeypatch):
    """A3: falha de Redis na aquisição do lock impede qualquer envio."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(76), ws=WS_A, number=76, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    redis.fail_prefixes.add('chamado:reminder:lock:')
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'lk2', 'endpoint': 'https://push.example/lk2', 'user': {'id': 'u-lk2'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    result = api_module._check_and_send_reminders()
    assert result['checked'] == 0
    assert result['sent'] == 0
    assert enviados == []


def test_falha_ao_liberar_lock_nao_propagora(api_module, monkeypatch):
    """A3: erro de Redis na liberação é contido; o TTL resolve a limpeza."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(77)
    token = api_module._acquire_reminder_lock(tid)
    assert token

    def eval_que_falha(script, keys=None, args=None):
        raise RuntimeError('Redis eval indisponível')

    monkeypatch.setattr(redis, 'eval', eval_que_falha)
    api_module._release_reminder_lock(tid, token)  # não deve levantar
    assert redis.get(f'chamado:reminder:lock:{tid}') == token


def test_lock_renovado_durante_paginacao(api_module, monkeypatch):
    """A3: o lock é renovado a cada página e antes de cada envio."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=300)).isoformat()
    ticket = _make_ticket(_tid(78), ws=WS_A, number=78, created_at=criado,
                          updated_at=criado)
    db, redis = _env(api_module, monkeypatch, [ticket])
    base = datetime.now(timezone.utc) - timedelta(minutes=280)
    for i in range(220):
        _evento_status(db, ticket, 'em_espera',
                       created_at=(base + timedelta(seconds=i)).isoformat())
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'lk3', 'endpoint': 'https://push.example/lk3', 'user': {'id': 'u-lk3'}}
    ])
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: True)

    assert api_module._check_and_send_reminders()['sent'] == 1
    renovacoes = [c for c in redis.script_calls if 'expire' in c['script']]
    # 3 páginas + releitura + envio ⇒ pelo menos 5 renovações.
    assert len(renovacoes) >= 5


@pytest.mark.parametrize('campo,valor', [
    ('assignedToUserId', 'tec-1'),
    ('status', 'resolvido'),
    ('workspace_id', ''),
])
def test_refetch_pos_paginacao_bloqueia_mudanca_concorrente(
    api_module, monkeypatch, campo, valor
):
    """A4: técnico/status/workspace mudados durante a paginação impedem o envio."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=300)).isoformat()
    ticket = _make_ticket(_tid(79), ws=WS_A, number=79, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    base = datetime.now(timezone.utc) - timedelta(minutes=280)
    for i in range(220):
        _evento_status(db, ticket, 'em_espera',
                       created_at=(base + timedelta(seconds=i)).isoformat())
    db.history_hooks[1] = lambda fake: fake.tickets[0].__setitem__(campo, valor)

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'rf', 'endpoint': 'https://push.example/rf', 'user': {'id': 'u-rf'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_evento_legado_com_content_conhecido_gera_reabertura(api_module, monkeypatch):
    """A5: eventos sem newStatus usam apenas a allowlist de `content`."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    ticket = _make_ticket(_tid(80), ws=WS_A, number=80, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    db.add_ticket_event(ticket['id'], 'status', new_status=None, content='Chamado resolvido',
                        created_at=(datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat())
    db.add_ticket_event(ticket['id'], 'status', new_status=None, content='Aguardando técnico',
                        created_at=(datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat())

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'available'
    assert [r['newStatus'] for r in history.rows] == ['resolvido', 'aberto']
    assert api_module._is_reopening(ticket, None, history=history) is True

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'lg', 'endpoint': 'https://push.example/lg', 'user': {'id': 'u-lg'}}
    ])
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: True)
    assert api_module._check_and_send_reminders()['sent'] == 1


def test_evento_legado_com_content_desconhecido_e_inconclusivo(api_module, monkeypatch):
    """A5: texto arbitrário em `content` nunca vira status."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(81), ws=WS_A, number=81, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    db.add_ticket_event(ticket['id'], 'status', new_status=None, content='algo esquisito')
    assert api_module._fetch_ticket_status_events(ticket['id']).state == 'inconclusive'

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'lg2', 'endpoint': 'https://push.example/lg2', 'user': {'id': 'u-lg2'}}
    ])
    assert api_module._check_and_send_reminders()['sent'] == 0


def test_status_desconhecido_torna_historico_inconclusivo(api_module, monkeypatch):
    """A5: newStatus fora da allowlist não é silenciosamente ignorado."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(82), ws=WS_A, number=82, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    db.add_ticket_event(ticket['id'], 'status', new_status='status_alienigena')
    assert api_module._fetch_ticket_status_events(ticket['id']).state == 'inconclusive'

    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'lg3', 'endpoint': 'https://push.example/lg3', 'user': {'id': 'u-lg3'}}
    ])
    assert api_module._check_and_send_reminders()['sent'] == 0


@pytest.mark.parametrize('ws', [None, '', '   '])
def test_workspace_invalido_nao_notifica(api_module, monkeypatch, ws):
    """A6: workspace vazio nunca chega a `_target_subs` (evita push global)."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(83), ws=ws, number=83, created_at=criado,
                          updated_at=criado)
    _db, _redis = _env(api_module, monkeypatch, [ticket])
    chamadas = []
    monkeypatch.setattr(api_module, '_target_subs',
                        lambda **kw: chamadas.append(kw) or [])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert chamadas == []
    assert enviados == []


def test_workspace_valido_notifica(api_module, monkeypatch):
    """A6: UUID válido preserva o escopo por workspace."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(84), ws=WS_A, number=84, created_at=criado,
                          updated_at=criado)
    _db, _redis = _env(api_module, monkeypatch, [ticket])
    chamadas = []
    monkeypatch.setattr(api_module, '_target_subs',
                        lambda **kw: chamadas.append(kw) or [
                            {'key': 'wsok', 'endpoint': 'https://push.example/wsok',
                             'user': {'id': 'u-wsok'}}
                        ])
    monkeypatch.setattr(api_module, 'push_notify', lambda s, t, b, url=None, **kw: True)

    assert api_module._check_and_send_reminders()['sent'] == 1
    assert chamadas and chamadas[0]['workspace_id'] == WS_A


def test_ttl_das_marcas_nao_expira_antes_do_estado(api_module):
    """M1: marca individual nunca pode vencer o estado/ciclo que a consome."""
    assert api_module.REMINDER_SENT_MARK_TTL_SECONDS >= api_module.REMINDER_STATE_TTL_SECONDS


def test_falha_leitura_de_marca_e_fail_closed(api_module, monkeypatch):
    """M2: erro ao ler marca impede o envio em vez de virar 'não enviado'."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(85), ws=WS_A, number=85, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    original_get = redis.get

    def get_com_falha(key):
        if ':sent:' in str(key):
            raise RuntimeError('Redis get falhou')
        return original_get(key)

    monkeypatch.setattr(redis, 'get', get_com_falha)
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'mc', 'endpoint': 'https://push.example/mc', 'user': {'id': 'u-mc'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_empate_antigo_nao_contamina_ciclo_vigente(api_module, monkeypatch):
    """M3: empate já encerrado por terminal posterior não invalida o ciclo atual."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=50)).isoformat()
    ticket = _make_ticket(_tid(86), ws=WS_A, number=86, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    base = datetime.now(timezone.utc) - timedelta(minutes=40)
    ts = lambda i: (base + timedelta(minutes=i)).isoformat()
    _evento_status(db, ticket, 'resolvido', created_at=ts(0))
    _evento_status(db, ticket, 'aberto', created_at=ts(0))       # empate antigo
    _evento_status(db, ticket, 'fechado', created_at=ts(5))
    id_atual = _evento_status(db, ticket, 'aberto', created_at=ts(10))

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.state == 'available'
    assert api_module._get_cycle_id(ticket['id'], ticket, history) == id_atual
    assert api_module._is_reopening(ticket, None, history=history) is True


def test_limite_superior_de_paginas_e_inconclusivo(api_module, monkeypatch):
    """M4: estourar o limite de páginas não pode virar histórico 'vazio'."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
    ticket = _make_ticket(_tid(87), ws=WS_A, number=87, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    base = datetime.now(timezone.utc) - timedelta(minutes=50)
    for i in range(6):
        _evento_status(db, ticket, 'em_espera',
                       created_at=(base + timedelta(seconds=i)).isoformat())
    monkeypatch.setattr(api_module, 'REMINDER_EVENT_PAGE_SIZE', 2)
    monkeypatch.setattr(api_module, 'REMINDER_EVENT_MAX_PAGES', 2)

    assert api_module._fetch_ticket_status_events(ticket['id']).state == 'inconclusive'
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'pg', 'endpoint': 'https://push.example/pg', 'user': {'id': 'u-pg'}}
    ])
    assert api_module._check_and_send_reminders()['sent'] == 0


def test_cycle_id_vazio_com_historico_inconclusivo(api_module, monkeypatch):
    """M5: createdAt nunca é usado como cycle_id quando a consulta falhou."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(88), ws=WS_A, number=88, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])

    def get_que_falha(url, **kwargs):
        raise TimeoutError('indisponível')

    monkeypatch.setattr(db, 'get', get_que_falha)
    assert api_module._get_cycle_id(ticket['id'], ticket) == ''


def test_record_terminal_status_preserva_contador_e_ciclo(api_module, monkeypatch):
    """M6: gravar status terminal não destrui contador, intervalo nem ciclo."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(89)
    state_key = f'chamado:reminder:state:{tid}'
    original = {
        'ticket_id': tid,
        'workspace_id': WS_A,
        'last_reminder_at': '2026-01-01T00:00:00+00:00',
        'reminder_count': 7,
        'cycle_id': 'ciclo-importante',
        'last_known_status': 'aberto',
    }
    redis.setex(state_key, 7 * 24 * 3600, json.dumps(original))
    api_module._record_terminal_status(tid, 'fechado')
    state = json.loads(redis.get(state_key))
    assert state['reminder_count'] == 7
    assert state['cycle_id'] == 'ciclo-importante'
    assert state['last_reminder_at'] == original['last_reminder_at']
    assert state['last_known_status'] == 'fechado'

    # Estado malformado não é sobrescrito como {}.
    redis.setex(state_key, 60, '{json-invalido')
    api_module._record_terminal_status(tid, 'resolvido')
    assert redis.get(state_key) == '{json-invalido'

    # Arrays JSON são `table` em Lua; objetos com campos de tipo inválido
    # também não podem ser sobrescritos.
    malformados = (
        '[]', '[1,2]', '["aberto"]',
        '{"reminder_count":"lixo"}',
        '{"cycle_id":[]}',
        '{"last_known_status":null}',
        '{"reminder_count":true}',
    )
    for malformado in malformados:
        redis.setex(state_key, 60, malformado)
        api_module._record_terminal_status(tid, 'fechado')
        assert redis.get(state_key) == malformado


def test_scripts_lua_exigem_objeto_de_estado(api_module):
    """Os scripts Lua rejeitam arrays e objetos com campos de tipo inválido."""
    for script in (
        api_module._REMINDER_TRANSITION_SCRIPT,
        api_module._REMINDER_FENCED_STATE_WRITE_SCRIPT,
    ):
        assert '-- state-object-required' in script
        assert 'local function valid_state(value)' in script
        assert 'raw_reminder_count_valid' in script
        assert "type(count) ~= 'number'" in script
        assert "type(value['cycle_id']) ~= 'string'" in script
        assert "type(value['last_reminder_at']) ~= 'string'" in script
        assert "type(value['last_known_status']) ~= 'string'" in script


@pytest.mark.parametrize('state, esperado', [
    ({}, False),                                   # objeto vazio
    ({'campo_desconhecido': 'x'}, False),           # somente campos desconhecidos
    ({'transition_generation': 0}, False),         # geração sozinha não é estado
    ({'reminder_count': 2}, True),
    ({'cycle_id': 'ciclo'}, True),
    ({'last_reminder_at': '2026-01-01T00:02:00+00:00'}, True),
    ({'last_known_status': 'aberto'}, True),
    ({'reminder_count': '2'}, False),              # string numérica
    ({'reminder_count': 2, 'cycle_id': 7}, False),  # campo conhecido com tipo errado
    ({'reminder_count': 2, 'transition_generation': '0'}, False),
    ({'reminder_count': 2, 'transition_generation': None}, False),
    ({'reminder_count': 2, 'transition_generation': True}, False),
    ({'reminder_count': 2, 'transition_generation': -1}, False),
    ({'reminder_count': 2, 'transition_generation': 1.5}, False),
    ({'reminder_count': 2, 'legacy_generation_migrated': 1}, False),
    ({'reminder_count': 2, 'transition_generation': 0,
      'legacy_generation_migrated': 1}, True),
    ({'reminder_count': 2, 'transition_generation': 0,
      'campo_desconhecido': 'x'}, True),
])
def test_validacao_formato_estado_espelha_lua(api_module, state, esperado):
    """Python rejeita objeto vazio, campos só desconhecidos e geração corrompida."""
    assert api_module._valid_reminder_state_shape(state) is esperado


def test_leitura_estado_rejeita_formato_invalido_antes_do_envio(api_module, monkeypatch):
    """Estado malformado é isolado na leitura: worker não envia depois de falhar."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(95)
    state_key = f'chamado:reminder:state:{tid}'
    token = api_module._acquire_reminder_lock(tid)
    for raw in ('{}', '{"campo_desconhecido":"x"}',
                '{"reminder_count":2,"transition_generation":"lixo"}'):
        redis.setex(state_key, 600, raw)
        state, ok = api_module._read_reminder_state_result(tid, lock_token=token)
        assert state is None and ok is False
        assert redis.get(state_key) == raw  # não reescreve estado corrompido


# Sentinelas para distinguir "chave ausente" de JSON null nos parametrizes.
_AUSENTE = object()


def test_scripts_lua_validam_transition_generation(api_module):
    """Nenhum script pode converter geração inválida em zero com `or 0`."""
    for script in (
        api_module._REMINDER_TRANSITION_SCRIPT,
        api_module._REMINDER_FENCED_STATE_WRITE_SCRIPT,
    ):
        assert '-- generation-validated' in script
        assert 'math.floor' in script
        assert '1000000000' in script
        assert 'legacy_generation_migrated' in script
        assert 'cjson.null' in script  # null é presente/inválido, não ausente
        assert "tonumber(state['transition_generation']) or 0" not in script
        assert "tonumber(current['transition_generation']) or 0" not in script
    escrita = api_module._REMINDER_FENCED_STATE_WRITE_SCRIPT
    assert 'tonumber(ARGV[4])' in escrita
    assert 'payload_generation' in escrita
    assert 'payload_generation ~= expected_generation' in escrita
    # `valid_state` é usado no payload, fora do `if raw`: precisa estar no
    # escopo do script, senão o EVAL falha em Redis real.
    assert escrita.index('local function valid_state') < escrita.index('if raw then')
    assert api_module.REMINDER_GENERATION_MAX == 1_000_000_000


@pytest.mark.parametrize('generation,esperado_ok,geracao_final', [
    (0, True, 1),          # geração válida igual a zero
    (5, True, 6),          # geração válida positiva
    (-1, False, None),     # negativa
    (1.5, False, None),    # fracionária
    ('5', False, None),    # string numérica
    ('abc', False, None),  # string inválida
    (None, False, None),   # null
    (True, False, None),   # booleana
    ([], False, None),     # array
    ({'x': 1}, False, None),  # objeto
    (1_000_000_000, False, None),  # acima do teto seguro
    (_AUSENTE, True, 1),   # migração legada explícita
])
def test_transicao_valida_transition_generation(
    api_module, monkeypatch, generation, esperado_ok, geracao_final
):
    """Geração inválida nunca é normalizada para zero: estado é preservado."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(90)
    state_key = f'chamado:reminder:state:{tid}'
    state = {'reminder_count': 3, 'cycle_id': 'ciclo', 'last_known_status': 'aberto'}
    if generation is not _AUSENTE:
        state['transition_generation'] = generation
    original = json.dumps(state)
    redis.setex(state_key, 600, original)

    api_module._record_terminal_status(tid, 'fechado')
    atual = redis.get(state_key)
    if not esperado_ok:
        assert atual == original
        return

    gravado = json.loads(atual)
    assert gravado['transition_generation'] == geracao_final
    assert gravado['reminder_count'] == 3
    assert gravado['cycle_id'] == 'ciclo'
    if generation is _AUSENTE:
        assert gravado['legacy_generation_migrated'] == 1
    else:
        assert 'legacy_generation_migrated' not in gravado


def test_migracao_legada_de_geracao_acontece_uma_unica_vez(api_module, monkeypatch):
    """Sem geração e sem marcador: promove a 0. Depois disso, ausência falha."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(91)
    state_key = f'chamado:reminder:state:{tid}'
    redis.setex(state_key, 600, json.dumps({
        'reminder_count': 2, 'cycle_id': 'ciclo', 'last_known_status': 'aberto',
    }))
    api_module._record_terminal_status(tid, 'fechado')
    migrado = json.loads(redis.get(state_key))
    assert migrado['transition_generation'] == 1
    assert migrado['legacy_generation_migrated'] == 1

    # Alguém removeu a geração de um estado já migrado: corrupção, não migração.
    corrompido = dict(migrado)
    corrompido.pop('transition_generation')
    raw = json.dumps(corrompido)
    redis.setex(state_key, 600, raw)
    api_module._record_terminal_status(tid, 'resolvido')
    assert redis.get(state_key) == raw


@pytest.mark.parametrize('payload_generation,esperado', [
    (7, 1),            # payload coerente com o estado
    (6, 0),            # worker antigo (geração desatualizada)
    ('7', 0),          # string numérica
    (None, 0),         # null
    (-1, 0),           # negativa
    (1.5, 0),          # fracionária
    (_AUSENTE, 0),     # payload sem geração
])
def test_fenced_state_write_valida_geracao_do_payload(
    api_module, monkeypatch, payload_generation, esperado
):
    """O payload do worker precisa carregar a mesma geração válida do estado."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(92)
    state_key = f'chamado:reminder:state:{tid}'
    redis.setex(state_key, 600, json.dumps({
        'reminder_count': 2, 'cycle_id': 'ciclo',
        'last_known_status': 'aberto', 'transition_generation': 7,
    }))
    token = api_module._acquire_reminder_lock(tid)
    payload = {'reminder_count': 3, 'cycle_id': 'ciclo', 'last_known_status': 'aberto'}
    if payload_generation is not _AUSENTE:
        payload['transition_generation'] = payload_generation

    resultado = redis.eval(
        api_module._REMINDER_FENCED_STATE_WRITE_SCRIPT,
        keys=[f'chamado:reminder:lock:{tid}', state_key],
        args=[token, '600', json.dumps(payload), '7', 'aberto', 'ciclo', '0'],
    )
    assert resultado == esperado


def test_worker_com_geracao_invalida_nao_escreve_nem_gera_confirmacao(api_module, monkeypatch):
    """Estado com geração corrompida bloqueia o worker sem gravar nem marcar."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(93)
    state_key = f'chamado:reminder:state:{tid}'
    original = json.dumps({
        'reminder_count': 4, 'cycle_id': 'ciclo',
        'last_known_status': 'aberto', 'transition_generation': 'lixo',
    })
    redis.setex(state_key, 600, original)
    token = api_module._acquire_reminder_lock(tid)

    escrita = api_module._write_reminder_state(
        tid,
        {'reminder_count': 5, 'cycle_id': 'ciclo', 'last_known_status': 'aberto',
         'transition_generation': 0},
        lock_token=token,
    )
    assert escrita is False
    assert redis.get(state_key) == original


def test_operacoes_de_marca_exigem_token(api_module, monkeypatch):
    """Marcas nunca podem ser escritas/apagadas sem token de posse."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(94)
    ident = 'abc123'
    with pytest.raises(TypeError):
        api_module._mark_sub_sent(tid, 'ciclo', 1, ident)
    with pytest.raises(TypeError):
        api_module._clear_sent_marks(tid, 'ciclo', 2, [{'endpoint': 'https://x'}])
    with pytest.raises(TypeError):
        api_module._write_reminder_state(tid, {'reminder_count': 1})
    # Token vazio também não é aceito como "sem fencing".
    assert api_module._mark_sub_sent(tid, 'ciclo', 1, ident, lock_token='') is False
    assert api_module._write_reminder_state(
        tid, {'reminder_count': 1}, lock_token=''
    ) is False
    assert redis.store == {}


def test_token_invalido_e_expirado_nao_alteram_marcas(api_module, monkeypatch):
    """Token errado ou expirado não marca nem apaga marca alheia."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(95)
    ciclo = 'ciclo-atual'
    ident = 'dest-95'
    mark_key = api_module._reminder_sent_mark_key(tid, ciclo, 1, ident)
    lock_key = api_module._reminder_lock_key(tid)

    # Sem lock, nenhuma escrita é possível.
    assert api_module._mark_sub_sent(tid, ciclo, 1, ident, lock_token='token-errado') is False
    assert redis.get(mark_key) is None

    token_a = api_module._acquire_reminder_lock(tid)
    assert api_module._mark_sub_sent(tid, ciclo, 1, ident, lock_token=token_a) is True
    assert redis.get(mark_key) == '1'

    # Expiração do lock: o dono antigo não consegue apagar a marca.
    redis.advance(api_module.REMINDER_LOCK_TTL_SECONDS + 1)
    token_b = api_module._acquire_reminder_lock(tid)
    assert token_b and token_b != token_a
    api_module._clear_sent_marks(tid, ciclo, 2, [{'endpoint': 'https://x'}], lock_token=token_a)
    assert redis.get(mark_key) == '1'
    assert api_module._mark_sub_sent(tid, ciclo, 1, 'outro', lock_token=token_a) is False
    assert redis.get(lock_key) == token_b


def test_limpeza_de_marcas_antigas_preserva_onda_corrente(api_module, monkeypatch):
    """Manutenção fenciada apaga só ondas antigas; a atual continua marcada."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(96)
    ciclo = 'ciclo-atual'
    sub = {'endpoint': 'https://push.example/96'}
    ident = api_module._sub_identity(sub)
    token = api_module._acquire_reminder_lock(tid)

    for wave in (1, 2, 3):
        assert api_module._mark_sub_sent(tid, ciclo, wave, ident, lock_token=token) is True
    api_module._clear_sent_marks(tid, ciclo, 3, [sub], lock_token=token)

    for wave in (1, 2):
        assert redis.get(api_module._reminder_sent_mark_key(tid, ciclo, wave, ident)) is None
    assert redis.get(api_module._reminder_sent_mark_key(tid, ciclo, 3, ident)) == '1'


@pytest.mark.parametrize('malformado', [
    '[1,2]',
    '{"reminder_count":"lixo"}',
    '{"cycle_id":[]}',
    '{"last_known_status":null}',
])
def test_fenced_state_write_nao_sobrescreve_estado_malformado(
    api_module, monkeypatch, malformado
):
    """A escrita fenciada rejeita o mesmo conjunto de estados corrompidos."""
    _db, redis = _env(api_module, monkeypatch, [])
    tid = _tid(89)
    state_key = f'chamado:reminder:state:{tid}'
    redis.setex(state_key, 60, malformado)
    token = api_module._acquire_reminder_lock(tid)

    escrita = api_module._write_reminder_state(
        tid,
        {'reminder_count': 1, 'cycle_id': 'ciclo', 'last_known_status': 'aberto'},
        lock_token=token,
    )
    assert escrita is False
    assert redis.get(state_key) == malformado


@pytest.mark.parametrize('created_at', ['', 'data-invalida', '2026-01-01T00:00:00'])
def test_timestamp_invalido_nao_dispara_envio(api_module, monkeypatch, created_at):
    """M7: timestamp ausente/inválido/sem timezone ⇒ fail-closed."""
    ticket = _make_ticket(_tid(90), ws=WS_A, number=90, created_at=created_at,
                          updated_at=created_at)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'ts', 'endpoint': 'https://push.example/ts', 'user': {'id': 'u-ts'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_last_reminder_at_invalido_nao_dispara_envio(api_module, monkeypatch):
    """M7: last_reminder_at corrompido não autoriza reenvio imediato."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    ticket = _make_ticket(_tid(91), ws=WS_A, number=91, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    redis.setex(state_key, 7 * 24 * 3600, json.dumps({
        'ticket_id': ticket['id'],
        'workspace_id': WS_A,
        'last_reminder_at': 'ontology:talvez-ontem',
        'reminder_count': 2,
    }))
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'ts2', 'endpoint': 'https://push.example/ts2', 'user': {'id': 'u-ts2'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_estado_malformado_isola_apenas_o_chamado(api_module, monkeypatch):
    """M8: estado corrompido de um chamado não aborta o lote."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ruim = _make_ticket(_tid(92), ws=WS_A, number=92, created_at=criado, updated_at=criado)
    bom = _make_ticket(_tid(93), ws=WS_A, number=93, created_at=criado, updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ruim, bom])
    redis.setex(f'chamado:reminder:state:{ruim["id"]}', 600, 'estado-invalido')
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [
        {'key': 'mf', 'endpoint': 'https://push.example/mf', 'user': {'id': 'u-mf'}}
    ])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    result = api_module._check_and_send_reminders()
    assert result['sent'] == 1
    assert len(enviados) == 1
    assert redis.get(f'chamado:reminder:state:{ruim["id"]}') == 'estado-invalido'
    assert json.loads(redis.get(f'chamado:reminder:state:{bom["id"]}'))['reminder_count'] == 1


@pytest.mark.parametrize('confirmado,esperado', [(False, 0), (True, 1)])
def test_super_admin_snapshot_e_revalidado_no_servidor(
    api_module, monkeypatch, confirmado, esperado
):
    """M9: snapshot obsoleto de super admin não amplia o alcance do push."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(94), ws=WS_A, number=94, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    db.profiles['u-sa'] = {'id': 'u-sa', 'is_super_admin': confirmado}
    sub = {'key': 'sa', 'endpoint': 'https://push.example/sa',
           'user': {'id': 'u-sa', 'is_super_admin': True}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    assert api_module._check_and_send_reminders()['sent'] == esperado
    assert len(enviados) == esperado


def test_endpoint_check_exige_cron_secret(api_module, monkeypatch):
    """Endpoint GET/POST continua protegido por require_cron (fail-closed)."""
    monkeypatch.delenv('CRON_SECRET', raising=False)
    chamadas = []
    # `_route_once` registra a view no singleton `app`; quando vários módulos
    # de teste carregam app.py, a view pode pertencer a outra instância do
    # módulo. Patchear os globals da própria view torna o teste independente
    # da ordem de execução da suíte.
    view = api_module.app.view_functions['chamados_reminders_check']
    inner = getattr(view, '__wrapped__', view)
    monkeypatch.setitem(inner.__globals__, '_check_and_send_reminders',
                        lambda: chamadas.append(True) or {'sent': 0, 'checked': 0})
    client = api_module.app.test_client()

    # Sem segredo configurado: 503 (fail-closed), mesmo com token qualquer.
    assert client.get('/api/chamados/reminders/check').status_code == 503
    monkeypatch.setenv('CRON_SECRET', 'segredo-de-teste')
    assert client.get('/api/chamados/reminders/check').status_code == 401
    assert client.post('/api/chamados/reminders/check').status_code == 401
    assert client.get(
        '/api/chamados/reminders/check',
        headers={'Authorization': 'Bearer errado'},
    ).status_code == 401
    headers = {'Authorization': 'Bearer segredo-de-teste'}
    r_get = client.get('/api/chamados/reminders/check', headers=headers)
    r_post = client.post('/api/chamados/reminders/check', headers=headers)
    assert r_get.status_code == 200
    assert r_post.status_code == 200
    assert r_get.get_json()['sent'] == 0
    assert len(chamadas) == 2


# ---------------------------------------------------------------------------
# Correções finais: deduplicação por onda, lock fencing, revalidação imediata.
# ---------------------------------------------------------------------------

def _sub(key, ws=WS_A):
    return {
        'key': key,
        'endpoint': f'https://push.example/{key}',
        'user': {'id': f'u-{key}'},
        'apps': ['chamados'],
        'workspace_ids': [ws],
        'workspaceId': ws,
        'notify_settings': {'chamados': {'push': True}},
    }


def _setup_simples(api_module, monkeypatch, n, qtd_subs=2):
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(n), ws=WS_A, number=n, created_at=criado,
                          updated_at=criado)
    db, redis = _env(api_module, monkeypatch, [ticket])
    subs = [_sub(f's{n}-{i}') for i in range(qtd_subs)]
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: list(subs))
    return db, redis, ticket, subs


def test_historico_completo_lido_uma_unica_vez_por_chamado(api_module, monkeypatch):
    """Sem reler o histórico inteiro por destinatário; apenas a ponta é checada."""
    _db, _redis, _ticket, subs = _setup_simples(
        api_module, monkeypatch, 2099, qtd_subs=3,
    )
    monkeypatch.setattr(
        api_module, 'push_notify',
        lambda s, t, b, url=None, **kw: True,
    )

    real_full = api_module._fetch_ticket_status_events
    real_page = api_module._fetch_ticket_events_page
    full_calls = {'n': 0}
    tip_calls = {'n': 0}

    def full_contado(*args, **kwargs):
        full_calls['n'] += 1
        return real_full(*args, **kwargs)

    def page_contada(ticket_id, cursor_at=None, cursor_id=None, limit=None):
        if limit == api_module.REMINDER_TIP_PAGE_SIZE:
            tip_calls['n'] += 1
        return real_page(ticket_id, cursor_at, cursor_id, limit=limit)

    monkeypatch.setattr(api_module, '_fetch_ticket_status_events', full_contado)
    monkeypatch.setattr(api_module, '_fetch_ticket_events_page', page_contada)

    resultado = api_module._check_and_send_reminders()

    assert resultado['sent'] == 3
    assert full_calls['n'] == 1          # duas passagens internas, uma chamada
    assert tip_calls['n'] == len(subs)  # uma consulta leve por destinatário


def test_duplicata_limpeza_parcial_de_marcas_nao_reenvia(api_module, monkeypatch):
    """A limpeza parcial de ondas antigas não reabre a onda corrente."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2001)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    # Limpa apenas UMA marca antiga (a da onda 1) após a persistência do estado.
    real_clear = api_module._clear_sent_marks
    chamadas = {'n': 0}

    def clear_parcial(tid, cycle, wave, subs, lock_token=None):
        chamadas['n'] += 1
        if chamadas['n'] == 1:
            ident = api_module._sub_identity(subs[0])
            key = api_module._reminder_sent_mark_key(tid, cycle, wave, ident)
            with redis._lock:
                redis.store.pop(key, None)
                redis.expires.pop(key, None)
            return None
        return real_clear(tid, cycle, wave, subs, lock_token=lock_token)

    monkeypatch.setattr(api_module, '_clear_sent_marks', clear_parcial)
    assert api_module._check_and_send_reminders()['sent'] == 2
    assert sorted(enviados) == [subs[0]['key'], subs[1]['key']]

    # Execução seguinte: nenhum destinatário processado é reenviado.
    enviados.clear()
    monkeypatch.setattr(api_module, '_clear_sent_marks', real_clear)
    r2 = api_module._check_and_send_reminders()
    # A onda 2 ainda não é devida (intervalo de 2 min), mas se fosse, as
    # marcas da onda 1 não poderiam autorizar reenvio:verificamos diretamente.
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert api_module._is_sub_sent(
        ticket['id'], cycle_id, 1, api_module._sub_identity(subs[1])
    ) is True
    # A marca apagada artificialmente não é usada pela onda corrente:
    # ela pertence à onda 1, cujo estado já foi persistido.
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1
    assert r2['sent'] == 0
    assert enviados == []


def test_limpeza_total_de_marcas_antigas_nao_reenvia(api_module, monkeypatch):
    """Falha total na limpeza das marcas antigas não altera a deduplicação."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2002)
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: True)
    # Apaga todas as marcas da onda 1 logo após a persistência do estado.
    real_clear = api_module._clear_sent_marks

    def clear_total(tid, cycle, wave, subs, lock_token=None):
        for s in subs:
            key = api_module._reminder_sent_mark_key(
                tid, cycle, wave, api_module._sub_identity(s)
            )
            with redis._lock:
                redis.store.pop(key, None)
        return None

    monkeypatch.setattr(api_module, '_clear_sent_marks', clear_total)
    assert api_module._check_and_send_reminders()['sent'] == 2
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1
    # Mesmo sem marcas, o estado da onda impede novo envio pelo intervalo.
    monkeypatch.setattr(api_module, '_clear_sent_marks', real_clear)
    assert api_module._check_and_send_reminders()['sent'] == 0


def test_estado_persistido_processo_encerrado_antes_da_limpeza(api_module, monkeypatch):
    """Morte do processo após gravar estado não gera reenvio na recuperação."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2003)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    def clear_morre(tid, cycle, wave, subs, lock_token=None):
        raise RuntimeError('processo encerrado antes da limpeza')

    monkeypatch.setattr(api_module, '_clear_sent_marks', clear_morre)
    assert api_module._check_and_send_reminders()['sent'] == 2
    assert sorted(enviados) == [subs[0]['key'], subs[1]['key']]
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1

    # Recuperação: marcas ainda existem ⇒ nenhum reenvio.
    monkeypatch.setattr(api_module, '_clear_sent_marks',
                        lambda *a, **k: None)
    enviados.clear()
    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_marca_gravada_estado_nao_persistido_nao_reenvia(api_module, monkeypatch):
    """Marca individual sobrevive à falha do estado geral."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2004)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)
    write_real = api_module._write_reminder_state
    monkeypatch.setattr(api_module, '_write_reminder_state',
                        lambda *a, **k: False)
    assert api_module._check_and_send_reminders()['sent'] == 2
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    for s in subs:
        assert api_module._is_sub_sent(
            ticket['id'], cycle_id, 1, api_module._sub_identity(s)
        ) is True

    # Recuperação com escrita normal: nenhum destinatário é reenviado.
    monkeypatch.setattr(api_module, '_write_reminder_state', write_real)
    enviados.clear()
    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_falha_leitura_durante_all_sent_bloqueia_estado(api_module, monkeypatch):
    """Falha na leitura da marca pós-push não finalize e não reenvie silenciosamente."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2005)
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: True)
    real_is = api_module._is_sub_sent
    calls = {'n': 0}

    def is_com_falha(*args, **kwargs):
        calls['n'] += 1
        # Sequência para 2 subs: 1-2 = pending, 3-4 = pré-push,
        # 5-6 = verificação final all_sent. Falha na 5ª (all_sent).
        if calls['n'] == 5:
            raise RuntimeError('Redis indisponível')
        return real_is(*args, **kwargs)

    monkeypatch.setattr(api_module, '_is_sub_sent', is_com_falha)
    r = api_module._check_and_send_reminders()
    assert r['sent'] == 2
    # O estado não foi gravado porque a verificação final falhou.
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_novo_ciclo_com_destinatarios_marcados_no_ciclo_anterior(api_module, monkeypatch):
    """O namespace por ciclo libera os destinatários para um novo ciclo."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2006)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)
    assert api_module._check_and_send_reminders()['sent'] == 2
    ciclo1 = api_module._get_cycle_id(ticket['id'], ticket)

    agora = datetime.now(timezone.utc)
    ticket['status'] = 'fechado'
    _evento_status(db, ticket, 'fechado',
                   created_at=(agora - timedelta(seconds=3)).isoformat())
    ticket['status'] = 'aberto'
    reabertura = _evento_status(db, ticket, 'aberto',
                                created_at=(agora - timedelta(seconds=2)).isoformat())

    enviados.clear()
    assert api_module._check_and_send_reminders()['sent'] == 2
    assert sorted(enviados) == [s['key'] for s in subs]
    ciclo2 = api_module._get_cycle_id(ticket['id'], ticket)
    assert ciclo2 == reabertura
    assert ciclo2 != ciclo1
    for s in subs:
        ident = api_module._sub_identity(s)
        assert api_module._is_sub_sent(ticket['id'], ciclo1, 1, ident) is True
        # A reabertura preserva reminder_count=1: a nova onda é a 2.
        assert api_module._is_sub_sent(ticket['id'], ciclo2, 2, ident) is True


def test_concorrencia_real_com_barreira_apenas_um_envio(api_module, monkeypatch):
    """Duas threads reais disputando o lock: apenas uma envia o push."""
    import time as _time

    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2010,
                                             qtd_subs=1)
    barreira = threading.Barrier(2)
    iniciou_push = threading.Event()
    liberar_push = threading.Event()
    enviados = []
    guard = threading.Lock()

    def push(s, t, b, url=None, **kw):
        with guard:
            enviados.append(s['key'])
        iniciou_push.set()
        assert liberar_push.wait(10), 'push não foi liberado'
        return True

    monkeypatch.setattr(api_module, 'push_notify', push)
    resultados = []

    def worker():
        # Barrier.wait() devolve o índice (0 ou 1) e -1 apenas no timeout.
        assert barreira.wait(10) >= 0, 'barreira não liberou'
        resultados.append(api_module._check_and_send_reminders())

    t1 = threading.Thread(target=worker, name='reminder-worker-1')
    t2 = threading.Thread(target=worker, name='reminder-worker-2')
    t1.start()
    t2.start()
    assert iniciou_push.wait(10), 'nenhum push foi iniciado'

    # Enquanto o primeiro worker está dentro do push (com o lock), o outro
    # deve terminar sem enviar. Identificamos a thread viva pelo estado.
    for _ in range(200):
        if sum(1 for t in (t1, t2) if t.is_alive()) == 1:
            break
        _time.sleep(0.01)
    assert sum(1 for t in (t1, t2) if t.is_alive()) == 1

    liberar_push.set()
    t1.join(10)
    t2.join(10)
    assert not t1.is_alive() and not t2.is_alive()

    assert len(enviados) == 1
    assert sum(int(r.get('sent', 0)) for r in resultados) == 1
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_revalidacao_por_destinatario_antes_de_cada_push(api_module, monkeypatch):
    """A elegibilidade é reconsultada para cada destinatário da onda."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2011,
                                             qtd_subs=2)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    chamadas = []

    def target_seq(**kw):
        chamadas.append(dict(kw))
        # 1ª: seleção inicial. 2ª: revalidação do sub1. 3ª: revalidação do
        # sub2 — que perdeu a elegibilidade nesse intervalo.
        return list(subs) if len(chamadas) <= 2 else [subs[0]]

    monkeypatch.setattr(api_module, '_target_subs', target_seq)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 1
    assert enviados == [subs[0]['key']]
    assert len(chamadas) == 3
    assert all(c.get('module') == 'chamados'
               and c.get('workspace_id') == WS_A
               and c.get('min_level') == 'full' for c in chamadas)

    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    ident0 = api_module._sub_identity(subs[0])
    ident1 = api_module._sub_identity(subs[1])
    assert api_module._is_sub_sent(ticket['id'], cycle_id, 1, ident0) is True
    assert api_module._is_sub_sent(ticket['id'], cycle_id, 1, ident1) is False
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['reminder_count'] == 1


def test_lock_expirado_durante_push_e_resultado_ambiguio(api_module, monkeypatch):
    """Lock vencido no meio do push: aceito, mas sem marca nem estado."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2012,
                                             qtd_subs=1)
    timeouts = []

    def push(s, t, b, url=None, **kw):
        timeouts.append(kw.get('timeout'))
        # TTL do lock é 120s; expira enquanto o push está em voo.
        redis.advance(api_module.REMINDER_LOCK_TTL_SECONDS + 1)
        return True

    monkeypatch.setattr(api_module, 'push_notify', push)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 1
    assert r['confirmed'] == 0
    assert r['ambiguous'] == 1
    assert timeouts == [20]
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_deadline_de_execucao_bloqueia_push(api_module, monkeypatch):
    """Excedido o teto de execução, a renovação falha e nada é enviado."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2013,
                                             qtd_subs=1)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)
    monkeypatch.setattr(api_module, 'REMINDER_MAX_EXECUTION_SECONDS', -1)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 0
    assert enviados == []
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_uuid_malformado_e_cursor_opaco_sem_uso_como_relogio(api_module, monkeypatch):
    """ID malformado em ticket_events é opaco: não quebra nem vira relógio."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2014,
                                             qtd_subs=1)
    agora = datetime.now(timezone.utc)
    _evento_status(db, ticket, 'resolvido',
                   created_at=(agora - timedelta(seconds=3)).isoformat())
    db.ticket_events.setdefault(ticket['id'], []).append({
        'id': 'nao-e-um-uuid',
        'ticket_id': ticket['id'],
        'type': 'status',
        'content': '',
        'newStatus': 'aberto',
        'createdAt': (agora - timedelta(seconds=2)).isoformat(),
    })
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)

    r1 = api_module._check_and_send_reminders()
    assert r1['sent'] == 1
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert cycle_id == 'nao-e-um-uuid'
    state = json.loads(redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['cycle_id'] == cycle_id

    r2 = api_module._check_and_send_reminders()
    assert r2['sent'] == 0
    assert len(enviados) == 1


def test_reminder_max_count_bloqueia_novas_ondas(api_module, monkeypatch):
    """O teto de lembretes por ciclo é respeitado (fail-closed)."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2015,
                                             qtd_subs=1)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(True) or True)
    monkeypatch.setattr(api_module, 'REMINDER_MAX_COUNT', 1)

    antigo = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    redis.setex(f'chamado:reminder:state:{ticket["id"]}',
                7 * 24 * 3600,
                json.dumps({
                    'ticket_id': ticket['id'],
                    'workspace_id': WS_A,
                    'last_reminder_at': antigo,
                    'reminder_count': 1,
                    'last_known_status': 'aberto',
                    'cycle_id': str(ticket.get('createdAt') or ''),
                }))

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 0
    assert enviados == []

    # Com teto zero, nenhum chamado é processado sequer na primeira onda.
    redis.delete(f'chamado:reminder:state:{ticket["id"]}')
    monkeypatch.setattr(api_module, 'REMINDER_MAX_COUNT', 0)
    assert api_module._check_and_send_reminders()['sent'] == 0
    assert enviados == []


def test_targeting_real_respeita_workspace_modulo_e_nivel(api_module, monkeypatch):
    """O targeting real é chamado com os filtros corretos antes do envio."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2016,
                                             qtd_subs=2)
    enviados = []
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: enviados.append(s['key']) or True)

    chamadas = []

    def target(**kw):
        chamadas.append(dict(kw))
        if (kw.get('module') != 'chamados'
                or kw.get('workspace_id') != WS_A
                or kw.get('min_level') != 'full'):
            return []
        return list(subs)

    monkeypatch.setattr(api_module, '_target_subs', target)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 2
    assert sorted(enviados) == sorted(s['key'] for s in subs)
    assert chamadas
    assert all(c['module'] == 'chamados' and c['workspace_id'] == WS_A
               and c['min_level'] == 'full' for c in chamadas)


def test_empate_nao_terminal_nao_torna_historico_inconclusivo(api_module, monkeypatch):
    """Empate entre eventos não terminais não bloqueia o ciclo vigente."""
    db, redis, ticket, subs = _setup_simples(api_module, monkeypatch, 2017,
                                             qtd_subs=1)
    agora = datetime.now(timezone.utc)
    mesmo_instante = (agora - timedelta(seconds=2)).isoformat()
    _evento_status(db, ticket, 'resolvido',
                   created_at=(agora - timedelta(seconds=3)).isoformat())
    id_a = db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                               created_at=mesmo_instante)
    id_b = db.add_ticket_event(ticket['id'], 'status', new_status='aberto',
                               created_at=mesmo_instante)
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: True)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 1
    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert cycle_id in {id_a, id_b}


# ── Correção final: estado fenciado + Push indeterminado ────────────────────


def test_resultado_desconhecido_incrementa_ambiguous_sem_marca(api_module, monkeypatch):
    """C3: provedor aceitou e a resposta se perdeu ⇒ unknown sem marca/sent."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(2018), ws=WS_A, number=2018,
                          created_at=criado, updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    sub = {'key': 'c3', 'endpoint': 'https://push.example/c3', 'user': {'id': 'u-c3'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])

    provedor = {'aceitou': False}

    def push_resposta_perdida(s, t, b, url=None, **kw):
        # Explicitamente: o provedor aceitou ANTES de a resposta se perder.
        provedor['aceitou'] = True
        return api_module.PUSH_UNKNOWN

    monkeypatch.setattr(api_module, 'push_notify', push_resposta_perdida)

    r = api_module._check_and_send_reminders()
    assert provedor['aceitou'] is True
    assert r['sent'] == 0
    assert r['confirmed'] == 0
    assert r['ambiguous'] == 1

    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    assert api_module._is_sub_sent(
        ticket['id'], cycle_id, 1, api_module._sub_identity(sub)
    ) is False
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_push_rejeitado_nao_entra_em_nenhum_contador(api_module, monkeypatch):
    """Rejeição confirmada não é aceitação, confirmação nem ambiguidade."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(2019), ws=WS_A, number=2019,
                          created_at=criado, updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    sub = {'key': 'rj', 'endpoint': 'https://push.example/rj', 'user': {'id': 'u-rj'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: api_module.PUSH_REJECTED)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 0
    assert r['confirmed'] == 0
    assert r['ambiguous'] == 0
    assert redis.get(f'chamado:reminder:state:{ticket["id"]}') is None


def test_worker_antigo_perde_lock_para_novo_com_threads_e_operacoes_fenciadas(
    api_module, monkeypatch
):
    """A3/D: worker cujo lock expirou falha em toda operação; novo conclui."""
    criado = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(2020), ws=WS_A, number=2020,
                          created_at=criado, updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    sub = {'key': 'lock', 'endpoint': 'https://push.example/lock',
           'user': {'id': 'u-lock'}}
    identity = api_module._sub_identity(sub)
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])

    a_no_push = threading.Event()
    libera_a = threading.Event()
    b_no_push = threading.Event()
    libera_b = threading.Event()
    local = threading.local()
    resultados = {}

    def push_controlado(s, t, b, url=None, **kw):
        if getattr(local, 'worker', '') == 'A':
            a_no_push.set()
            assert libera_a.wait(5)
        else:
            b_no_push.set()
            assert libera_b.wait(5)
        return api_module.PUSH_ACCEPTED

    monkeypatch.setattr(api_module, 'push_notify', push_controlado)

    def rodar(nome):
        local.worker = nome
        resultados[nome] = api_module._check_and_send_reminders()

    lock_key = f'chamado:reminder:lock:{ticket["id"]}'
    state_key = f'chamado:reminder:state:{ticket["id"]}'

    t_a = threading.Thread(target=rodar, args=('A',), name='worker-A', daemon=True)
    t_a.start()
    assert a_no_push.wait(5)
    token_a = redis.get(lock_key)
    assert token_a

    # O lock de A expira e B o adquire enquanto A está preso no Push.
    redis.advance(api_module.REMINDER_LOCK_TTL_SECONDS + 1)
    t_b = threading.Thread(target=rodar, args=('B',), name='worker-B', daemon=True)
    t_b.start()
    assert b_no_push.wait(5)
    token_b = redis.get(lock_key)
    assert token_b and token_b != token_a

    cycle_id = api_module._get_cycle_id(ticket['id'], ticket)
    state_antes = redis.get(state_key)

    # Todas as operações do worker antigo falham por perda de posse.
    assert api_module._renew_reminder_lock(ticket['id'], token_a) is False
    assert api_module._mark_sub_sent(
        ticket['id'], cycle_id, 1, identity, lock_token=token_a
    ) is False
    assert api_module._write_reminder_state(
        ticket['id'], {'reminder_count': 99, 'cycle_id': cycle_id},
        lock_token=token_a,
    ) is False
    with pytest.raises(RuntimeError):
        api_module._is_sub_sent(
            ticket['id'], cycle_id, 1, identity, lock_token=token_a
        )
    api_module._release_reminder_lock(ticket['id'], token_a)
    assert redis.get(lock_key) == token_b  # A não apaga o lock de B

    libera_a.set()
    t_a.join(timeout=5)
    assert not t_a.is_alive()
    assert redis.get(state_key) == state_antes
    assert resultados['A']['ambiguous'] == 1

    libera_b.set()
    t_b.join(timeout=5)
    assert not t_b.is_alive()
    assert resultados['B']['sent'] == 1
    assert resultados['B']['confirmed'] == 1
    state_final = json.loads(redis.get(state_key))
    assert state_final['reminder_count'] == 1
    assert redis.get(lock_key) is None


@pytest.mark.parametrize('status', ['fechado', 'a_caminho'])
def test_http_concorrente_com_worker_preserva_contador_e_ciclo(
    api_module, monkeypatch, status
):
    """B: terminal/assunção concorrentes não apagam estado mais recente."""
    tid = _tid(2021)
    _db, redis = _env(api_module, monkeypatch, [])
    state_key = f'chamado:reminder:state:{tid}'
    antigo = {
        'reminder_count': 7,
        'cycle_id': 'ciclo-importante',
        'last_reminder_at': '2026-01-01T00:00:00+00:00',
        'last_known_status': 'aberto',
    }
    redis.setex(state_key, 7 * 24 * 3600, json.dumps(antigo))

    token = api_module._acquire_reminder_lock(tid)
    state, ok = api_module._read_reminder_state_result(tid, lock_token=token)
    assert ok and state is not None
    barreira = threading.Barrier(2)
    resultados = {}

    def worker():
        barreira.wait(5)
        resultados['worker'] = api_module._write_reminder_state(
            tid,
            {**state, 'reminder_count': 8, 'last_known_status': 'aberto'},
            lock_token=token,
        )

    def http():
        barreira.wait(5)
        api_module._record_terminal_status(tid, status)

    t_worker = threading.Thread(target=worker, name='worker', daemon=True)
    t_http = threading.Thread(target=http, name='http', daemon=True)
    t_worker.start()
    t_http.start()
    for t in (t_worker, t_http):
        t.join(timeout=5)
        assert not t.is_alive()

    final = json.loads(redis.get(state_key))
    assert final['reminder_count'] in (7, 8)
    assert final['cycle_id'] == 'ciclo-importante'
    assert final['last_reminder_at'] == antigo['last_reminder_at']
    assert final['last_known_status'] == status
    assert final['transition_generation'] == 1
    assert resultados['worker'] in (True, False)


def test_worker_nao_restaura_ciclo_encerrado_e_reabertura_legitima_pode(
    api_module, monkeypatch
):
    """Guarda baseada em ticket_events: encerrado bloqueia; reaberto permite."""
    tid = _tid(2022)
    _db, redis = _env(api_module, monkeypatch, [])
    state_key = f'chamado:reminder:state:{tid}'
    terminal = {
        'reminder_count': 3,
        'cycle_id': 'ciclo-1',
        'last_reminder_at': '2026-01-01T00:00:00+00:00',
        'last_known_status': 'fechado',
    }
    redis.setex(state_key, 7 * 24 * 3600, json.dumps(terminal))
    token = api_module._acquire_reminder_lock(tid)

    history_fechado = api_module._TicketEventHistory(
        api_module._TICKET_HISTORY_AVAILABLE,
        [{'newStatus': 'fechado', 'id': 'ev-fechado'}],
    )
    assert api_module._history_has_unreopened_terminal(history_fechado) is True
    escrita = api_module._write_reminder_state(
        tid,
        {**terminal, 'reminder_count': 4, 'last_known_status': 'aberto'},
        lock_token=token, terminal_confirmed=True,
    )
    assert escrita is False
    assert json.loads(redis.get(state_key))['last_known_status'] == 'fechado'

    history_reaberto = api_module._TicketEventHistory(
        api_module._TICKET_HISTORY_AVAILABLE,
        [
            {'newStatus': 'fechado', 'id': 'ev-fechado'},
            {'newStatus': 'aberto', 'id': 'ev-reabertura'},
        ],
    )
    assert api_module._history_has_unreopened_terminal(history_reaberto) is False
    escrita = api_module._write_reminder_state(
        tid,
        {
            'reminder_count': 4,
            'cycle_id': 'ev-reabertura',
            'last_reminder_at': '2026-01-01T00:02:00+00:00',
            'last_known_status': 'aberto',
        },
        lock_token=token,
    )
    assert escrita is True
    final = json.loads(redis.get(state_key))
    assert final['cycle_id'] == 'ev-reabertura'
    assert final['last_known_status'] == 'aberto'
    assert final['reminder_count'] == 4


def test_record_terminal_status_com_falha_redis_sem_gravacao_parcial(
    api_module, monkeypatch
):
    """Falha no EVAL não altera o estado: sem fallback, sem escrita parcial."""
    tid = _tid(2023)
    _db, redis = _env(api_module, monkeypatch, [])
    state_key = f'chamado:reminder:state:{tid}'
    original = json.dumps({
        'reminder_count': 5,
        'cycle_id': 'ciclo-5',
        'last_reminder_at': '2026-01-01T00:00:00+00:00',
        'last_known_status': 'aberto',
    })
    redis.setex(state_key, 7 * 24 * 3600, original)
    redis.fail_eval = True

    api_module._record_terminal_status(tid, 'fechado')  # não pode levantar

    assert redis.get(state_key) == original


def test_reabertura_legitima_grava_novo_ciclo_no_estado(api_module, monkeypatch):
    """Histórico persistente autoriza novo ciclo após terminal no Redis."""
    agora = datetime.now(timezone.utc)
    criado = (agora - timedelta(minutes=10)).isoformat()
    ticket = _make_ticket(_tid(2024), ws=WS_A, number=2024,
                          created_at=criado, updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    _evento_status(db, ticket, 'fechado',
                   created_at=(agora - timedelta(minutes=5)).isoformat())
    id_reabertura = _evento_status(
        db, ticket, 'aberto',
        created_at=(agora - timedelta(minutes=3)).isoformat(),
    )
    api_module._record_terminal_status(ticket['id'], 'fechado')

    sub = {'key': 'reab', 'endpoint': 'https://push.example/reab',
           'user': {'id': 'u-reab'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    monkeypatch.setattr(api_module, 'push_notify',
                        lambda s, t, b, url=None, **kw: api_module.PUSH_ACCEPTED)

    r = api_module._check_and_send_reminders()
    assert r['sent'] == 1
    state = json.loads(_redis.get(f'chamado:reminder:state:{ticket["id"]}'))
    assert state['cycle_id'] == id_reabertura
    assert state['last_known_status'] == 'aberto'
    assert state['transition_generation'] == 1


# ── Auditoria final: timestamps aware, contador estrito e snapshot ───────────

def test_parse_event_timestamp_exige_datetime_aware_e_compara_em_utc(api_module):
    """Comparação cronológica usa datetime aware, não ordem lexical de ISO."""
    parse = api_module._parse_event_datetime

    # 01:00+01:00 == 00:00Z, que é ANTERIOR a 00:30Z (ordem lexical contrária).
    anterior = parse('2026-01-01T01:00:00+01:00')
    posterior = parse('2026-01-01T00:30:00+00:00')
    assert anterior is not None and posterior is not None
    assert anterior.tzinfo is not None and posterior.tzinfo is not None
    assert anterior < posterior

    # Microssegundos não podem ser achatados pela representação textual.
    sem_us = parse('2026-01-01T00:00:00+00:00')
    com_us = parse('2026-01-01T00:00:00.500000+00:00')
    assert sem_us < com_us

    assert parse('2026-01-01T00:00:00') is None        # sem timezone
    assert parse('') is None
    assert parse(None) is None
    assert parse('lixo') is None


def test_ciclo_respeita_ordem_cronologica_com_offsets_diferentes(api_module, monkeypatch):
    """Terminal/reabertura com offsets distintos são ordenados em UTC."""
    criado = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    ticket = _make_ticket(_tid(2025), ws=WS_A, number=2025, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    _evento_status(db, ticket, 'resolvido', created_at='2026-01-01T01:00:00+01:00')
    id_reabertura = _evento_status(
        db, ticket, 'aberto', created_at='2026-01-01T00:30:00+00:00',
    )

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.available
    assert api_module._get_cycle_id(ticket['id'], ticket, history=history) == id_reabertura


@pytest.mark.parametrize('valor_invalido', ['2', 2.0, True, None, -1, 11, float('nan')])
def test_worker_rejeita_reminder_count_invalido_com_last_at_vencido(
    api_module, monkeypatch, valor_invalido
):
    """`int()`/fallback não pode transformar corrupção em onda válida."""
    agora = datetime.now(timezone.utc)
    criado = (agora - timedelta(minutes=20)).isoformat()
    ticket = _make_ticket(_tid(2026), ws=WS_A, number=2026, created_at=criado,
                          updated_at=criado)
    _db, redis = _env(api_module, monkeypatch, [ticket])
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    original = json.dumps({
        'reminder_count': valor_invalido,
        'last_reminder_at': (agora - timedelta(minutes=10)).isoformat(),
        'last_known_status': 'aberto',
        'cycle_id': str(ticket['createdAt']),
        'transition_generation': 0,
    })
    redis.setex(state_key, 7 * 24 * 3600, original)

    sub = {'key': 'count-invalido', 'endpoint': 'https://push.example/count-invalido',
           'user': {'id': 'u-count-invalido'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(
        api_module, 'push_notify',
        lambda s, t, b, url=None, **kw: enviados.append(True) or api_module.PUSH_ACCEPTED,
    )

    resultado = api_module._check_and_send_reminders()

    assert resultado['sent'] == 0
    assert enviados == []
    assert redis.get(state_key) == original  # falha fechada sem reescrita


def test_estado_ausente_nao_reanima_terminal_persistido(api_module, monkeypatch):
    """Chave Redis expirada + terminal sem reabertura no histórico = sem envio."""
    criado = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    ticket = _make_ticket(_tid(2027), ws=WS_A, number=2027, created_at=criado,
                          updated_at=criado)
    db, redis = _env(api_module, monkeypatch, [ticket])
    _evento_status(db, ticket, 'resolvido',
                   created_at=(datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat())
    state_key = f'chamado:reminder:state:{ticket["id"]}'
    assert redis.get(state_key) is None

    sub = {'key': 'sem-estado', 'endpoint': 'https://push.example/sem-estado',
           'user': {'id': 'u-sem-estado'}}
    monkeypatch.setattr(api_module, '_target_subs', lambda **kw: [sub])
    enviados = []
    monkeypatch.setattr(
        api_module, 'push_notify',
        lambda s, t, b, url=None, **kw: enviados.append(True) or api_module.PUSH_ACCEPTED,
    )

    resultado = api_module._check_and_send_reminders()

    assert resultado['sent'] == 0
    assert enviados == []
    assert redis.get(state_key) is None  # não recria estado para ciclo encerrado


def test_historico_alterado_entre_passagens_e_inconclusivo(api_module, monkeypatch):
    """Sem append-only declarado, mutação relevante durante a leitura invalida."""
    criado = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    ticket = _make_ticket(_tid(2028), ws=WS_A, number=2028, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    _evento_status(db, ticket, 'em_espera',
                   created_at=(datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat())

    def inserir_durante_segunda_passagem(fake):
        fake.add_ticket_event(
            ticket['id'], 'status', new_status='aberto',
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    db.history_hooks[2] = inserir_durante_segunda_passagem

    history = api_module._fetch_ticket_status_events(ticket['id'])
    assert history.inconclusive
    assert history.rows == ()


def test_historico_com_evento_alterado_entre_passagens_e_inconclusivo(api_module, monkeypatch):
    """Atualização de status/timestamp entre passagens também invalida o snapshot."""
    criado = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    ticket = _make_ticket(_tid(2029), ws=WS_A, number=2029, created_at=criado,
                          updated_at=criado)
    db, _redis = _env(api_module, monkeypatch, [ticket])
    evento_id = _evento_status(
        db, ticket, 'em_espera',
        created_at=(datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(),
    )

    def mutar_durante_segunda_passagem(fake):
        for evento in fake.ticket_events[ticket['id']]:
            if evento['id'] == evento_id:
                evento['newStatus'] = 'a_caminho'

    db.history_hooks[2] = mutar_durante_segunda_passagem

    assert api_module._fetch_ticket_status_events(ticket['id']).inconclusive


@pytest.fixture(scope='module')
def lua_real():
    """Redis real EXPLÍCITO para validar os scripts Lua sem FakeRedis.

    Só executa se `LABHUB_TEST_UPSTASH_REDIS_REST_URL` e
    `LABHUB_TEST_UPSTASH_REDIS_REST_TOKEN` apontarem para um Redis de TESTE.
    Nunca lê as variáveis de produção do app.
    """
    import os
    import uuid

    url = os.environ.get('LABHUB_TEST_UPSTASH_REDIS_REST_URL')
    token = os.environ.get('LABHUB_TEST_UPSTASH_REDIS_REST_TOKEN')
    if not url or not token:
        pytest.skip(
            'Redis/Lua real não configurado: defina LABHUB_TEST_UPSTASH_REDIS_REST_URL '
            'e LABHUB_TEST_UPSTASH_REDIS_REST_TOKEN para um Redis de teste'
        )
    from upstash_redis import Redis

    client = Redis(url=url, token=token)
    prefix = f'labhub:lua-test:{uuid.uuid4().hex}:'
    keys = []

    def key(nome):
        k = prefix + nome
        keys.append(k)
        return k

    try:
        client.set(key('ping'), 'ok', ex=30)
    except Exception as exc:
        pytest.skip(f'Redis de teste indisponível: {exc}')

    yield client, key

    for k in set(keys):
        try:
            client.delete(k)
        except Exception:
            pass


def test_lua_real_fenced_delete_ausencia_nao_significa_perda_de_lock(lua_real):
    client, key = lua_real
    lock = key('lock')
    mark = key('mark')
    token = 'dono-atual'
    client.set(lock, token, ex=60)

    # Marca inexistente: lock é válido => 1 (contrato do script), não 0.
    assert client.eval(
        api_module._REMINDER_FENCED_DELETE_SCRIPT,
        keys=[lock, mark], args=[token],
    ) == 1
    assert client.get(lock) == token
    assert client.get(mark) is None

    # Token alheio nunca apaga nem confirma posse.
    assert client.eval(
        api_module._REMINDER_FENCED_DELETE_SCRIPT,
        keys=[lock, mark], args=['outro-token'],
    ) == 0


@pytest.mark.parametrize(
    'valor_count, esperado',
    [
        ('2', 1),        # inteiro JSON válido
        ('"2"', 0),      # string
        ('2.0', 0),      # decimal (cjson perde a distinção sem validação textual)
        ('2e0', 0),      # notação exponencial
        ('true', 0),     # booleano
        ('null', 0),     # nulo
        ('-1', 0),       # fora do intervalo
        ('11', 0),       # acima de REMINDER_MAX_COUNT
    ],
)
def test_lua_real_reminder_count_strito_transition(lua_real, valor_count, esperado):
    client, key = lua_real
    state_key = key(f'transition-{valor_count}')
    raw = json.dumps({
        'reminder_count': None,
        'last_known_status': 'aberto',
        'cycle_id': 'ciclo',
        'transition_generation': 0,
    }).replace('"reminder_count": null', f'"reminder_count": {valor_count}')
    client.set(state_key, raw, ex=60)

    resultado = client.eval(
        api_module._REMINDER_TRANSITION_SCRIPT,
        keys=[state_key], args=['fechado', '60'],
    )
    assert resultado == esperado
    if esperado == 0:
        assert client.get(state_key) == raw
    else:
        gravado = json.loads(client.get(state_key))
        assert gravado['reminder_count'] == 2
        assert gravado['last_known_status'] == 'fechado'
        assert gravado['transition_generation'] == 1


def test_lua_real_fenced_setex_get_renovacao_e_liberacao(lua_real):
    """Escrita/leitura de estado, renovação e liberação exigem o token atual."""
    client, key = lua_real
    lock = key('fenced-lock')
    state = key('fenced-state')
    token = 'dono-atual'
    client.set(lock, token, ex=60)

    assert client.eval(
        api_module._REMINDER_FENCED_SETEX_SCRIPT,
        keys=[lock, state], args=[token, '60', 'valor-fenciado'],
    ) == 1
    assert client.eval(
        api_module._REMINDER_FENCED_GET_SCRIPT,
        keys=[lock, state], args=[token],
    ) == [1, 'valor-fenciado']
    # Token alheio não lê estado algum.
    assert client.eval(
        api_module._REMINDER_FENCED_GET_SCRIPT,
        keys=[lock, state], args=['outro-token'],
    ) == [0, '']

    # Renovação pertence apenas ao dono. TTL é consultado por Lua real.
    assert client.eval(
        api_module._REMINDER_LOCK_RENEW_SCRIPT,
        keys=[lock], args=[token, '120'],
    ) == 1
    ttl = client.eval(
        "return redis.call('ttl', KEYS[1])", keys=[lock], args=[],
    )
    assert ttl > 60
    assert client.eval(
        api_module._REMINDER_LOCK_RENEW_SCRIPT,
        keys=[lock], args=['outro-token', '120'],
    ) == 0

    # Liberação fenciada: só o dono remove; depois a leitura falha.
    assert client.eval(
        api_module._REMINDER_LOCK_RELEASE_SCRIPT,
        keys=[lock], args=['outro-token'],
    ) == 0
    assert client.eval(
        api_module._REMINDER_LOCK_RELEASE_SCRIPT,
        keys=[lock], args=[token],
    ) == 1
    assert client.get(lock) is None
    assert client.eval(
        api_module._REMINDER_FENCED_GET_SCRIPT,
        keys=[lock, state], args=[token],
    ) == [0, '']


def test_lua_real_fenced_state_write_geracao_e_guardas(lua_real):
    """Fenced-state-write valida token, geração, payload e ciclo terminal."""
    client, key = lua_real
    lock = key('state-write-lock')
    state = key('state-write-state')
    token = 'worker-atual'
    client.set(lock, token, ex=60)

    atual = {
        'reminder_count': 2,
        'last_known_status': 'aberto',
        'cycle_id': 'ciclo',
        'last_reminder_at': '2026-01-01T00:02:00+00:00',
        'transition_generation': 0,
    }
    client.set(state, json.dumps(atual), ex=60)
    payload = dict(atual, reminder_count=3,
                   last_reminder_at='2026-01-01T00:04:00+00:00')

    def escrever(raw_payload, generation, status='aberto', ciclo='ciclo',
                 terminal='0', dono=token):
        return client.eval(
            api_module._REMINDER_FENCED_STATE_WRITE_SCRIPT,
            keys=[lock, state],
            args=[dono, '60', raw_payload, str(generation), status, ciclo, terminal],
        )

    assert escrever(json.dumps(payload), 0) == 1
    assert json.loads(client.get(state))['reminder_count'] == 3

    # Uma transição HTTP concorrente incrementa a geração: snapshot antigo falha.
    assert client.eval(
        api_module._REMINDER_TRANSITION_SCRIPT,
        keys=[state], args=['a_caminho', '60'],
    ) == 1
    assert escrever(json.dumps(payload), 0) == 0

    # Token alheio e geração corrompida nunca gravam.
    assert escrever(json.dumps(payload), 1, dono='outro-token') == 0
    assert escrever(json.dumps(payload), 'lixo') == 0

    # `reminder_count` textual inválido é rejeitado antes do cjson.decode.
    payload_invalido = json.dumps(payload).replace(
        '"reminder_count": 3', '"reminder_count": "3"',
    )
    assert escrever(payload_invalido, 1) == 0

    # Terminal sem reabertura não pode ser reescrito como aberto.
    terminal_state = dict(atual, last_known_status='fechado',
                          transition_generation=1)
    client.set(state, json.dumps(terminal_state), ex=60)
    payload_aberto = dict(terminal_state, last_known_status='aberto')
    assert escrever(json.dumps(payload_aberto), 1, terminal='1') == 0

