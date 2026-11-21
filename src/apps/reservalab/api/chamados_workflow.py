"""Agendamento opt-in de lembretes de Chamados com QStash + Workflow (Flask).

O cron e os mecanismos existentes de lock/deduplicação permanecem intactos.
Este módulo não executa nenhuma operação externa quando a flag está desligada.
"""
import hashlib
import json
import logging
import os
import uuid
from urllib.parse import urlsplit

LOGGER = logging.getLogger(__name__)
WORKFLOW_PATH = "/api/chamados/reminders/workflow"
FLAG = "LABHUB_CHAMADOS_WORKFLOW_ENABLED"
URL_ENV = "LABHUB_CHAMADOS_WORKFLOW_URL"
# MVP: 3 checagens por chamado. Não substituir os 10 lembretes legados ainda.
MAX_WORKFLOW_CHECKS = 3


def enabled() -> bool:
    return os.environ.get(FLAG, "").strip().lower() in ("1", "true", "yes")


def _canonical_uuid(value) -> str:
    if not isinstance(value, str):
        raise ValueError("identificador inválido")
    result = str(uuid.UUID(value))
    if value.lower() != result:
        raise ValueError("identificador não canônico")
    return result


def _config() -> dict:
    """Fail-closed; nunca deduz destino a partir do Host/cliente."""
    url = os.environ.get(URL_ENV, "").strip()
    # Para Preview, a URL exata do deploy muda a cada commit. Usar apenas
    # VERCEL_URL provida pela plataforma (nunca Host/headers do request).
    if not url and os.environ.get("VERCEL_ENV") == "preview":
        host = os.environ.get("VERCEL_URL", "").strip()
        if host.endswith(".vercel.app") and "/" not in host and ":" not in host:
            url = f"https://{host}{WORKFLOW_PATH}"
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path != WORKFLOW_PATH):
        raise ValueError("URL pública HTTPS do workflow não configurada corretamente")
    keys = ("QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY")
    config = {"url": url}
    for key in keys:
        value = os.environ.get(key, "").strip()
        if not value:
            raise ValueError(f"{key} ausente")
        config[key] = value
    return config


def parse_payload(payload) -> dict:
    """Aceitar apenas IDs internos e nenhum dado sensível no QStash."""
    if not isinstance(payload, dict):
        raise ValueError("payload inválido")
    if set(payload) != {"ticket_id", "workspace_id"}:
        raise ValueError("campos não permitidos")
    return {
        "ticket_id": _canonical_uuid(payload.get("ticket_id")),
        "workspace_id": _canonical_uuid(payload.get("workspace_id")),
    }


def eligible_ticket(ticket) -> bool:
    return (
        isinstance(ticket, dict)
        and ticket.get("status") == "aberto"
        and not str(ticket.get("assignedToUserId") or "").strip()
    )


def schedule(ticket, *, publish=None) -> bool:
    """Enfileirar de maneira best-effort após criação/reabertura CONFIRMADA."""
    if not enabled() or not eligible_ticket(ticket):
        return False
    try:
        payload = parse_payload({
            "ticket_id": ticket.get("id"),
            "workspace_id": ticket.get("workspace_id"),
        })
        config = _config()
        revision = str(ticket.get("updatedAt") or ticket.get("createdAt") or "")
        if not revision:
            raise ValueError("revisão do chamado ausente")
        fingerprint = hashlib.sha256(
            f"{payload['ticket_id']}:{payload['workspace_id']}:{revision}".encode("utf-8")
        ).hexdigest()
        if publish is None:
            from qstash import QStash
            client = QStash(token=config["QSTASH_TOKEN"], retry=False)
            publish = client.message.publish_json
        publish(
            url=config["url"],
            body=payload,
            deduplication_id=f"labhub-reminder-{fingerprint}",
            retries=2,
            redact={"body": True},
        )
        return True
    except Exception as exc:
        # Nunca quebrar criação/PATCH de chamado por indisponibilidade do QStash.
        LOGGER.warning("[chamados-workflow] agendamento não concluído: %s", type(exc).__name__)
        return False


def register(app, process_one, *, interval_seconds: int) -> bool:
    """Registra a rota assinada somente quando o experimento está habilitado.

    A lógica de processamento é a mesma do cron, com escopo estrito em um
    único ticket + workspace. Toda revalidação/lock/dedup segue no PostgreSQL.
    """
    if not enabled():
        return False
    try:
        config = _config()
        from qstash import Receiver
        from upstash_workflow.flask import Serve
    except (ValueError, ImportError) as exc:
        LOGGER.warning("[chamados-workflow] recurso desabilitado: %s", type(exc).__name__)
        return False

    receiver = Receiver(
        current_signing_key=config["QSTASH_CURRENT_SIGNING_KEY"],
        next_signing_key=config["QSTASH_NEXT_SIGNING_KEY"],
    )
    serve = Serve(app)

    @serve.route(
        WORKFLOW_PATH,
        receiver=receiver,
        initial_payload_parser=json.loads,
        url=config["url"],
    )
    def chamados_reminder_workflow(context):
        payload = parse_payload(context.request_payload)
        for wave in range(1, MAX_WORKFLOW_CHECKS + 1):
            # Sleep durável: não segura uma função Vercel aberta por 2 minutos.
            context.sleep(f"aguardar-onda-{wave}", interval_seconds)
            result = context.run(
                f"verificar-onda-{wave}",
                lambda: process_one(payload["ticket_id"], payload["workspace_id"]),
            )
            if not isinstance(result, dict) or result.get("error"):
                raise RuntimeError("verificação de lembrete falhou")
            # Parar ao detectar que foi assumido/fechado/removido.
            if result.get("candidate_count") == 0:
                return

    return True
