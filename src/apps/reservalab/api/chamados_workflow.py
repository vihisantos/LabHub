"""Agendamento opt-in de lembretes de Chamados com QStash + Workflow (Flask).

Desenho durável (migrations 115/116):

1. A criação/reabertura do Chamado grava um pedido de agendamento numa outbox
   DEDICADA do PostgreSQL. Nenhuma chamada ao QStash acontece nesse caminho.
   Se essa gravação falhar por indisponibilidade temporária, o dispatcher
   reconcilia a outbox depois (migrations 117/118), com varredura limitada,
   idempotente e dedup por chamado+ciclo.
2. Um dispatcher (endpoint protegido por CRON_SECRET) reclama um lote pequeno,
   publica no QStash com dedup id estável e confirma a linha. Falhas voltam para
   a fila com backoff exponencial limitado e, após 5 tentativas, viram `dead`.
3. O Workflow usa somente UUIDs no payload e revalida o ciclo vigente no
   PostgreSQL a cada onda, antes de reutilizar locks/dedup já existentes.

O cron legado e os fluxos de notificação das PRs #487/#489 não são alterados.
Este módulo não executa nenhuma operação externa quando a flag está desligada.
"""
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit

LOGGER = logging.getLogger(__name__)


class _RedactBypassFilter(logging.Filter):
    """Defesa em profundidade: nunca deixar o bypass vazar em logs."""

    def __init__(self, secret: str):
        super().__init__()
        self._secret = secret

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
            if self._secret and self._secret in message:
                record.msg = message.replace(self._secret, "[REDACTED]")
                record.args = ()
        except Exception:
            pass
        return True


WORKFLOW_PATH = "/api/chamados/reminders/workflow"
FLAG = "LABHUB_CHAMADOS_WORKFLOW_ENABLED"
URL_ENV = "LABHUB_CHAMADOS_WORKFLOW_URL"
# MVP: 3 checagens por chamado. Não substituir os 10 lembretes legados ainda.
MAX_WORKFLOW_CHECKS = 3
DEFAULT_DISPATCH_BATCH = 10
MAX_PUBLISH_ATTEMPTS = 5
PUBLISH_TIMEOUT_SECONDS = 5.0
PUBLISH_CONNECT_TIMEOUT_SECONDS = 2.0
OUTBOX_RPC_ENQUEUE = "chamados_workflow_outbox_enqueue"
OUTBOX_RPC_CLAIM = "chamados_workflow_outbox_claim"
OUTBOX_RPC_MARK = "chamados_workflow_outbox_mark_published"
OUTBOX_RPC_RELEASE = "chamados_workflow_outbox_release"
OUTBOX_RPC_CURRENT = "chamados_workflow_outbox_current"
OUTBOX_RPC_RECONCILE_TICK = "chamados_workflow_outbox_reconcile_tick"
OUTBOX_RPC_RECONCILE_CANDIDATES = "chamados_workflow_outbox_reconcile_candidates"
# A reconciliação é durável, limitada e idempotente: uma varredura pequena e
# indexada a cada 15 minutos, nunca a cada criação de chamado.
RECONCILE_INTERVAL_SECONDS = 900
RECONCILE_LOOKBACK_MINUTES = 1440
RECONCILE_LIMIT = 20
# A documentação da Upstash recomenda configurar o bypass no cliente QStash
# para que TODAS as etapas (inclusive retomadas após context.sleep) cheguem à
# Preview protegida. O SDK Python 3.4.0 não tem opção de headers padrão, e o
# upstash-workflow 2.0.0 remove headers `x-vercel-*` recebidos do usuário
# (_recreate_user_headers). Por isso injetamos o header no cliente HTTP usado
# tanto na publicação inicial quanto pelo próprio Workflow. Nada de query
# parameter: o secreto nunca aparece em URL, log de acesso ou resposta.
VERCEL_BYPASS_ENV = "VERCEL_AUTOMATION_BYPASS_SECRET"
VERCEL_BYPASS_HEADER = "x-vercel-protection-bypass"
QSTASH_FORWARD_PREFIX = "Upstash-Forward-"


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
    environment = os.environ.get("VERCEL_ENV", "").strip()
    if environment == "production" and parsed.hostname != "lab-hub-pi.vercel.app":
        raise ValueError("Workflow de produção deve usar o domínio oficial")
    # Deployment Protection exige bypass apenas na Preview. Produção é
    # alcançada pelo domínio oficial público; inventar um bypass de produção
    # impediria o endpoint de ser registrado e o dispatcher de funcionar.
    keys = ["QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"]
    if environment != "production":
        keys.append(VERCEL_BYPASS_ENV)
    config = {"url": url}
    for key in keys:
        value = os.environ.get(key, "").strip()
        if not value:
            raise ValueError(f"{key} ausente")
        config[key] = value
    if environment != "production":
        bypass = config[VERCEL_BYPASS_ENV]
        if len(bypass) < 16 or len(bypass) > 256 or any(ch.isspace() for ch in bypass):
            raise ValueError("bypass de automação inválido")
    return config


def parse_payload(payload) -> dict:
    """Aceitar apenas UUIDs internos e nenhum dado sensível no QStash."""
    if not isinstance(payload, dict):
        raise ValueError("payload inválido")
    if set(payload) != {"ticket_id", "workspace_id", "job_id"}:
        raise ValueError("campos não permitidos")
    return {
        "ticket_id": _canonical_uuid(payload.get("ticket_id")),
        "workspace_id": _canonical_uuid(payload.get("workspace_id")),
        "job_id": _canonical_uuid(payload.get("job_id")),
    }


def eligible_ticket(ticket) -> bool:
    return (
        isinstance(ticket, dict)
        and ticket.get("status") == "aberto"
        and not str(ticket.get("assignedToUserId") or "").strip()
    )


def _canonical_revision(value) -> str:
    """Normaliza o timestamp para que criação e reconciliação gerem o mesmo hash."""
    text = str(value or "")
    if not text:
        return ""
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds")


def cycle_key(ticket) -> str:
    """Chave estável do ciclo: primeira gravação vence, reabertura cria outra."""
    payload = parse_payload({
        "ticket_id": ticket.get("id"),
        "workspace_id": ticket.get("workspace_id"),
        "job_id": str(uuid.uuid4()),
    })
    # Mesma convenção de revisão de `_chamados_event_id` (api/app.py), com
    # estado atual incluído: reabertura/remoção de responsável trocam o ciclo
    # mesmo se o timestamp não for atualizado pelo banco.
    revision = _canonical_revision(
        ticket.get("updatedAt") or ticket.get("updated_at")
        or ticket.get("updated_at_iso") or ticket.get("statusUpdatedAt") or ""
    )
    state = json.dumps(
        {
            "status": str(ticket.get("status") or ""),
            "assignedToUserId": str(ticket.get("assignedToUserId") or ""),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    material = (
        f"{payload['ticket_id']}:{payload['workspace_id']}:{revision}:{state}"
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _rpc(name: str, params: dict, *, rpc=None, timeout: float = 3.0):
    """Chama uma RPC do PostgreSQL. `rpc` permite injetar transporte nos testes."""
    if rpc is None:
        import requests
        url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        if not url or not key:
            raise ValueError("Supabase não configurado para a outbox")
        response = requests.post(
            f"{url}/rest/v1/rpc/{name}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=params,
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()
    return rpc(name, params)


def _rpc_scalar(value):
    """PostgREST devolve escalares como valor JSON simples."""
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = next(iter(value.values()), None)
    return value


def enqueue(ticket, *, rpc=None) -> str:
    """Grava o pedido de agendamento; devolve o job_id canônico (idempotente)."""
    if not eligible_ticket(ticket):
        raise ValueError("chamado não elegível")
    scope = parse_payload({
        "ticket_id": ticket.get("id"),
        "workspace_id": ticket.get("workspace_id"),
        "job_id": str(uuid.uuid4()),
    })
    result = _rpc(
        OUTBOX_RPC_ENQUEUE,
        {
            "p_job_id": scope["job_id"],
            "p_ticket_id": scope["ticket_id"],
            "p_workspace_id": scope["workspace_id"],
            "p_cycle_key": cycle_key(ticket),
        },
        rpc=rpc,
    )
    job_id = _rpc_scalar(result)
    if not job_id:
        raise ValueError("outbox não devolveu job_id")
    return _canonical_uuid(str(job_id))


def schedule(ticket, *, enqueue_fn=None, rpc=None) -> bool:
    """Somente persiste no PostgreSQL; nunca chama o QStash no request."""
    if not enabled() or not eligible_ticket(ticket):
        return False
    try:
        if enqueue_fn is not None:
            enqueue_fn(ticket)
        else:
            enqueue(ticket, rpc=rpc)
        return True
    except Exception as exc:
        # Nenhum segredo é registrado: somente a classe da exceção e os IDs
        # internos. A falha é explícita, nunca silenciosa.
        LOGGER.error(
            "[chamados-workflow] falha ao gravar outbox de agendamento "
            "(ticket=%s workspace=%s): %s",
            ticket.get("id"), ticket.get("workspace_id"), type(exc).__name__,
        )
        return False


def reconcile_missing(*, rpc=None, interval_seconds: int = RECONCILE_INTERVAL_SECONDS,
                      lookback_minutes: int = RECONCILE_LOOKBACK_MINUTES,
                      limit: int = RECONCILE_LIMIT) -> dict:
    """Recupera gravações perdidas da outbox sem depender do request original.

    A falha temporária do Supabase na criação do chamado não impede a criação
    em si. Este passo roda no dispatcher: um tick atômico no PostgreSQL limita
    a varredura a uma janela pequena e indexada, e a RPC de enqueue faz dedup
    por chamado+ciclo. Nenhum chamado é duplicado e nenhum QStash é chamado.
    """
    result = {"checked": 0, "enqueued": 0, "error": None, "skipped": False}
    if not enabled():
        result["skipped"] = True
        return result
    try:
        ticked = bool(_rpc_scalar(_rpc(
            OUTBOX_RPC_RECONCILE_TICK,
            {"p_interval_seconds": max(60, min(interval_seconds, 86400))},
            rpc=rpc,
        )))
    except Exception as exc:
        result["error"] = type(exc).__name__
        LOGGER.warning("[chamados-workflow] tick de reconciliação falhou: %s", type(exc).__name__)
        return result
    if not ticked:
        result["skipped"] = True
        return result

    try:
        rows = _rpc(
            OUTBOX_RPC_RECONCILE_CANDIDATES,
            {
                "p_lookback_minutes": max(1, min(lookback_minutes, 10080)),
                "p_limit": max(1, min(limit, 50)),
            },
            rpc=rpc,
        )
    except Exception as exc:
        result["error"] = type(exc).__name__
        LOGGER.warning("[chamados-workflow] varredura de reconciliação falhou: %s", type(exc).__name__)
        return result
    if not isinstance(rows, list):
        rows = []
    result["checked"] = len(rows)
    for row in rows:
        ticket = {
            "id": row.get("ticket_id"),
            "workspace_id": row.get("workspace_id"),
            "status": row.get("status") or "aberto",
            "assignedToUserId": row.get("assigned_to_user_id") or "",
            "updatedAt": row.get("updated_at") or "",
        }
        try:
            enqueue(ticket, rpc=rpc)
            result["enqueued"] += 1
        except Exception as exc:
            # Nunca expor dados do chamado ou segredos: só a classe da falha.
            LOGGER.warning("[chamados-workflow] reconciliação falhou: %s", type(exc).__name__)
            result["error"] = type(exc).__name__
    return result


def current_job(ticket_id: str, workspace_id: str, *, rpc=None) -> str:
    """Ciclo vigente segundo o PostgreSQL; '' significa 'sem agendamento'.

    Falhas de leitura propagate: a etapa do Workflow deve falhar e repetir,
    nunca seguir com um ciclo não confirmado.
    """
    scope = parse_payload({
        "ticket_id": ticket_id,
        "workspace_id": workspace_id,
        "job_id": str(uuid.uuid4()),
    })
    result = _rpc(
        OUTBOX_RPC_CURRENT,
        {"p_ticket_id": scope["ticket_id"], "p_workspace_id": scope["workspace_id"]},
        rpc=rpc,
        timeout=2.0,
    )
    value = _rpc_scalar(result)
    return _canonical_uuid(str(value)) if value else ""


def claim_pending(limit: int = DEFAULT_DISPATCH_BATCH, *, rpc=None, worker_id="labhub-dispatch") -> list:
    rows = _rpc(
        OUTBOX_RPC_CLAIM,
        {"p_worker_id": worker_id, "p_limit": max(1, min(limit, 25)), "p_lease_seconds": 120},
        rpc=rpc,
    )
    return rows if isinstance(rows, list) else []


def mark_published(job_id: str, lock_token: str, *, rpc=None) -> bool:
    result = _rpc(
        OUTBOX_RPC_MARK,
        {"p_job_id": job_id, "p_lock_token": lock_token},
        rpc=rpc,
    )
    return bool(_rpc_scalar(result))


def release(job_id: str, lock_token: str, error_class: str, *, rpc=None) -> str:
    """Devolve 'pending', 'dead' ou '' (token inválido)."""
    result = _rpc(
        OUTBOX_RPC_RELEASE,
        {
            "p_job_id": job_id,
            "p_lock_token": lock_token,
            "p_error": error_class[:200],
            "p_delay_seconds": 15,
        },
        rpc=rpc,
    )
    return str(_rpc_scalar(result) or "")


def _qstash_client(config: dict):
    """Cliente QStash com timeouts e bypass restrito a Preview protegida.

    Produção usa o domínio oficial sem Deployment Protection, portanto NÃO
    pode injetar um header de bypass. Em Preview, a proteção exige o header
    tanto no publish individual quanto em cada mensagem de /v2/batch
    (context.sleep e demais retomadas).
    """
    from qstash import QStash
    import httpx

    client = QStash(token=config["QSTASH_TOKEN"], retry=False)
    bypass = config.get(VERCEL_BYPASS_ENV)
    if bypass:
        original_request = client.http.request
        forwarded = QSTASH_FORWARD_PREFIX + VERCEL_BYPASS_HEADER

        def request_with_bypass(*args, **kwargs):
            headers = dict(kwargs.get("headers") or {})
            headers[forwarded] = bypass
            kwargs["headers"] = headers
            if str(kwargs.get("path", "")).startswith("/v2/batch") and kwargs.get("body"):
                try:
                    batch = json.loads(kwargs["body"])
                    if not isinstance(batch, list):
                        raise ValueError("batch não é uma lista")
                    for message in batch:
                        if not isinstance(message, dict):
                            raise ValueError("mensagem de batch inválida")
                        message_headers = dict(message.get("headers") or {})
                        message_headers[forwarded] = bypass
                        message["headers"] = message_headers
                    kwargs["body"] = json.dumps(batch)
                except (TypeError, ValueError) as exc:
                    # A Preview não pode deixar passos sem bypass.
                    raise ValueError("corpo de batch QStash inesperado") from exc
            return original_request(*args, **kwargs)

        client.http.request = request_with_bypass

    # A SDK usa 600s por padrão; o dispatcher precisa devolver rápido.
    client.http._client = httpx.Client(
        timeout=httpx.Timeout(
            PUBLISH_TIMEOUT_SECONDS, connect=PUBLISH_CONNECT_TIMEOUT_SECONDS
        )
    )
    return client


def publish_pending(config: dict, row: dict, *, publish=None) -> None:
    """Publica uma linha reclamada. `publish` é injetável nos testes."""
    payload = parse_payload({
        "ticket_id": row["ticket_id"],
        "workspace_id": row["workspace_id"],
        "job_id": row["job_id"],
    })
    if publish is None:
        publish = _qstash_client(config).message.publish_json
    publish(
        url=config["url"],
        body=payload,
        # Estável por job/ciclo: até uma republicação ambígua não cria outro run.
        deduplication_id=f"labhub-reminder-{payload['job_id']}",
        retries=0,
        redact={"body": True},
        timeout=f"{int(PUBLISH_TIMEOUT_SECONDS)}s",
    )


def drain_pending(*, limit: int = DEFAULT_DISPATCH_BATCH, rpc=None, publish=None,
                  worker_id="labhub-dispatch") -> dict:
    """Recupera agendamentos pendentes com lote limitado e backoff no banco."""
    result = {
        "enabled": True, "claimed": 0, "published": 0,
        "retried": 0, "dead": 0, "error": None,
        "reconciled": 0, "reconcile_error": None,
    }
    if not enabled():
        result["enabled"] = False
        return result
    try:
        config = _config()
    except Exception as exc:
        result["error"] = type(exc).__name__
        LOGGER.warning("[chamados-workflow] dispatcher indisponível: %s", type(exc).__name__)
        return result

    # Reconciliação durável: cobre falha de gravação da outbox no request.
    try:
        recovery = reconcile_missing(rpc=rpc)
        result["reconciled"] = recovery["checked"]
        result["reconcile_error"] = recovery["error"]
    except Exception as exc:
        result["reconcile_error"] = type(exc).__name__

    try:
        rows = claim_pending(limit, rpc=rpc, worker_id=worker_id)
    except Exception as exc:
        result["error"] = type(exc).__name__
        LOGGER.warning("[chamados-workflow] dispatcher indisponível: %s", type(exc).__name__)
        return result

    result["claimed"] = len(rows)
    for row in rows:
        try:
            publish_pending(config, row, publish=publish)
            if mark_published(row["job_id"], row["lock_token"], rpc=rpc):
                result["published"] += 1
            else:
                LOGGER.warning("[chamados-workflow] confirmação perdida para job %s", row["job_id"])
                result["retried"] += 1
        except Exception as exc:
            error_class = type(exc).__name__
            outcome = release(row["job_id"], row["lock_token"], error_class, rpc=rpc)
            if outcome == "dead":
                result["dead"] += 1
                LOGGER.error(
                    "[chamados-workflow] agendamento %s esgotou %s tentativas: %s",
                    row["job_id"], MAX_PUBLISH_ATTEMPTS, error_class,
                )
            else:
                result["retried"] += 1
                LOGGER.warning("[chamados-workflow] publicação falhou: %s", error_class)
    return result


def register(app, process_one, *, interval_seconds: int, current_job_fn=None) -> bool:
    """Registra a rota assinada somente quando o experimento está habilitado.

    A checagem de cada onda acontece DENTRO de ``context.run``: um resultado
    com erro lança exceção dentro da etapa, que não é persistida como sucesso.
    Toda revalidação/lock/dedup segue no PostgreSQL.
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
    current_job_fn = current_job_fn or current_job

    # Redação defensiva: mesmo que alguma lib inclua o header em uma exceção,
    # o valor nunca aparece em log. A URL continua sem query parameter.
    if config.get(VERCEL_BYPASS_ENV):
        redactor = _RedactBypassFilter(config[VERCEL_BYPASS_ENV])
        logging.getLogger().addFilter(redactor)
        logging.getLogger("werkzeug").addFilter(redactor)

    # `Serve.route` (upstash-workflow 2.0.0) não expõe `redact`; o payload já
    # contém somente UUIDs, e a publicação usa `redact={"body": True}` no
    # QStash. A URL é fixa e prevalece sobre qualquer Host/request.url. O
    # cliente injeta o bypass em todas as etapas, sem poluir a URL.
    @serve.route(
        WORKFLOW_PATH,
        qstash_client=_qstash_client(config),
        receiver=receiver,
        initial_payload_parser=json.loads,
        url=config["url"],
    )
    def chamados_reminder_workflow(context):
        payload = parse_payload(context.request_payload)
        for wave in range(1, MAX_WORKFLOW_CHECKS + 1):
            # Sleep durável: não segura uma função Vercel aberta por 2 minutos.
            context.sleep(f"aguardar-onda-{wave}", interval_seconds)

            def check(job_id=payload["job_id"]):
                result = process_one(
                    payload["ticket_id"], payload["workspace_id"], job_id
                )
                if not isinstance(result, dict) or result.get("error"):
                    # Erro precisa acontecer AQUI: se for lançado depois do
                    # context.run, a SDK grava a etapa como bem-sucedida.
                    raise RuntimeError("verificação de lembrete falhou")
                expected = current_job_fn(
                    payload["ticket_id"], payload["workspace_id"]
                )
                if not expected or expected != job_id or result.get("stale_cycle"):
                    return {"stop": True}
                return {"stop": result.get("candidate_count", 0) == 0}

            step = context.run(f"verificar-onda-{wave}", check)
            if step.get("stop"):
                return

    return True
