"""Dispatcher entre o outbox PostgreSQL e Redis Streams.

PostgreSQL mantém a fonte durável e o estado de entrega. Redis é o transporte
operacional; mensagens duplicadas são esperadas e devem ser idempotentes.
"""
from __future__ import annotations


def _retry_delay(attempts: int, base_seconds: int = 15) -> int:
    return min(3600, max(1, int(base_seconds) * (2 ** max(0, int(attempts) - 1))))


def publish_pending(outbox_store, queue, worker_id: str, limit: int = 20):
    """Publica no Redis eventos pendentes/recuperáveis do outbox."""
    queue.ensure_group()
    rows = outbox_store.notification_outbox_claim_for_publish(
        worker_id, limit=limit, lease_seconds=90,
    )
    published = released = stale_claims = 0

    for row in rows:
        event_id = str(row.get("event_id") or "")
        token = row.get("lock_token")
        if not event_id or not token or not isinstance(row.get("payload"), dict):
            # Sem identidade/token não há como concluir ou liberar com segurança.
            stale_claims += 1
            continue
        try:
            queue.enqueue(event_id, row["payload"])
        except Exception as exc:
            delay = _retry_delay(row.get("publish_attempts", 1), base_seconds=5)
            if outbox_store.notification_outbox_release_publish(
                event_id, token, str(exc), delay_seconds=delay,
            ):
                released += 1
            continue

        # Se o consumidor já reivindicou a mensagem antes deste RPC, a
        # transição publishing -> queued não casa. O claim do consumidor vence.
        outbox_store.notification_outbox_mark_queued(event_id, token)
        published += 1

    return {
        "claimed": len(rows),
        "published": published,
        "released": released,
        "invalid_claims": stale_claims,
    }


def process_pending(
    outbox_store, queue, worker_id: str, handler, count: int = 10,
    min_idle_ms: int = 60_000, reclaim_start_id: str = "0-0",
):
    """Consome Redis; só dá ACK depois de persistir delivered/retry no Postgres."""
    queue.ensure_group()
    reclaimed = queue.reclaim_stale(
        worker_id, min_idle_ms=min_idle_ms,
        start_id=reclaim_start_id, count=count,
    )
    fresh = queue.read_new(worker_id, count=count)
    messages = reclaimed["messages"] + fresh
    acked = delivered = retried = failed = duplicates = 0

    for message in messages:
        event_id = message["event_id"]
        stream_id = message["message_id"]
        claim = outbox_store.notification_outbox_claim_event(
            event_id, worker_id, lease_seconds=120,
        )
        if claim is None:
            # Já entregue/morto, atrasado para retry ou outro worker com lease.
            # O outbox continua sendo a fonte de verdade e pode republicar.
            if queue.acknowledge(stream_id) == 1:
                acked += 1
                duplicates += 1
            continue

        token = claim.get("lock_token")
        if not token:
            failed += 1
            continue

        try:
            handled = handler(event_id, claim["payload"])
            if handled is False:
                raise RuntimeError("handler não confirmou a entrega")
            if outbox_store.notification_outbox_complete(event_id, token):
                if queue.acknowledge(stream_id) == 1:
                    acked += 1
                    delivered += 1
                else:
                    failed += 1
            else:
                # Não ACK: o lease expira e o evento será recuperado.
                failed += 1
        except Exception as exc:
            delay = _retry_delay(claim.get("attempts", 1))
            state = outbox_store.notification_outbox_retry(
                event_id, token, str(exc), delay_seconds=delay,
            )
            if state in ("pending", "dead") and queue.acknowledge(stream_id) == 1:
                acked += 1
                if state == "pending":
                    retried += 1
                else:
                    failed += 1
            else:
                # Falha ao persistir retry ou token perdido: mantém pendente.
                failed += 1

    return {
        "fetched": len(messages),
        "acked": acked,
        "delivered": delivered,
        "retried": retried,
        "duplicates": duplicates,
        "failed": failed,
        "reclaim_next_id": reclaimed["next_id"],
        "reclaimed": len(reclaimed["messages"]),
        "new": len(fresh),
    }
