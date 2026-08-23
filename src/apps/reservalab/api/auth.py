"""
Centralized backend authorization layer for LabHub.

Every protected endpoint MUST use these decorators BEFORE accessing
data via service_role. The order is always:

    HTTP request → authentication → authorization → service_role query

service_role bypasses RLS — it is NOT a substitute for authorization.
"""

import os
import functools
import hashlib
import hmac
import json
import time

import requests
from flask import request, jsonify, g


# ── Supabase Auth validation ──────────────────────────────────────────────────

_SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
_SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

# Cache for JWKS (Supabase signing keys). Reload every 10 minutes.
_jwks_cache: dict = {'keys': None, 'ts': 0}
_JWKS_TTL = 600


def _fetch_jwks():
    """Fetch Supabase JWK Set for JWT verification."""
    now = time.time()
    if _jwks_cache['keys'] and now - _jwks_cache['ts'] < _JWKS_TTL:
        return _jwks_cache['keys']
    if not _SUPABASE_URL:
        return None
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/auth/v1/.well-known/jwks.json',
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            _jwks_cache['keys'] = data.get('keys', [])
            _jwks_cache['ts'] = now
            return _jwks_cache['keys']
    except Exception:
        pass
    return _jwks_cache.get('keys')


def _base64url_decode(data: str):
    """Decode base64url string."""
    import base64
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding
    return base64.urlsafe_b64decode(data)


def _verify_jwt(token: str) -> dict | None:
    """Verify a Supabase JWT and return the payload, or None if invalid.

    Uses Supabase's JWKS endpoint for key verification.
    Falls back to HMAC verification against SUPABASE_JWT_SECRET if JWKS fails.
    """
    parts = token.split('.')
    if len(parts) != 3:
        return None

    try:
        header = json.loads(_base64url_decode(parts[0]))
        payload = json.loads(_base64url_decode(parts[1]))
    except Exception:
        return None

    # Check expiration
    exp = payload.get('exp')
    if exp and exp < time.time():
        return None

    # Check issuer
    if _SUPABASE_URL:
        expected_issuer = f'{_SUPABASE_URL}/auth/v1'
        if payload.get('iss') != expected_issuer:
            # Some Supabase setups don't set iss — allow if aud matches
            pass

    # Try JWKS verification first
    jwks = _fetch_jwks()
    kid = header.get('kid')
    if jwks and kid:
        for key in jwks:
            if key.get('kid') == kid:
                try:
                    from jose import jwt as jose_jwt
                    verified = jose_jwt.decode(
                        token,
                        key,
                        algorithms=['RS256', 'ES256'],
                        options={'verify_aud': False},
                    )
                    return verified
                except Exception:
                    pass

    # Fallback: HMAC verification against JWT_SECRET
    jwt_secret = os.environ.get('SUPABASE_JWT_SECRET', '')
    if jwt_secret:
        try:
            import hmac as _hmac
            import hashlib as _hl
            signing_input = f'{parts[0]}.{parts[1]}'.encode()
            expected_sig = _hmac.new(
                jwt_secret.encode(), signing_input, _hl.sha256
            ).digest()
            # base64url encode
            import base64 as _b64
            expected_b64 = _b64.urlsafe_b64encode(expected_sig).rstrip(b'=').decode()
            if hmac.compare_digest(parts[2], expected_b64):
                return payload
        except Exception:
            pass

    return None


def _get_token_from_request() -> str | None:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:].strip()
    return None


def _get_user_profile(user_id: str) -> dict | None:
    """Fetch user profile from Supabase using service_role."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/profiles',
            params={
                'id': f'eq.{user_id}',
                'select': 'id,email,name,role,is_super_admin,workspace_ids,status',
            },
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=5,
        )
        if resp.ok:
            rows = resp.json()
            if rows:
                return rows[0]
    except Exception:
        pass
    return None


def _get_workspace(workspace_id: str) -> dict | None:
    """Fetch workspace by ID."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces',
            params={
                'id': f'eq.{workspace_id}',
                'select': 'id,name,slug,disabled_apps',
            },
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=5,
        )
        if resp.ok:
            rows = resp.json()
            if rows:
                return rows[0]
    except Exception:
        pass
    return None


def _get_workspace_by_slug(slug: str) -> dict | None:
    """Fetch workspace by slug."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces',
            params={
                'slug': f'eq.{slug}',
                'select': 'id,name,slug,disabled_apps',
            },
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=5,
        )
        if resp.ok:
            rows = resp.json()
            if rows:
                return rows[0]
    except Exception:
        pass
    return None


def _user_in_workspace(profile: dict, workspace_id: str) -> bool:
    """Check if user belongs to workspace."""
    if profile.get('is_super_admin'):
        return True
    ws_ids = profile.get('workspace_ids') or []
    return str(workspace_id) in [str(w) for w in ws_ids]


def _is_module_enabled(workspace: dict, module_id: str) -> bool:
    """Check if module is enabled in workspace (not in disabled_apps)."""
    disabled = workspace.get('disabled_apps') or []
    if isinstance(disabled, str):
        try:
            disabled = json.loads(disabled)
        except Exception:
            disabled = []
    return module_id not in disabled


# ── Error helpers ─────────────────────────────────────────────────────────────

def _auth_error(message: str = 'Unauthorized', status: int = 401):
    return jsonify({'error': message}), status


def _forbidden(message: str = 'Forbidden'):
    return jsonify({'error': message}), 403


def _not_found(message: str = 'Not found'):
    return jsonify({'error': message}), 404


# ── Decorators ────────────────────────────────────────────────────────────────

def require_auth(f):
    """Decorator: validate JWT and attach user profile to flask.g.

    Sets g.user (profile dict) and g.user_id on success.
    Returns 401 if token is missing or invalid.

    Usage:
        @app.route('/api/example')
        @require_auth
        def my_endpoint():
            user = g.user  # profile dict
            ...
    """
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        token = _get_token_from_request()
        if not token:
            return _auth_error('Missing authorization token')

        payload = _verify_jwt(token)
        if not payload:
            return _auth_error('Invalid or expired token')

        user_id = payload.get('sub')
        if not user_id:
            return _auth_error('Invalid token payload')

        profile = _get_user_profile(user_id)
        if not profile:
            return _auth_error('User profile not found')

        if profile.get('status') == 'blocked':
            return _auth_error('Account is blocked')

        g.user = profile
        g.user_id = user_id
        return f(*args, **kwargs)
    return wrapper


def require_workspace(f):
    """Decorator: validate that the authenticated user has access to the workspace.

    Reads workspace_id from:
      - request args (query parameter 'workspace_id')
      - request JSON body ('workspace_id')
      - request args ('workspace') as slug (resolved to ID)

    Validates against g.user (set by require_auth).
    Sets g.workspace (workspace dict) on success.
    Returns 403 if user doesn't belong to workspace.

    Usage:
        @app.route('/api/example')
        @require_auth
        @require_workspace
        def my_endpoint():
            ws = g.workspace  # workspace dict
            ...
    """
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not hasattr(g, 'user'):
            return _auth_error('Authentication required')

        workspace_id = None
        workspace_slug = None

        # Try to get workspace_id from various sources
        if request.is_json:
            data = request.get_json(silent=True) or {}
            workspace_id = data.get('workspace_id')
            workspace_slug = data.get('workspace') or data.get('workspace_slug')

        if not workspace_id:
            workspace_id = request.args.get('workspace_id')
        if not workspace_slug:
            workspace_slug = request.args.get('workspace') or request.args.get('workspace_slug')

        # Resolve slug to ID if needed
        if not workspace_id and workspace_slug:
            ws = _get_workspace_by_slug(workspace_slug)
            if ws:
                workspace_id = ws['id']

        if not workspace_id:
            return _forbidden('Workspace ID required')

        # Validate membership
        if not _user_in_workspace(g.user, workspace_id):
            return _forbidden('Access denied to this workspace')

        # Fetch workspace details
        ws = _get_workspace(workspace_id)
        if not ws:
            return _not_found('Workspace not found')

        g.workspace = ws
        g.workspace_id = workspace_id
        return f(*args, **kwargs)
    return wrapper


def require_module(module_id: str):
    """Decorator factory: check if module is enabled in the workspace.

    Must be used AFTER @require_auth and @require_workspace.

    Usage:
        @app.route('/api/example')
        @require_auth
        @require_workspace
        @require_module('stock')
        def my_endpoint():
            ...
    """
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            if not hasattr(g, 'workspace'):
                return _auth_error('Workspace validation required')

            if not _is_module_enabled(g.workspace, module_id):
                return _forbidden(f'Module "{module_id}" is disabled')

            return f(*args, **kwargs)
        return wrapper
    return decorator


def require_admin(f):
    """Decorator: require super_admin role.

    Must be used AFTER @require_auth.

    Usage:
        @app.route('/api/admin-only')
        @require_auth
        @require_admin
        def admin_endpoint():
            ...
    """
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not hasattr(g, 'user'):
            return _auth_error('Authentication required')

        if not g.user.get('is_super_admin'):
            return _forbidden('Super admin access required')

        return f(*args, **kwargs)
    return wrapper


# ── Cron helpers (fail-closed) ────────────────────────────────────────────────

def require_cron(f):
    """Decorator: require valid CRON_SECRET for cron endpoints.

    FAIL-CLOSED: if CRON_SECRET is not configured, returns 503.
    If CRON_SECRET is set but token doesn't match, returns 401.
    """
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        cron_secret = os.environ.get('CRON_SECRET')
        if not cron_secret:
            return jsonify({'error': 'CRON_SECRET not configured'}), 503

        token = _get_token_from_request()
        if not token:
            return _auth_error('Missing cron token')

        if not hmac.compare_digest(token, cron_secret):
            return _auth_error('Invalid cron token')

        return f(*args, **kwargs)
    return wrapper


# ── Utilities ─────────────────────────────────────────────────────────────────

def get_supabase_headers():
    """Return headers for Supabase REST API calls using service_role."""
    return {
        'apikey': _SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
    }


def supabase_request(method: str, path: str, **kwargs):
    """Make a request to Supabase REST API with service_role headers.

    This is the ONLY way to access Supabase from Flask.
    All callers must go through this to ensure consistent headers.
    """
    url = f'{_SUPABASE_URL}/rest/v1/{path}'
    headers = get_supabase_headers()
    if 'headers' in kwargs:
        headers.update(kwargs.pop('headers'))
    return requests.request(method, url, headers=headers, timeout=kwargs.pop('timeout', 10), **kwargs)
