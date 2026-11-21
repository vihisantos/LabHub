"""E2E opt-in das três ondas (2/4/6 min) do Workflow de chamados no Staging.

Executa dois cenários em workspaces sintéticos e isolados:

  * ``unassigned``: acompanha as três checagens sem atribuir o chamado;
  * ``assigned``: atribui a um técnico sintético depois da primeira onda e
    comprova que as checagens seguintes não encontram candidato.

O script NÃO altera a integração QStash. Ele usa o mesmo dispatcher protegido
do E2E existente e registra janelas ISO para correlação com logs da Vercel e
com o painel do QStash. Toda escrita passa pelo fail-closed de Staging e usa
somente UUIDs canônicos e slug ``wf-e2e-``.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from chamados_workflow_e2e_staging import (
    _dispatch_url,
    _required,
    _staging_api,
    workflow,
)

SCENARIOS = ("both", "unassigned", "assigned")
WAVE_INTERVAL_SECONDS = 120


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _canonical(value: str, label: str) -> str:
    text = str(value or "").strip()
    try:
        parsed = uuid.UUID(text)
    except (ValueError, AttributeError, TypeError) as exc:
        raise SystemExit(f"{label} inválido") from exc
    if str(parsed) != text.lower():
        raise SystemExit(f"{label} não canônico")
    return str(parsed)


def _scenario() -> str:
    value = os.environ.get("WAVE_SCENARIO", "both").strip().lower()
    if value not in SCENARIOS:
        raise SystemExit("WAVE_SCENARIO deve ser both, unassigned ou assigned")
    return value


def _wave_margin() -> int:
    raw = os.environ.get("E2E_WAVE_MARGIN_SECONDS", "45").strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise SystemExit("E2E_WAVE_MARGIN_SECONDS inválido") from exc
    if not 10 <= value <= 90:
        raise SystemExit("E2E_WAVE_MARGIN_SECONDS fora da faixa 10..90")
    return value


def _ticket_number() -> int:
    return 900000 + int.from_bytes(uuid.uuid4().bytes[:3], "big") % 100000


def _create_case(api, scenario: str) -> dict:
    workspace_id = str(uuid.uuid4())
    ticket_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    slug = "wf-e2e-" + uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    ticket_number = _ticket_number()
    cycle_key = workflow.cycle_key({
        "id": ticket_id,
        "workspace_id": workspace_id,
        "status": "aberto",
        "assignedToUserId": "",
        "updatedAt": now,
    })

    api.query(
        "INSERT INTO public.workspaces (id, name, slug) "
        f"VALUES ('{workspace_id}'::uuid, 'Workflow Waves E2E', '{slug}');"
    )
    api.query(
        'INSERT INTO public.chamados_tickets '
        '(id, "workspace_id", "roomName", "problemDescription", status, '
        '"assignedToUserId", "ticketNumber", "createdAt", "updatedAt") '
        f"VALUES ('{ticket_id}'::uuid, '{workspace_id}'::uuid, 'E2E Ondas', "
        f"'Workflow Staging', 'aberto', '', {ticket_number}, "
        f"'{now}'::timestamptz, '{now}'::timestamptz);"
    )
    api.query(
        "SELECT public.chamados_workflow_outbox_enqueue("
        f"'{job_id}'::uuid, '{ticket_id}'::uuid, '{workspace_id}'::uuid, '{cycle_key}');"
    )
    case = {
        "scenario": scenario,
        "workspace_id": workspace_id,
        "ticket_id": ticket_id,
        "job_id": job_id,
        "ticket_number": ticket_number,
        "cycle_key": cycle_key,
    }
    print("[waves] caso " + json.dumps(case, sort_keys=True), flush=True)
    return case


def _dispatch(url: str, cron_secret: str, bypass: str) -> None:
    request = Request(
        url,
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
    if status != 200 or result.get("error") or result.get("enabled") is not True:
        raise SystemExit("dispatcher não publicou; abortando.")
    print(
        "[waves] dispatcher "
        + json.dumps(
            {
                "http": status,
                "claimed": result.get("claimed"),
                "published": result.get("published"),
                "reconciled": result.get("reconciled"),
                "reconcile_error": result.get("reconcile_error"),
            },
            sort_keys=True,
        ),
        flush=True,
    )


def _wait_published(api, case: dict) -> str:
    job = case["job_id"]
    deadline = time.monotonic() + 90
    row = {}
    while time.monotonic() < deadline:
        rows = api.query(
            "SELECT status, attempts, published_at, last_error "
            f"FROM public.chamados_workflow_outbox WHERE job_id = '{job}'::uuid;"
        ) or []
        row = rows[0] if rows else {}
        if row.get("status") == "published":
            print(
                "[waves] publicação REAL confirmada "
                + json.dumps(
                    {
                        "tentativas": row.get("attempts"),
                        "publicado_em": row.get("published_at"),
                    },
                    sort_keys=True,
                ),
                flush=True,
            )
            return str(row.get("published_at") or _iso())
        if row.get("status") == "dead":
            break
        time.sleep(3)
    raise SystemExit(f"outbox não confirmou publicação: status={row.get('status')!r}")


def _snapshot(api, case: dict, label: str) -> dict:
    ticket = case["ticket_id"]
    workspace = case["workspace_id"]
    job = case["job_id"]
    rows = api.query(
        "WITH current_job AS (\n"
        "  SELECT job_id FROM public.chamados_workflow_outbox\n"
        f"  WHERE ticket_id = '{ticket}'::uuid AND workspace_id = '{workspace}'::uuid\n"
        "  ORDER BY created_at DESC, job_id DESC LIMIT 1\n"
        "), marks AS (\n"
        "  SELECT wave FROM public.chamado_reminder_sent_marks\n"
        f"  WHERE ticket_id = '{ticket}'::uuid\n"
        ")\n"
        "SELECT\n"
        "  (SELECT job_id FROM current_job) AS current_job,\n"
        "  (SELECT status FROM public.chamados_workflow_outbox "
        f"WHERE job_id = '{job}'::uuid) AS outbox_status,\n"
        "  (SELECT published_at FROM public.chamados_workflow_outbox "
        f"WHERE job_id = '{job}'::uuid) AS published_at,\n"
        "  (SELECT count(*) FROM public.chamado_reminder_states "
        f"WHERE ticket_id = '{ticket}'::uuid) AS state_rows,\n"
        "  (SELECT coalesce(max(reminder_count), 0) FROM public.chamado_reminder_states "
        f"WHERE ticket_id = '{ticket}'::uuid) AS reminder_count,\n"
        "  (SELECT count(*) FROM marks) AS sent_marks,\n"
        "  (SELECT coalesce(array_agg(DISTINCT wave ORDER BY wave), '{}'::int[]) "
        "FROM marks) AS mark_waves,\n"
        "  (SELECT count(*) FROM public.ticket_events "
        f"WHERE ticket_id = '{ticket}'::uuid) AS ticket_events,\n"
        "  (SELECT count(*) FROM public.chamado_push_subscriptions "
        f"WHERE ticket_id = '{ticket}'::uuid) AS push_subscriptions,\n"
        "  (SELECT status FROM public.chamados_tickets "
        f"WHERE id = '{ticket}'::uuid) AS ticket_status,\n"
        "  (SELECT \"assignedToUserId\" FROM public.chamados_tickets "
        f"WHERE id = '{ticket}'::uuid) AS assignee,\n"
        "  (SELECT \"updatedAt\" FROM public.chamados_tickets "
        f"WHERE id = '{ticket}'::uuid) AS ticket_updated_at;\n"
    )
    result = rows[0] if rows else {}
    result["label"] = label
    result["observed_at"] = _iso()
    print("[waves] snapshot " + json.dumps(result, sort_keys=True, default=str), flush=True)
    return result


def _assign(api, case: dict) -> str:
    technician_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    api.query(
        'UPDATE public.chamados_tickets SET "assignedToUserId" = '
        f"'{technician_id}'::text, \"updatedAt\" = '{now}'::timestamptz "
        f"WHERE id = '{case['ticket_id']}'::uuid "
        f"AND \"workspace_id\" = '{case['workspace_id']}'::uuid "
        "AND \"assignedToUserId\" = '';"
    )
    print(f"[waves] atribuição aplicada após a primeira onda em {_iso()}", flush=True)
    return technician_id


def _wait_until(target: float, label: str) -> None:
    remaining = target - time.monotonic()
    if remaining > 0:
        time.sleep(remaining)
    print(f"[waves] {label} observada em {_iso()}", flush=True)


def _assert_snapshot(snapshot: dict, case: dict, label: str) -> None:
    if snapshot.get("current_job") != case["job_id"]:
        raise SystemExit(f"{label}: ciclo vigente divergente")
    if snapshot.get("outbox_status") != "published":
        raise SystemExit(f"{label}: outbox não está publicada")
    if snapshot.get("ticket_status") != "aberto":
        raise SystemExit(f"{label}: ticket saiu de 'aberto'")


def _run_case(api, url: str, cron_secret: str, bypass: str, scenario: str, margin: int) -> dict:
    case = _create_case(api, scenario)
    _dispatch(url, cron_secret, bypass)
    published_at = _wait_published(api, case)
    start = time.monotonic()

    print(
        "[waves] janela de correlação "
        + json.dumps(
            {
                "scenario": scenario,
                "ticket_number": case["ticket_number"],
                "published_at": published_at,
                "expected_waves_at": [
                    (datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                     .timestamp() + WAVE_INTERVAL_SECONDS * wave)
                    for wave in (1, 2, 3)
                ],
            },
            sort_keys=True,
            default=str,
        ),
        flush=True,
    )

    snapshots = []
    technician_id = ""
    baseline_after_assignment = None
    for wave in (1, 2, 3):
        _wait_until(start + WAVE_INTERVAL_SECONDS * wave + margin, f"onda {wave}")
        snapshot = _snapshot(api, case, f"onda-{wave}")
        _assert_snapshot(snapshot, case, f"onda {wave}")
        snapshots.append(snapshot)

        if wave == 1 and scenario == "assigned":
            technician_id = _assign(api, case)
            baseline_after_assignment = _snapshot(api, case, "pos-atribuicao")

    if scenario == "unassigned":
        if any(str(s.get("assignee") or "") for s in snapshots):
            raise SystemExit("cenário não assumido recebeu responsável")
    else:
        if not technician_id or baseline_after_assignment is None:
            raise SystemExit("atribuição da primeira onda não foi registrada")
        immutable = (
            "state_rows", "reminder_count", "sent_marks",
            "mark_waves", "ticket_events", "push_subscriptions",
        )
        for snapshot in snapshots[1:]:
            if str(snapshot.get("assignee") or "") != technician_id:
                raise SystemExit("atribuição sintética divergente")
            for key in immutable:
                if snapshot.get(key) != baseline_after_assignment.get(key):
                    raise SystemExit(
                        f"onda após atribuição alterou {key}: "
                        f"{baseline_after_assignment.get(key)!r} -> {snapshot.get(key)!r}"
                    )

    print(
        "[waves] resultado "
        + json.dumps(
            {
                "scenario": scenario,
                "ticket_number": case["ticket_number"],
                "ondas_observadas": len(snapshots),
                "marcas_de_envio": [s.get("sent_marks") for s in snapshots],
                "contadores_de_lembrete": [s.get("reminder_count") for s in snapshots],
            },
            sort_keys=True,
        ),
        flush=True,
    )
    return case


def main() -> int:
    scenario = _scenario()
    margin = _wave_margin()
    api = _staging_api()
    url = _dispatch_url()
    cron_secret = _required("CRON_SECRET")
    bypass = _required("VERCEL_AUTOMATION_BYPASS_SECRET")

    selected = SCENARIOS[1:] if scenario == "both" else (scenario,)
    cases = [_run_case(api, url, cron_secret, bypass, name, margin) for name in selected]

    if os.environ.get("KEEP_E2E_DATA", "").strip().lower() in ("1", "true", "yes"):
        print("[waves] dados sintéticos preservados (KEEP_E2E_DATA).", flush=True)
    else:
        cleanup = ",".join(
            ":".join((c["workspace_id"], c["ticket_id"], c["job_id"])) for c in cases
        )
        print(f"[waves] CLEANUP_IDS={cleanup}", flush=True)
        for case in cases:
            api.query(
                "DELETE FROM public.chamados_workflow_outbox "
                f"WHERE job_id = '{case['job_id']}'::uuid;"
            )
            api.query(
                'DELETE FROM public.chamados_tickets '
                f"WHERE id = '{case['ticket_id']}'::uuid;"
            )
            api.query(
                "DELETE FROM public.workspaces "
                f"WHERE id = '{case['workspace_id']}'::uuid AND slug LIKE 'wf-e2e-%';"
            )
        print("[waves] dados sintéticos removidos.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
