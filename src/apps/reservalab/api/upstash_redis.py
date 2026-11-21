"""Cliente Redis REST mínimo para Upstash.

Usa somente requests (já presente nas dependências do backend), sem manter
conexões persistentes em workers serverless. Falhas são propagadas ao caller,
que decide aplicar fallback ou falhar fechado conforme a operação.
"""
from __future__ import annotations

import os
from typing import Any, Sequence

import requests


class UpstashRedisError(RuntimeError):
    """Falha de configuração, transporte ou resposta do Upstash."""


class UpstashRedis:
    def __init__(self, url: str, token: str, timeout: float = 2.5):
        self.url = str(url or "").strip().rstrip("/")
        self.token = str(token or "").strip()
        self.timeout = float(timeout)
        if not self.url or not self.token:
            raise UpstashRedisError("UPSTASH_REDIS_REST_URL/TOKEN não configurados")

    @classmethod
    def from_env(cls):
        url = os.environ.get("UPSTASH_REDIS_REST_URL", "")
        token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
        if not url or not token:
            return None
        return cls(url, token)

    def execute(self, *command: Any):
        if not command:
            raise ValueError("comando Redis vazio")
        try:
            response = requests.post(
                self.url,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
                json=list(command),
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            raise UpstashRedisError(f"falha de transporte no Upstash: {exc}") from exc
        except ValueError as exc:
            raise UpstashRedisError("resposta JSON inválida do Upstash") from exc

        if not isinstance(payload, dict) or payload.get("error"):
            message = payload.get("error", "resposta inválida") if isinstance(payload, dict) else "resposta inválida"
            raise UpstashRedisError(f"comando Redis falhou: {str(message)[:200]}")
        return payload.get("result")

    def ping(self):
        return self.execute("PING")

    def get(self, key: str):
        return self.execute("GET", str(key))

    def set(self, key: str, value: Any, ex: int | None = None, nx: bool = False):
        command = ["SET", str(key), value]
        if ex is not None:
            if int(ex) <= 0:
                raise ValueError("TTL deve ser positivo")
            command.extend(["EX", int(ex)])
        if nx:
            command.append("NX")
        return self.execute(*command)

    def delete(self, *keys: str):
        if not keys:
            return 0
        return self.execute("DEL", *map(str, keys))

    def incr(self, key: str):
        return self.execute("INCR", str(key))

    def ttl(self, key: str):
        return self.execute("TTL", str(key))

    def expire(self, key: str, seconds: int):
        if int(seconds) <= 0:
            raise ValueError("TTL deve ser positivo")
        return self.execute("EXPIRE", str(key), int(seconds))

    def eval(self, script: str, keys: Sequence[str], args: Sequence[Any]):
        keys = list(keys or [])
        args = list(args or [])
        return self.execute("EVAL", script, len(keys), *keys, *args)


def create_redis_client():
    """Retorna None somente quando as credenciais não foram configuradas."""
    return UpstashRedis.from_env()
