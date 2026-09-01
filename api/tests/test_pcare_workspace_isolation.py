"""Etapa 8.1 — Multi-workspace isolation for check-pcare push notifications.

Verifies that:
- Part/maintenance records from WS-A only notify subscribers of WS-A
- Cross-workspace data never leaks (WS-B subscriber never gets WS-A push)
- Multi-workspace subscribers receive from all their workspaces
- Super admin receives from all workspaces
- Records without workspace_id are skipped (fail-closed)
- User with no workspace receives nothing
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'


class FakeRedis:
    """Fake Redis with per-key support for dedup testing."""

    def __init__(self):
        self._store = {}

    def smembers(self, key):
        return set(self._store.get(key, set()))

    def get(self, key):
        return self._store.get(key, {}).get('v')

    def setex(self, key, ttl, value):
        self._store[key] = {'v': value}

    def delete(self, key):
        self._store.pop(key, None)

    def sadd(self, key, value):
        if key not in self._store:
            self._store[key] = set()
        self._store[key].add(value)


class FakeResponse:
    """Fake requests.Response for mocking Supabase REST calls."""

    def __init__(self, json_data, ok=True):
        self._json = json_data
        self.ok = ok
        self.status_code = 200 if ok else 500
        self.text = json.dumps(json_data) if json_data else ''

    def json(self):
        return self._json


@pytest.fixture(scope='module')
def push_module():
    spec = importlib.util.spec_from_file_location('reservalab_api_pcare', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_api_pcare'] = mod
    spec.loader.exec_module(mod)
    return mod


def _push_sub(user):
    """Create a push subscription structure matching the real format."""
    return {
        'key': f'k-{user["id"]}',
        'endpoint': f'https://push.example/{user["id"]}',
        'keys': {},
        'user': user,
    }


def _user(uid, workspace_ids, role='technician', is_super=False, module='pc-care'):
    """Create a user profile for subscriber testing."""
    return {
        'id': uid,
        'role': role,
        'is_super_admin': is_super,
        'workspace_ids': workspace_ids,
        'apps': {module: True},
        'notify_settings': {},
    }


# ── Case 1: Single workspace ──────────────────────────────────────────────


def test_part_ws_a_notifies_only_ws_a_subscribers(push_module, monkeypatch):
    """Low-stock part from WS-A only reaches subscribers of WS-A."""
    user_a = _user('u-a', ['ws-a'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_a), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append((sub['user']['id'], t)) or True)

    parts_resp = FakeResponse([
        {'id': 'p1', 'name': 'Cabo HDMI', 'quantity': 0, 'minquantity': 2, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 1
    assert sent == [('u-a', '🔧 Estoque baixo: Cabo HDMI')]


# ── Case 2: Cross-workspace isolation ─────────────────────────────────────


def test_part_ws_a_does_not_notify_ws_b_subscribers(push_module, monkeypatch):
    """Low-stock part from WS-A does NOT reach subscriber of WS-B."""
    user_b = _user('u-b', ['ws-b'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_b), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(sub['user']['id']) or True)

    parts_resp = FakeResponse([
        {'id': 'p2', 'name': 'Mouse', 'quantity': 0, 'minquantity': 5, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 0
    assert sent == []


# ── Case 3: Bidirectional isolation ───────────────────────────────────────


def test_maintenance_ws_b_does_not_notify_ws_a_subscriber(push_module, monkeypatch):
    """Maintenance from WS-B does NOT reach subscriber of WS-A."""
    user_a = _user('u-a', ['ws-a'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_a), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(sub['user']['id']) or True)

    parts_resp = FakeResponse([])
    maintenance_resp = FakeResponse([
        {'id': 'm1', 'pcnumber': 'PC-01', 'labname': 'Lab B', 'type': 'cleaning',
         'scheduleddate': '2099-01-01', 'workspace_id': 'ws-b'},
    ])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 0
    assert sent == []


# ── Case 4: Multi-workspace subscriber ────────────────────────────────────


def test_multi_ws_subscriber_receives_from_both(push_module, monkeypatch):
    """Subscriber with access to both WS-A and WS-B receives from both."""
    user_both = _user('u-both', ['ws-a', 'ws-b'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_both), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(t) or True)

    parts_resp = FakeResponse([
        {'id': 'p3', 'name': 'Teclado', 'quantity': 0, 'minquantity': 3, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([
        {'id': 'm2', 'pcnumber': 'PC-02', 'labname': 'Lab A', 'type': 'restoration',
         'scheduleddate': '2099-01-01', 'workspace_id': 'ws-b'},
    ])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 2
    assert len(sent) == 2
    assert any('Teclado' in t for t in sent)
    assert any('PC-02' in t for t in sent)


# ── Case 5: Super admin receives from all ─────────────────────────────────


def test_super_admin_receives_from_all_workspaces(push_module, monkeypatch):
    """Super admin receives push for records from any workspace."""
    super_admin = _user('u-super', ['ws-a', 'ws-b'], role='admin', is_super=True)
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(super_admin), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(t) or True)

    parts_resp = FakeResponse([
        {'id': 'p4', 'name': 'Monitor', 'quantity': 0, 'minquantity': 1, 'workspace_id': 'ws-c'},
    ])
    maintenance_resp = FakeResponse([
        {'id': 'm3', 'pcnumber': 'PC-03', 'labname': 'Lab C', 'type': 'both',
         'scheduleddate': '2099-01-01', 'workspace_id': 'ws-d'},
    ])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 2
    assert len(sent) == 2


# ── Case 6: Record without workspace_id → skip (fail-closed) ─────────────


def test_record_without_workspace_id_skipped(push_module, monkeypatch):
    """Record with no workspace_id sends to nobody (fail-closed)."""
    user_a = _user('u-a', ['ws-a'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_a), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(sub['user']['id']) or True)

    parts_resp = FakeResponse([
        {'id': 'p5', 'name': 'Cabos soltos', 'quantity': 0, 'minquantity': 1, 'workspace_id': None},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    # Record was skipped → sent=0, but dedup key is set so it won't retry
    assert result['sent'] == 0
    assert sent == []


# ── Case 7: No membership → receives nothing ──────────────────────────────


def test_user_with_no_workspace_receives_nothing(push_module, monkeypatch):
    """User with empty workspace_ids receives no PCare notifications."""
    user_none = _user('u-none', [])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_none), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(sub['user']['id']) or True)

    parts_resp = FakeResponse([
        {'id': 'p6', 'name': 'Fita', 'quantity': 0, 'minquantity': 10, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 0
    assert sent == []


# ── Case 8: Adversarial isolation test ────────────────────────────────────


def test_adversarial_ws_b_subscriber_never_gets_ws_a_data(push_module, monkeypatch):
    """Adversarial: WS-B subscriber must NEVER receive WS-A data (both parts and maintenance)."""
    user_b = _user('u-b', ['ws-b'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_b), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append(sub['user']['id']) or True)

    parts_resp = FakeResponse([
        {'id': 'p7', 'name': 'Part A', 'quantity': 0, 'minquantity': 1, 'workspace_id': 'ws-a'},
        {'id': 'p8', 'name': 'Part B', 'quantity': 0, 'minquantity': 1, 'workspace_id': 'ws-b'},
    ])
    maintenance_resp = FakeResponse([
        {'id': 'm4', 'pcnumber': 'PC-A', 'labname': 'Lab A', 'type': 'cleaning',
         'scheduleddate': '2099-01-01', 'workspace_id': 'ws-a'},
        {'id': 'm5', 'pcnumber': 'PC-B', 'labname': 'Lab B', 'type': 'restoration',
         'scheduleddate': '2099-01-01', 'workspace_id': 'ws-b'},
    ])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    # Only Part B and Maintenance B should reach user_b
    assert result['sent'] == 2
    assert sent == ['u-b', 'u-b']
    # Verify no WS-A data leaked — check via _target_subs directly
    all_subs_ws_a = push_module._target_subs(module='pc-care', workspace_id='ws-a')
    all_subs_ws_b = push_module._target_subs(module='pc-care', workspace_id='ws-b')
    assert all(s['user']['id'] != 'u-b' for s in all_subs_ws_a)
    assert any(s['user']['id'] == 'u-b' for s in all_subs_ws_b)


# ── Case 9: Empty results → no crash ──────────────────────────────────────


def test_empty_parts_and_maintenance(push_module, monkeypatch):
    """No parts/maintenance → sent=0, no crash."""
    fake = FakeRedis()
    monkeypatch.setattr(push_module, 'redis', fake)

    parts_resp = FakeResponse([])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 0


# ── Case 10: Enough stock → no notification ───────────────────────────────


def test_sufficient_stock_no_notification(push_module, monkeypatch):
    """Part with enough stock does NOT trigger notification."""
    user_a = _user('u-a', ['ws-a'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_a), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append('SENT') or True)

    parts_resp = FakeResponse([
        {'id': 'p9', 'name': 'Mouse', 'quantity': 10, 'minquantity': 5, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    result = push_module._internal_push_check_pcare()
    assert result['checked'] is True
    assert result['sent'] == 0
    assert sent == []


# ── Case 11: Dedup across runs ────────────────────────────────────────────


def test_dedup_prevents_duplicate_push(push_module, monkeypatch):
    """Same record across two cron runs sends push only once."""
    user_a = _user('u-a', ['ws-a'])
    fake = FakeRedis()
    fake.sadd('push:subscribers', json.dumps(_push_sub(user_a), ensure_ascii=False))
    monkeypatch.setattr(push_module, 'redis', fake)

    sent = []
    monkeypatch.setattr(push_module, 'push_notify', lambda sub, t, b, **kw: sent.append('SENT') or True)

    parts_resp = FakeResponse([
        {'id': 'p10', 'name': 'Dedup Part', 'quantity': 0, 'minquantity': 1, 'workspace_id': 'ws-a'},
    ])
    maintenance_resp = FakeResponse([])

    def fake_get(url, **kwargs):
        if 'parts' in url:
            return parts_resp
        return maintenance_resp

    monkeypatch.setattr(push_module.requests, 'get', fake_get)

    # First run
    result1 = push_module._internal_push_check_pcare()
    assert result1['sent'] == 1
    assert len(sent) == 1

    # Second run — dedup kicks in
    result2 = push_module._internal_push_check_pcare()
    assert result2['sent'] == 0
    assert len(sent) == 1
