"""E2E opt-in: publicação REAL no QStash a partir da Preview protegida.

Este script NÃO é um teste simulado. Ele usa o token de Management API do
Supabase **Staging** (com as mesmas barreiras de `apply_staging_migration.py`)
para criar um chamado sintético em um workspace isolado, enfileira a outbox e
pede ao dispatcher da Preview que publique de verdade no QStash. A confirmação
`status='published'` só acontece depois que `publish_json` retorna 2xx.

Nenhum segredo é impresso. A URL da Preview é validada contra `.vercel.app` e
o caminho exato do dispatcher; o bypass é enviado somente como header.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

_SCRIPTS = Path(__file__).resolve().parents[1]
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from migrate.api import ManagementAPI  # noqa: E402
from migrate.environment import TargetEnvironmentError, TargetPolicy, validate_project_ref  # noqa: E402

_API_SRC = _SCRIPTS.parent / "src" / "apps" / "reservalab" / "api"
if str(_API_SRC) not in sys.path:
    sys.path.insert(0, str(_API_SRC))
import chamados_workflow as workflow  # noqa: E402

_REF_RE = re.compile(r"^[a-z0-9]{20}$")
DISPATCH_PATH = "/api/chamados/workflow/outbox/dispatch"


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} não configurado; nenhuma requisição foi feita.")
    return value


def _staging_api() -> ManagementAPI:
    ref = _required("SUPABASE_STAGING_PROJECT_REF")
    token = _required("SUPABASE_STAGING_ACCESS_TOKEN")
    allowed = tuple(
        p.strip()
        for p in _required("SUPABASE_STAGING_ALLOWED_PROJECT_REFS").split(",")
        if p.strip()
    )
    hard_coded = tuple(
        p.strip() for p in os.environ.get("STAGING_PROJECT_REFS", "").split(",") if p.strip()
    )
    if not _REF_RE.match(ref) or ref not in allowed:
        raise SystemExit("SUPABASE_STAGING_PROJECT_REF não autorizado como Staging; abortando.")
    if hard_coded and ref not in hard_coded:
        raise SystemExit("Allowlist do workflow diverge da allowlist de Staging; abortando.")
    try:
        validate_project_ref(
            ref,
            TargetPolicy(
                target="production",  # só para ativar o enforcement de allowlist
                require_baseline=False,
                allowed_project_refs=allowed,
                enforce_allowlist=True,
            ),
        )
    except TargetEnvironmentError as exc:
        raise SystemExit(f"Destino rejeitado: {exc}") from exc
    return ManagementAPI(access_token=token, project_ref=ref)


def _dispatch_url() -> str:
    value = _required("PREVIEW_DISPATCH_URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".vercel.app")
        or parsed.path != DISPATCH_PATH
        or parsed.query
        or parsed.username
        or parsed.password
    ):
        raise SystemExit("URL de dispatch inválida ou de produção; abortando.")
    return value


def main() -> int:
    api = _staging_api()
    dispatch_url = _dispatch_url()
    cron_secret = _required("CRON_SECRET")
    bypass = _required("VERCEL_AUTOMATION_BYPASS_SECRET")

    workspace_id = str(uuid.uuid4())
    ticket_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    slug = "wf-e2e-" + uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    cycle_key = workflow.cycle_key({
        "id": ticket_id,
        "workspace_id": workspace_id,
        "status": "aberto",
        "assignedToUserId": "",
        "updatedAt": now,
    })

    api.query(
        "INSERT INTO public.workspaces (id, name, slug) "
        f"VALUES ('{workspace_id}'::uuid, 'Workflow E2E', '{slug}');"
    )
    api.query(
        'INSERT INTO public.chamados_tickets '
        '(id, "workspace_id", "roomName", "problemDescription", status, '
        '"assignedToUserId", "ticketNumber", "createdAt", "updatedAt") '
        f"VALUES ('{ticket_id}'::uuid, '{workspace_id}'::uuid, 'E2E', 'Workflow Staging', "
        f"'aberto', '', 999999, '{now}'::timestamptz, '{now}'::timestamptz);"
    )
    api.query(
        "SELECT public.chamados_workflow_outbox_enqueue("
        f"'{job_id}'::uuid, '{ticket_id}'::uuid, '{workspace_id}'::uuid, '{cycle_key}');"
    )
    print(f"[e2e] workspace sintético={workspace_id} ticket={ticket_id} job={job_id}", flush=True)

    request = Request(
        dispatch_url,
        data=b"",
        method="POST",
        headers={
            "Authorization": f"Bearer {cron_secret}",
            workflow.VERCEL_BYPASS_HEADER: bypass,
        },
    )
    with urlopen(request, timeout=60) as response:
        status = response.status
        result = json.load(response)
    print(f"[e2e] dispatcher HTTP={status} resultado={result}", flush=True)
    if status != 200 or result.get("error") or not result.get("enabled"):
        raise SystemExit("dispatcher não publicou; abortando.")

    deadline = time.monotonic() + 90
    published = False
    while time.monotonic() < deadline:
        rows = api.query(
            "SELECT status, attempts, published_at, last_error "
            f"FROM public.chamados_workflow_outbox WHERE job_id = '{job_id}'::uuid;"
        ) or []
        if rows and rows[0].get("status") == "published":
            published = True
            print(
                f"[e2e] publicação REAL confirmada: tentativas={rows[0].get('attempts')} "
                f"publicado_em={rows[0].get('published_at')}",
                flush=True,
            )
            break
        time.sleep(3)
    if not published:
        raise SystemExit(f"outbox não confirmou publicação: {rows}")

    # A SDK do workflow faz a primeira retomada após REMINDER_INTERVAL_SECONDS.
    # Esperar um pouco deixa o QStash chamar a rota assinada na Preview e prova
    # que o header de bypass sobreviveu a todas as etapas.
    wait = int(os.environ.get("E2E_OBSERVE_SECONDS", "150"))
    print(f"[e2e] observando retomadas por {wait}s (sem secreto em log)", flush=True)
    time.sleep(wait)

    if os.environ.get("KEEP_E2E_DATA", "").strip().lower() not in ("1", "true", "yes"):
        api.query(f"DELETE FROM public.chamados_workflow_outbox WHERE job_id = '{job_id}'::uuid;")
        api.query(f"DELETE FROM public.chamados_tickets WHERE id = '{ticket_id}'::uuid;")
        api.query(f"DELETE FROM public.workspaces WHERE id = '{workspace_id}'::uuid;")
        print("[e2e] dados sintéticos removidos.", flush=True)
    else:
        print("[e2e] dados sintéticos preservados (KEEP_E2E_DATA).", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
