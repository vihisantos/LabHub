"""Autenticação estrita do tick QStash de notificações do LabHub.

O cron confiável processa a outbox, não gera lembretes indiscriminados.
Somente QStash pode chamar o endpoint; nunca incluir segredos na URL.
"""
from __future__ import annotations

import os
import re
import uuid

TICK_PATH = "/api/notifications/qstash/tick"
TICK_URL = f"https://lab-hub-pi.vercel.app{TICK_PATH}"
TICK_BODY = b'{"job":"labhub-notifications","version":1}'
PERIODIC_BODY = b'{"job":"labhub-notifications-periodic","version":1}'


def tick_destination():
    env = os.environ.get("VERCEL_ENV")
    if env == "production":
        return TICK_URL
    if env != "preview" or os.environ.get("LABHUB_PREVIEW_NOTIFICATION_TICK") != "1":
        return None
    host = os.environ.get("VERCEL_URL", "").strip()
    if not re.fullmatch(r"lab-[a-z0-9-]+-deltaf59592-3090\.vercel\.app", host):
        return None
    if os.environ.get("SUPABASE_URL", "").rstrip("/") != "https://pgmetdqsdjotdcifjivu.supabase.co":
        return None
    return f"https://{host}{TICK_PATH}"


def periodic_producers_enabled() -> bool:
    """One deployment-wide owner for scheduled notification producers.

    Default is legacy until the QStash schedule is prepared. Preview requires
    the existing trusted staging destination guard. Never switch on via a
    caller-supplied parameter.
    """
    return os.environ.get("LABHUB_QSTASH_PERIODIC_ENABLED") == "1" and bool(tick_destination())


def verify_signed_tick(body: bytes, signature: str, *, receiver_factory=None) -> bool:
    """Valida a assinatura QStash, payload fixo e URL oficial (fail-closed).

    A verificação inclui o destino HTTPS oficial no JWT do QStash, nunca o
    Host controlado pelo chamador. Nenhuma credencial é retornada/logada.
    """
    destination = tick_destination()
    if not destination:
        return False
    if body not in (TICK_BODY, PERIODIC_BODY) or not isinstance(signature, str) or not signature:
        return False

    current = os.environ.get("QSTASH_CURRENT_SIGNING_KEY", "").strip()
    following = os.environ.get("QSTASH_NEXT_SIGNING_KEY", "").strip()
    if not current or not following:
        raise RuntimeError("QStash signing keys not configured")

    if receiver_factory is None:
        from qstash import Receiver
        receiver_factory = Receiver

    verifier = receiver_factory(
        current_signing_key=current,
        next_signing_key=following,
    )
    try:
        verifier.verify(
            body=body.decode("utf-8"),
            signature=signature,
            url=destination,
        )
    except Exception:
        return False
    return True


def _publish_fixed_tick(deduplication_id: str, *, publish=None) -> bool:
    """Wake-up best-effort; PostgreSQL outbox + schedule handle recovery.

    The message contains only a fixed job type. No ticket, staff or patient
    details are sent to QStash. Production or explicitly enabled staging; signed by QStash on delivery.
    """
    destination = tick_destination()
    if not destination:
        return False
    token = os.environ.get("QSTASH_TOKEN", "").strip()
    if not token:
        return False

    preview = os.environ.get("VERCEL_ENV") == "preview"
    bypass = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "").strip() if preview else ""
    if preview and not bypass:
        return False
    if preview:
        deduplication_id = "staging-" + deduplication_id
    http_client = None
    try:
        if publish is None:
            import httpx
            from qstash import QStash

            # Small bounded network attempt; never block ticket mutations
            # indefinitely if QStash is degraded.
            client = QStash(token=token, retry=False)
            http_client = httpx.Client(
                timeout=httpx.Timeout(2.5, connect=1.0)
            )
            client.http._client = http_client
            publish = client.message.publish

        publish(
            url=destination,
            body=TICK_BODY.decode("utf-8"),
            content_type="application/json",
            deduplication_id=deduplication_id,
            retries=1,
            timeout="20s",
            **({"headers": {"x-vercel-protection-bypass": bypass}} if preview else {}),
        )
        return True
    except Exception:
        return False
    finally:
        if http_client is not None:
            http_client.close()


def request_tick_for_created_ticket(ticket_id: str, *, publish=None) -> bool:
    """Wake the worker after BOTH the notification and workflow outboxes exist."""
    try:
        normalized = str(uuid.UUID(str(ticket_id)))
        if normalized != str(ticket_id):
            return False
    except (TypeError, ValueError, AttributeError):
        return False
    return _publish_fixed_tick(f"labhub-created-{normalized}", publish=publish)


def request_tick_for_chamados_event(event_id: str, *, publish=None) -> bool:
    """Wake the worker for an already-persisted claim/assignment/status event.

    The event id is already a SHA-256 digest, avoiding PII in the QStash
    deduplication header. Other modules and malformed IDs cannot schedule.
    """
    if not isinstance(event_id, str) or not re.fullmatch(r"chamados:[0-9a-f]{64}", event_id):
        return False
    return _publish_fixed_tick(f"labhub-event-{event_id[9:]}", publish=publish)
