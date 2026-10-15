"""Testes do rate limit distribuído (FASE 1, item 3)."""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("labhub_api_app_rl", API_FILE)
appmod = importlib.util.module_from_spec(spec)
sys.modules["labhub_api_app_rl"] = appmod
spec.loader.exec_module(appmod)


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.expires = {}

    def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def expire(self, key, ttl):
        self.expires[key] = ttl
        return True


@pytest.fixture(autouse=True)
def reset_state():
    appmod._rate_limit_store.clear()
    yield


def test_rate_limit_redis_allows_until_limit():
    fake = FakeRedis()
    appmod.redis = fake
    limit = 3
    results = [appmod._check_rate_limit("1.2.3.4", max_requests=limit) for _ in range(limit + 1)]
    assert results[:limit] == [True] * limit
    assert results[limit] is False
    assert fake.expires["rate_limit:1.2.3.4"] == appmod.RATE_LIMIT_WINDOW


def test_rate_limit_redis_isolates_keys():
    fake = FakeRedis()
    appmod.redis = fake
    assert appmod._check_rate_limit("1.1.1.1", max_requests=1) is True
    assert appmod._check_rate_limit("2.2.2.2", max_requests=1) is True
    assert appmod._check_rate_limit("1.1.1.1", max_requests=1) is False


def test_rate_limit_fallback_when_redis_none():
    appmod.redis = None
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is True
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is True
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is False


def test_rate_limit_fallback_on_redis_error():
    class BrokenRedis:
        def incr(self, key):
            raise RuntimeError("boom")

        def expire(self, key, ttl):
            return True

    appmod.redis = BrokenRedis()
    assert appmod._check_rate_limit("7.7.7.7", max_requests=10) is True