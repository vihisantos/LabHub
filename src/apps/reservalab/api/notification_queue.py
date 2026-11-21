"""Fila operacional de notificações sobre Redis Streams (Upstash).

O stream transporta referências/payloads de trabalho; não é o histórico
permanente. O produtor deve persistir a notificação/outbox no PostgreSQL antes
de chamar enqueue. O consumidor só confirma (XACK) depois do processamento.
"""
from __future__ import annotations

import json
from typing import Any

DEFAULT_STREAM = "labhub:notifications:stream:v1"
DEFAULT_GROUP = "labhub-notification-workers"


class NotificationQueueError(RuntimeError):
    """Falha ao interpretar ou operar a fila de notificações."""


class NotificationQueue:
    def __init__(self, redis_client, stream=DEFAULT_STREAM, group=DEFAULT_GROUP):
        if redis_client is None:
            raise NotificationQueueError("Upstash Redis não configurado")
        self.redis = redis_client
        self.stream = str(stream)
        self.group = str(group)

    def ensure_group(self):
        try:
            return self.redis.xgroup_create(self.stream, self.group, "0", mkstream=True)
        except Exception as exc:
            # BUSYGROUP significa que o grupo já existe; qualquer outro erro
            # deve continuar visível para não mascarar indisponibilidade.
            if "BUSYGROUP" in str(exc).upper():
                return "EXISTS"
            raise

    def enqueue(self, event_id: str, payload: dict[str, Any]):
        event_id = str(event_id or "").strip()
        if not event_id or not isinstance(payload, dict):
            raise ValueError("event_id e payload objeto são obrigatórios")
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        return self.redis.xadd(
            self.stream,
            {"event_id": event_id, "payload": encoded},
        )

    @staticmethod
    def _decode_messages(raw):
        if raw in (None, []):
            return []
        if not isinstance(raw, list):
            raise NotificationQueueError("resposta inválida de leitura do Redis Stream")
        decoded = []
        # XREADGROUP: [[stream, [[message_id, [field, value, ...]], ...]]]
        for stream_item in raw:
            if not isinstance(stream_item, list) or len(stream_item) != 2:
                raise NotificationQueueError("estrutura inválida do Redis Stream")
            messages = stream_item[1] or []
            for item in messages:
                if not isinstance(item, list) or len(item) != 2:
                    raise NotificationQueueError("mensagem inválida no Redis Stream")
                message_id, fields = item
                if not isinstance(fields, list) or len(fields) % 2:
                    raise NotificationQueueError("campos inválidos no Redis Stream")
                values = dict(zip(fields[::2], fields[1::2]))
                try:
                    payload = json.loads(values["payload"])
                    event_id = str(values["event_id"])
                except (KeyError, TypeError, ValueError) as exc:
                    raise NotificationQueueError("payload inválido na fila") from exc
                if not isinstance(payload, dict) or not event_id:
                    raise NotificationQueueError("evento inválido na fila")
                decoded.append({
                    "stream": stream_item[0],
                    "message_id": str(message_id),
                    "event_id": event_id,
                    "payload": payload,
                })
        return decoded

    def read_new(self, consumer: str, count: int = 10):
        raw = self.redis.xreadgroup(self.stream, self.group, consumer, count=count)
        return self._decode_messages(raw)

    def reclaim_stale(
        self, consumer: str, min_idle_ms: int = 60_000,
        start_id: str = "0-0", count: int = 10,
    ):
        raw = self.redis.xautoclaim(
            self.stream, self.group, consumer,
            min_idle_ms=min_idle_ms, start_id=start_id, count=count,
        )
        if not isinstance(raw, list) or len(raw) < 2:
            raise NotificationQueueError("resposta inválida de XAUTOCLAIM")
        return {
            "next_id": str(raw[0]),
            "messages": self._decode_messages([[self.stream, raw[1] or []]]),
            "deleted_ids": raw[2] if len(raw) > 2 else [],
        }

    def acknowledge(self, *message_ids: str):
        return self.redis.xack(self.stream, self.group, *message_ids)
