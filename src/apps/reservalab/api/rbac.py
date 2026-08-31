"""
RBAC 2.0 backend enforcement engine (Etapa 3).

Single source of truth: the Supabase RBAC tables (service_role) —
  memberships, roles, role_permissions, membership_overrides.
This module only ENFORCES; it never defines roles, actions or permissions.
The authoritative list of Actions lives in
docs/architecture/rbac2.0-actions-catalog.md (source of truth).

Resolution order (deterministic, from the RBAC 2.0 spec):
  1. super_admin ⇒ ALLOW          (global bypass, preserved)
  2. não membro ⇒ DENY            (scope=workspace)
  3. role permission ⇒ base
  4. override.deny ⇒ DENY         (overrides role)
  5. override.allow ⇒ ALLOW       (overrides deny)
  6. nenhuma permissão ⇒ DENY     (default deny)

Fail-closed: any resolve error, missing/unknown table, or missing
workspace context ⇒ DENY. Authorization can never become fail-open.

Rollout: feature flag ``RBAC_2_ENABLED``. When disabled (default), the
``require_action`` decorator is a no-op and the legacy authorization path
is preserved. When enabled, enforcement is active. This gives a safe,
flip-of-a-switch rollout with legacy fallback.
"""

import functools
import os
from datetime import datetime, timezone

from flask import g, jsonify

import requests

from auth import (
    _auth_error,
    _forbidden,
    _SUPABASE_SERVICE_KEY,
    _SUPABASE_URL,
)


def rbac_enabled() -> bool:
    """Return True when RBAC 2.0 backend enforcement is active."""
    val = os.environ.get('RBAC_2_ENABLED', '0').strip().lower()
    return val in ('1', 'true', 'yes', 'on')


def _supabase_headers():
    return {
        'apikey': _SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
    }


# ── Resolver ─────────────────────────────────────────────────────────────────

def _query(table: str, params: dict):
    """Run a service_role GET against an RBAC table (REST)."""
    return requests.get(
        f'{_SUPABASE_URL}/rest/v1/{table}',
        params=params,
        headers=_supabase_headers(),
        timeout=5,
    )


def _fetch_membership(profile_id: str, workspace_id: str):
    """Return the active membership row for (profile, workspace) or None."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        resp = _query(
            'memberships',
            {
                'profile_id': f'eq.{profile_id}',
                'workspace_id': f'eq.{workspace_id}',
                'select': 'id,role_id,status',
            },
        )
        if not resp.ok:
            return None
        rows = resp.json() or []
        if not rows:
            return None
        return rows[0]
    except Exception:
        return None


def _fetch_role_permissions(role_id: str, scope: str = 'workspace'):
    """Return the set of allowed action names for a role (base), filtered to
    the requested scope.

    Note: ``role_permissions`` (migration 036) has NO ``effect`` column — rows
    are grants by (role_id, action, scope). Only actions where the row scope
    matches the requested scope are counted (role permission => base). The
    ``scope`` filter is exact on the real scope values ('workspace' | 'global'
    | 'self'); anything else yields no base permission (deny-by-default).
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return set()
    try:
        resp = _query(
            'role_permissions',
            {
                'role_id': f'eq.{role_id}',
                'select': 'action,scope',
            },
        )
        if not resp.ok:
            return set()
        rows = resp.json() or []
        allowed = set()
        for row in rows:
            row_scope = str(row.get('scope') or 'workspace').strip()
            if row_scope != str(scope).strip():
                continue
            action = str(row.get('action') or '').strip()
            if action:
                allowed.add(action)
        return allowed
    except Exception:
        return set()


def _fetch_overrides(membership_id: str):
    """Return per-action overrides for a membership: {action: 'allow'|'deny'}."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return {}
    try:
        resp = _query(
            'membership_overrides',
            {
                'membership_id': f'eq.{membership_id}',
                'select': 'action,effect',
            },
        )
        if not resp.ok:
            return {}
        rows = resp.json() or []
        overrides = {}
        for row in rows:
            if row.get('effect') in ('allow', 'deny') and row.get('action'):
                overrides[str(row['action']).strip()] = row['effect']
        return overrides
    except Exception:
        return {}


def rbac_can(profile, workspace_id, action: str, scope: str = 'workspace') -> bool:
    """Resolve whether ``profile`` may perform ``action`` in ``scope``.

    Deterministic order (see module docstring). Returns False on any
    unresolved/error path (fail-closed).
    """
    if not profile:
        return False

    # 1. Super admin ⇒ global bypass (preserved, no regression).
    if profile.get('is_super_admin'):
        return True

    action = str(action).strip()
    if not action:
        return False

    scope = str(scope or 'workspace').strip()

    # Global (platform admin) actions: only super admin by default.
    # Etapa 1 does not define a platform-level role row; keep fail-closed.
    if scope == 'global':
        return False

    # scope == 'workspace' (or 'self'): both require a workspace context to
    # resolve the membership that carries the role. Missing workspace ⇒ DENY.
    if not workspace_id:
        return False

    profile_id = str(profile.get('id') or '')
    if not profile_id:
        # Cannot resolve membership without an id.
        return False

    # 2. Membership lookup; não membro ⇒ DENY.
    membership = _fetch_membership(profile_id, workspace_id)
    if not membership or membership.get('status') != 'active':
        return False

    role_id = membership.get('role_id')
    membership_id = membership.get('id')

    # 3. Base from role permissions, filtered by the requested scope.
    base_allowed = False
    if role_id:
        base_allowed = action in _fetch_role_permissions(role_id, scope)

    # 4/5. Overrides (deny wins over role; allow wins over deny).
    override_effect = None
    if membership_id:
        override_effect = _fetch_overrides(membership_id).get(action)

    if override_effect == 'deny':
        return False
    if override_effect == 'allow':
        return True
    # 6. No permission ⇒ DENY.
    return base_allowed


# ── Audit ─────────────────────────────────────────────────────────────────────

def record_rbac_audit(
    actor_id,
    actor_is_super,
    action,
    workspace_id,
    scope,
    effect,
    outcome,
    resource_type=None,
    resource_id=None,
    meta=None,
):
    """Best-effort append into ``rbac_audit_logs`` (service_role).

    The authorization decision is already made before this runs; a failure
    to record the audit NEVER changes the decision and never grants access
    (it can never turn a DENY into an ALLOW). Errors are swallowed and logged
    only to the application logger to keep audit as a side-channel.
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return
    try:
        payload = {
            'actor_id': actor_id,
            'actor_is_super': bool(actor_is_super),
            'action': action,
            'workspace_id': workspace_id,
            'scope': scope,
            'effect': effect,
            'outcome': outcome,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        if resource_type is not None:
            payload['resource_type'] = resource_type
        if resource_id is not None:
            payload['resource_id'] = resource_id
        if meta is not None:
            payload['meta'] = meta
        requests.post(
            f'{_SUPABASE_URL}/rest/v1/rbac_audit_logs',
            headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
            json=payload,
            timeout=5,
        )
    except Exception:
        # Never block or alter an authorization decision.
        pass


# ── Decorator ────────────────────────────────────────────────────────────────

def require_action(action: str, scope: str = 'workspace'):
    """Decorator factory: enforce RBAC for ``action`` in ``scope``.

    Must be used together with (after) @require_auth so that g.user is set.
    When ``RBAC_2_ENABLED`` is off, this is a no-op (legacy behavior).

    - Sem autenticação → 401
    - Sem permissão → 403 ("Permissão insuficiente" — safe message)
    - Permissão → executa a rota
    """
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            if not rbac_enabled():
                return f(*args, **kwargs)

            user = getattr(g, 'user', None)
            workspace_id = getattr(g, 'workspace_id', None)

            if not user:
                return _auth_error('Authentication required')

            result = rbac_can(user, workspace_id, action, scope)

            record_rbac_audit(
                actor_id=user.get('id'),
                actor_is_super=user.get('is_super_admin'),
                action=action,
                workspace_id=workspace_id if scope != 'global' else None,
                scope=scope,
                effect='allow' if result else 'deny',
                # outcome follows the rbac_audit_logs CHECK constraint
                # (effect: allow|deny decision; outcome: success|denied result).
                outcome='success' if result else 'denied',
            )

            if not result:
                return _forbidden('Permissão insuficiente')
            return f(*args, **kwargs)
        return wrapper
    return decorator
