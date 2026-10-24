"""Testes do rate limit distribuído (FASE 1, item 3)."""
import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

from _api_loader import load_api

appmod = load_api()


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.expires = {}
        self.ttls = {}

    def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def expire(self, key, ttl):
        self.expires[key] = ttl
        self.ttls[key] = ttl
        return True

    def ttl(self, key):
        """-1 = chave sem expiração (contrato do Redis/Upstash)."""
        return self.ttls.get(key, -1)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    """Estado limpo por teste. `redis` é SEMPRE restaurado via monkeypatch:
    com o carregador compartilhado (root_api) a instância do módulo é única
    na sessão — atribuições diretas vazariam para os demais arquivos."""
    monkeypatch.setattr(appmod, "redis", None)
    appmod._rate_limit_store.clear()
    yield


def test_rate_limit_redis_allows_until_limit(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(appmod, "redis", fake)
    limit = 3
    results = [appmod._check_rate_limit("1.2.3.4", max_requests=limit) for _ in range(limit + 1)]
    assert results[:limit] == [True] * limit
    assert results[limit] is False
    assert fake.expires["rate_limit:1.2.3.4"] == appmod.RATE_LIMIT_WINDOW


def test_rate_limit_redis_isolates_keys(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(appmod, "redis", fake)
    assert appmod._check_rate_limit("1.1.1.1", max_requests=1) is True
    assert appmod._check_rate_limit("2.2.2.2", max_requests=1) is True
    assert appmod._check_rate_limit("1.1.1.1", max_requests=1) is False


def test_rate_limit_fallback_when_redis_none():
    # redis já é None via fixture reset_state
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is True
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is True
    assert appmod._check_rate_limit("9.9.9.9", max_requests=2) is False


def test_rate_limit_fallback_on_redis_error(monkeypatch):
    class BrokenRedis:
        def incr(self, key):
            raise RuntimeError("boom")

        def expire(self, key, ttl):
            return True

    monkeypatch.setattr(appmod, "redis", BrokenRedis())
    assert appmod._check_rate_limit("7.7.7.7", max_requests=10) is True


def test_rate_limit_reaplica_ttl_de_chave_sem_expiracao(monkeypatch):
    """Se um request caiu entre INCR e EXPIRE, a chave fica sem TTL (-1) e
    bloquearia a chave para sempre; a próxima chamada deve reaplicar o TTL."""
    fake = FakeRedis()
    # simula chave órfã: contador já iniciado, sem TTL
    fake.store["rate_limit:orphan"] = 1
    monkeypatch.setattr(appmod, "redis", fake)
    assert appmod._check_rate_limit("orphan", max_requests=2) is True
    assert fake.expires["rate_limit:orphan"] == appmod.RATE_LIMIT_WINDOW
    assert fake.ttls["rate_limit:orphan"] != -1
