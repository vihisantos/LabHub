"""Acesso PostgreSQL (Supabase) para lembretes de chamados e Push.

Este módulo concentra TODAS as chamadas RPC usadas pelo motor de lembretes e
pelo subsistema de Push. Ele substitui as chaves Redis (`chamado:reminder:*`,
`push:chamado:*`, `push:subscribers`, `push:sent:*`) e os scripts Lua por
transações PostgreSQL com advisory locks, `FOR UPDATE` e fencing por token.

Não há cliente Redis aqui. Configuração ausente de Supabase significa
fail-closed: as operações levantam :class:`PostgresError` e os callers decidem
como degradar (pular o chamado, não confirmar dedup, etc.).
"""

import json
import os

import requests

_SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
_SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

_DEFAULT_TIMEOUT = 10


class PostgresError(RuntimeError):
    """Falha de configuração, transporte ou RPC do PostgreSQL."""


def is_configured() -> bool:
    return bool(_SUPABASE_URL and _SUPABASE_SERVICE_KEY)


def _headers() -> dict:
    return {
        'apikey': _SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }


def _rpc(name: str, params: dict | None = None, timeout: int | None = None):
    """Executa `public.<name>` via PostgREST e devolve o corpo interpretado.

    Erros HTTP e de transporte levantam :class:`PostgresError` — nunca retornam
    um valor que possa ser confundido com "sem estado" ou "não marcado".
    """
    if not is_configured():
        raise PostgresError('Supabase não configurado para o store PostgreSQL')
    url = f'{_SUPABASE_URL}/rest/v1/rpc/{name}'
    try:
        response = requests.post(
            url,
            headers=_headers(),
            data=json.dumps(params or {}, ensure_ascii=False),
            timeout=timeout or _DEFAULT_TIMEOUT,
        )
    except Exception as exc:
        raise PostgresError(f'falha de transporte ao chamar {name}: {exc}') from exc

    if not response.ok:
        raise PostgresError(
            f'RPC {name} falhou (HTTP {response.status_code}): {response.text[:200]}'
        )
    text = (response.text or '').strip()
    if not text:
        return None
    try:
        return response.json()
    except ValueError:
        return text


def _as_bool(result) -> bool:
    if isinstance(result, bool):
        return result
    if isinstance(result, (int, float)):
        return bool(result)
    if isinstance(result, str):
        return result.strip().lower() in ('true', '1', 't')
    return False


class PostgresStore:
    """Store PostgreSQL com a mesma linguagem de alto nível dos antigos Lua."""

    # ── Lembretes ─────────────────────────────────────────────────────────

    def reminder_acquire(self, ticket_id, workspace_id, token, lock_seconds):
        return _as_bool(_rpc('chamado_reminder_acquire', {
            'p_ticket_id': str(ticket_id),
            # workspace_id é nullable em chamados_tickets; nunca transformar
            # None na string 'None' (quebraria o cast para uuid no PostgREST).
            'p_workspace_id': str(workspace_id) if workspace_id else None,
            'p_token': str(token),
            'p_lock_seconds': int(lock_seconds),
        }))

    def reminder_renew(self, ticket_id, token, lock_seconds):
        return _as_bool(_rpc('chamado_reminder_renew', {
            'p_ticket_id': str(ticket_id),
            'p_token': str(token),
            'p_lock_seconds': int(lock_seconds),
        }))

    def reminder_release(self, ticket_id, token):
        return _as_bool(_rpc('chamado_reminder_release', {
            'p_ticket_id': str(ticket_id),
            'p_token': str(token),
        }))

    def reminder_read(self, ticket_id, token=None):
        """Devolve o envelope `{ok, state}` da RPC.

        `ok=False` significa perda de lock/falha de leitura e deve ser tratado
        como inconclusivo pelo chamador.
        """
        result = _rpc('chamado_reminder_read', {
            'p_ticket_id': str(ticket_id),
            'p_token': str(token) if token else None,
        })
        if not isinstance(result, dict) or 'ok' not in result:
            raise PostgresError('resposta inválida de chamado_reminder_read')
        return result

    def reminder_write(self, ticket_id, token, expected_generation, state,
                       terminal_confirmed=False):
        return _as_bool(_rpc('chamado_reminder_write', {
            'p_ticket_id': str(ticket_id),
            'p_token': str(token),
            'p_expected_generation': int(expected_generation),
            'p_state': state,
            'p_terminal_confirmed': bool(terminal_confirmed),
        }))

    def reminder_mark_sent(self, ticket_id, cycle_id, wave, identity, token):
        return _as_bool(_rpc('chamado_reminder_mark_sent', {
            'p_ticket_id': str(ticket_id),
            'p_cycle_id': str(cycle_id),
            'p_wave': int(wave),
            'p_identity': str(identity),
            'p_token': str(token),
        }))

    def reminder_is_marked(self, ticket_id, cycle_id, wave, identity, token=None):
        result = _rpc('chamado_reminder_is_marked', {
            'p_ticket_id': str(ticket_id),
            'p_cycle_id': str(cycle_id),
            'p_wave': int(wave),
            'p_identity': str(identity),
            'p_token': str(token) if token else None,
        })
        if not isinstance(result, dict) or 'ok' not in result:
            raise PostgresError('resposta inválida de chamado_reminder_is_marked')
        return result

    def reminder_clear_marks(self, ticket_id, cycle_id, wave, identities, token):
        _rpc('chamado_reminder_clear_marks', {
            'p_ticket_id': str(ticket_id),
            'p_cycle_id': str(cycle_id),
            'p_wave': int(wave),
            'p_identities': list(identities),
            'p_token': str(token),
        })

    def reminder_transition(self, ticket_id, status):
        result = _rpc('chamado_reminder_transition', {
            'p_ticket_id': str(ticket_id),
            'p_status': str(status),
        })
        if result is None:
            return None
        try:
            return int(result)
        except (TypeError, ValueError) as exc:
            raise PostgresError('geração de transição inválida no PostgreSQL') from exc

    def reminder_cleanup(self):
        return _rpc('chamado_reminder_cleanup')

    # ── Inscrições de Push ─────────────────────────────────────────────────

    def push_subs_list(self):
        result = _rpc('push_subs_list') or []
        if not isinstance(result, list):
            raise PostgresError('resposta inválida de push_subs_list')
        return result

    def push_subs_save(self, payload):
        _rpc('push_subs_save', {'p_payload': payload})

    def push_subs_remove(self, endpoint):
        _rpc('push_subs_remove', {'p_endpoint': str(endpoint)})

    def push_subs_expire(self, endpoint, seconds):
        _rpc('push_subs_expire', {
            'p_endpoint': str(endpoint),
            'p_seconds': int(seconds),
        })

    def chamado_subs_list(self, ticket_id):
        result = _rpc('chamado_subs_list', {'p_ticket_id': str(ticket_id)}) or []
        if not isinstance(result, list):
            raise PostgresError('resposta inválida de chamado_subs_list')
        return result

    def chamado_subs_save(self, ticket_id, subs):
        _rpc('chamado_subs_save', {
            'p_ticket_id': str(ticket_id),
            'p_subs': list(subs),
        })

    def chamado_subs_expire(self, ticket_id, seconds):
        _rpc('chamado_subs_expire', {
            'p_ticket_id': str(ticket_id),
            'p_seconds': int(seconds),
        })

    # ── Dedup individual de Push ──────────────────────────────────────────

    def dedup_state(self, key):
        """Devolve `(estado, token)` no mesmo contrato do antigo parser Lua."""
        state = _rpc('push_dedup_state', {'p_key': str(key)})
        if state in ('reserved', 'accepted', 'attempted'):
            return state, None
        return 'absent' if state == 'absent' else 'unknown', None

    def dedup_reserve(self, key, token, ttl):
        return _as_bool(_rpc('push_dedup_reserve', {
            'p_key': str(key),
            'p_token': str(token),
            'p_ttl': int(ttl),
        }))

    def dedup_confirm(self, key, token):
        return _as_bool(_rpc('push_dedup_confirm', {
            'p_key': str(key),
            'p_token': str(token),
        }))

    def dedup_release(self, key, token):
        return _as_bool(_rpc('push_dedup_release', {
            'p_key': str(key),
            'p_token': str(token),
        }))

    def dedup_cleanup(self):
        return _rpc('push_dedup_cleanup')


store = PostgresStore()

# Aliases explícitos: lembretes, inscrições e dedup usam o MESMO store, mas
# nomes diferentes ajudam a leitura e permitem substituição em testes.
reminder_store = store
push_store = store
dedup_store = store
