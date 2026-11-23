"""Autenticação estrita do tick QStash de notificações do LabHub.

O cron confiável processa a outbox, não gera lembretes indiscriminados.
Somente QStash pode chamar o endpoint; nunca incluir segredos na URL.
"""
from __future__ import annotations

import os

TICK_PATH = "/api/notifications/qstash/tick"
TICK_URL = f"https://lab-hub-pi.vercel.app{TICK_PATH}"
TICK_BODY = b'{"job":"labhub-notifications","version":1}'


def verify_signed_tick(body: bytes, signature: str, *, receiver_factory=None) -> bool:
    """Valida a assinatura QStash, payload fixo e URL oficial (fail-closed).

    A verificação inclui o destino HTTPS oficial no JWT do QStash, nunca o
    Host controlado pelo chamador. Nenhuma credencial é retornada/logada.
    """
    if os.environ.get("VERCEL_ENV") != "production":
        return False
    if body != TICK_BODY or not isinstance(signature, str) or not signature:
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
            url=TICK_URL,
        )
    except Exception:
        return False
    return True
