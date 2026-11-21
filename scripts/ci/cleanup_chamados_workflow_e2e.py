"""Limpeza controlada dos dados sintéticos deixados por E2Es preservados.

Uso: E2E_CLEANUP_IDS="workspace:ticket:job[,workspace:ticket:job...]"

As mesmas barreiras de `apply_staging_migration.py` são aplicadas via
`_staging_api()`. Nenhuma exclusão acontece se o workspace não tiver o prefixo
`wf-e2e-`, garantindo que dados reais de Staging nunca sejam apagados.
"""

from __future__ import annotations

import os
import uuid

from chamados_workflow_e2e_staging import _staging_api


def _canonical_uuid(value: str, label: str) -> str:
    value = value.strip()
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise SystemExit(f"{label} inválido: {value!r}") from exc
    if str(parsed) != value.lower():
        raise SystemExit(f"{label} não canônico: {value!r}")
    return str(parsed)


def main() -> int:
    raw = os.environ.get("E2E_CLEANUP_IDS", "").strip()
    if not raw:
        raise SystemExit("E2E_CLEANUP_IDS vazio; nada foi removido.")
    api = _staging_api()
    removed = 0
    for item in raw.split(","):
        parts = item.strip().split(":")
        if len(parts) != 3:
            raise SystemExit("item de limpeza deve ser workspace:ticket:job")
        workspace_id = _canonical_uuid(parts[0], "workspace")
        ticket_id = _canonical_uuid(parts[1], "ticket")
        job_id = _canonical_uuid(parts[2], "job")

        rows = api.query(
            "SELECT slug FROM public.workspaces "
            f"WHERE id = '{workspace_id}'::uuid;"
        ) or []
        if not rows or not str(rows[0].get("slug") or "").startswith("wf-e2e-"):
            raise SystemExit(
                f"workspace {workspace_id} não é sintético (wf-e2e-); abortando."
            )

        api.query(
            "DELETE FROM public.chamados_workflow_outbox "
            f"WHERE job_id = '{job_id}'::uuid AND ticket_id = '{ticket_id}'::uuid;"
        )
        api.query(
            'DELETE FROM public.chamados_tickets '
            f"WHERE id = '{ticket_id}'::uuid AND \"workspace_id\" = '{workspace_id}'::uuid;"
        )
        api.query(
            "DELETE FROM public.workspaces "
            f"WHERE id = '{workspace_id}'::uuid AND slug LIKE 'wf-e2e-%';"
        )
        removed += 1
        print(f"[cleanup] removido ws={workspace_id} ticket={ticket_id} job={job_id}")

    print(f"[cleanup] {removed} conjunto(s) sintético(s) removido(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
