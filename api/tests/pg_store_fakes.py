"""Fakes reutilizáveis da API do ``pg_store`` sobre estados Redis-like.

Os testes de Push já têm fakes que simulam ``smembers``/``sadd``/``set``/``eval``
com TTL e token. Este mixin expõe esses mesmos estados através dos métodos do
store PostgreSQL (``push_subs_*``, ``chamado_subs_*``, ``dedup_*``), permitindo
que as assertions antigas — concorrência, TTL, fencing, isolamento por ticket —
continuem válidas sem depender de Redis real nem de Supabase real.

É um helper exclusivo de teste: não é importado pelo código de produção.
"""

import json
import threading


def _as_sub(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode('utf-8')
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _dumps(sub):
    return json.dumps(sub, ensure_ascii=False)


class PgStoreFakeMixin:
    """Implementa a linguagem do ``pg_store`` sobre um fake Redis-like.

    Requer que a classe concreta ofereça ``smembers``, ``sadd``, ``delete`` e
    (para dedup) ``get``/``set``/``setex``/``store``/``expires``/``now``. Os
    métodos opcionais ``srem``/``expire``/``removed`` são usados quando presentes
    para preservar as asserções históricas dos testes.
    """

    def _pg_lock(self):
        """Lock do fake (alguns fakes legados não definem ``_lock``)."""
        lock = getattr(self, '_lock', None)
        if lock is None:
            lock = threading.RLock()
            self._lock = lock
        return lock

    def _pg_purge(self, key):
        purge = getattr(self, '_purge', None)
        if callable(purge):
            purge(key)

    # ── Inscrições globais de Push ─────────────────────────────────────────

    def push_subs_list(self):
        return [parsed for parsed in (_as_sub(v) for v in self.smembers('push:subscribers'))
                if parsed is not None]

    def push_subs_save(self, payload):
        """Mesma semântica da RPC: dedupe por endpoint e substitui o payload."""
        endpoint = str((payload or {}).get('endpoint') or '')
        others = [s for s in self.push_subs_list() if s.get('endpoint') != endpoint]
        self.delete('push:subscribers')
        for sub in others + [payload]:
            self.sadd('push:subscribers', _dumps(sub))

    def push_subs_remove(self, endpoint):
        """Remove por endpoint (aceita também o JSON serializado, legado)."""
        target = str(endpoint)
        for raw in list(self.smembers('push:subscribers')):
            sub = _as_sub(raw)
            if raw == target or (sub and str(sub.get('endpoint') or '') == target):
                remover = getattr(self, 'srem', None)
                if callable(remover):
                    remover('push:subscribers', raw)
                else:
                    self.delete('push:subscribers')

    def push_subs_expire(self, endpoint, seconds):
        expire = getattr(self, 'expire', None)
        if callable(expire):
            expire('push:subscribers', int(seconds))
        self.push_subs_expire_calls.append((str(endpoint), int(seconds)))

    # ── Inscrições anônimas por chamado ────────────────────────────────────

    def chamado_subs_list(self, ticket_id):
        key = f'push:chamado:{ticket_id}'
        return [parsed for parsed in (_as_sub(v) for v in self.smembers(key))
                if parsed is not None]

    def chamado_subs_save(self, ticket_id, subs):
        """Espelha a RPC: substitui o ticket e limita a 10 dispositivos."""
        key = f'push:chamado:{ticket_id}'
        self._pg_fake_save_context = True
        try:
            self.delete(key)
            for sub in list(subs or [])[:10]:
                self.sadd(key, _dumps(sub))
        finally:
            self._pg_fake_save_context = False
        self.chamado_subs_save_calls.append((str(ticket_id), [
            _as_sub(s) or s for s in list(subs or [])[:10]
        ]))

    def chamado_subs_expire(self, ticket_id, seconds):
        key = f'push:chamado:{ticket_id}'
        expire = getattr(self, 'expire', None)
        if callable(expire):
            # Evita que o `expire` legado do fake registre a mesma chamada.
            self._pg_fake_expire_context = True
            try:
                expire(key, int(seconds))
            finally:
                self._pg_fake_expire_context = False
        self.chamado_subs_expire_calls.append((str(ticket_id), int(seconds)))

    # ── Dedup individual ───────────────────────────────────────────────────

    def dedup_state(self, key):
        """Contrato do pg_store: ``(estado, token)``.

        A leitura passa por ``get`` para que fakes que simulam falha de leitura
        continuem exercitando o caminho fail-closed do app.
        """
        raw = self.get(key)
        if raw is None:
            return 'absent', None
        value = str(raw)
        if value == '1':
            return 'attempted', None
        if ':' not in value:
            return 'unknown', None
        state, token = value.split(':', 1)
        if not token:
            return 'unknown', None
        if state in ('reserved', 'accepted'):
            return state, token
        return 'unknown', None

    def dedup_reserve(self, key, token, ttl):
        """Equivale a ``SET NX EX`` — delega ao ``set`` do fake (barreiras)."""
        claimed = self.set(key, f'reserved:{token}', ex=int(ttl), nx=True)
        return bool(claimed)

    def dedup_confirm(self, key, token):
        """Confirma somente a reserva própria, preservando o TTL restante."""
        with self._pg_lock():
            if getattr(self, 'fail_confirm', False):
                raise RuntimeError('pg_store fake: confirm indisponível')
            self._pg_purge(key)
            raw = self.store.get(key)
            if raw is None:
                return False
            value = str(raw)
            if ':' not in value:
                return False
            state, current = value.split(':', 1)
            if state != 'reserved' or current != str(token):
                return False
            remaining = self.ttl(key)
            if remaining <= 0:
                remaining = 3600
            self.setex(key, remaining, f'accepted:{token}')
            return True

    def dedup_release(self, key, token):
        """Libera somente a reserva própria — nunca uma marca alheia/aceita."""
        with self._pg_lock():
            if getattr(self, 'fail_release', False):
                raise RuntimeError('pg_store fake: release indisponível')
            self._pg_purge(key)
            raw = self.store.get(key)
            if raw is None:
                return False
            value = str(raw)
            if ':' not in value:
                return False
            state, current = value.split(':', 1)
            if state != 'reserved' or current != str(token):
                return False
            existed = self.store.pop(key, None) is not None
            self.expires.pop(key, None)
            return existed

    # ── Registros de chamadas (para assertions dos testes) ─────────────────

    @property
    def chamado_subs_save_calls(self):
        if not hasattr(self, '_chamado_subs_save_calls'):
            self._chamado_subs_save_calls = []
        return self._chamado_subs_save_calls

    @property
    def chamado_subs_expire_calls(self):
        if not hasattr(self, '_chamado_subs_expire_calls'):
            self._chamado_subs_expire_calls = []
        return self._chamado_subs_expire_calls

    @property
    def push_subs_expire_calls(self):
        if not hasattr(self, '_push_subs_expire_calls'):
            self._push_subs_expire_calls = []
        return self._push_subs_expire_calls
