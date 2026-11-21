"""Importador idempotente do snapshot Redis -> PostgreSQL (somente Staging).

O destino é fail-closed: exige SUPABASE_STAGING_PROJECT_REF igual ao projeto
de Staging autorizado, token de acesso e allowlist compatível. Nenhum segredo
é logado. Por padrão o script é dry-run; ``--apply`` é obrigatório para
escrever. Nenhuma chave Redis é apagada ou modificada.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping

try:
    from migrate.api import ManagementAPI
except ImportError:  # execução direta: python scripts/migrate/redis_import.py
    from api import ManagementAPI  # type: ignore[no-redef]

try:
    from .redis_contract import (  # importado como pacote
        ADVISORY_IMPORT_KEY,
        CATEGORIES,
        Divergence,
        ImportPlan,
        Snapshot,
        affected_tickets,
        affected_workspaces,
        build_import_plan,
        build_sql,
        count_queries,
        table_check_query,
        ticket_check_query,
        workspace_check_query,
    )
except ImportError:  # execução direta
    from redis_contract import (  # type: ignore[no-redef]
        ADVISORY_IMPORT_KEY,
        CATEGORIES,
        Divergence,
        ImportPlan,
        Snapshot,
        affected_tickets,
        affected_workspaces,
        build_import_plan,
        build_sql,
        count_queries,
        table_check_query,
        ticket_check_query,
        workspace_check_query,
    )

STAGING_REF = "pgmetdqsdjotdcifjivu"
FORBIDDEN_REFS = frozenset({
    "ypkulvbllxgkjzhpzemf",
    "hvqxantwqwarqhymnyqb",
    "obskpmnphevpaexooldg",
})
REF_RE = re.compile(r"^[a-z0-9]{20}$")
_BATCH = 200


class DestinationError(RuntimeError):
    """Destino não autorizado ou contrato ausente — nenhuma escrita ocorreu."""


def resolve_destination() -> tuple[str, str]:
    ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "").strip()
    token = os.environ.get("SUPABASE_STAGING_ACCESS_TOKEN", "").strip()
    raw_allowed = os.environ.get("SUPABASE_STAGING_ALLOWED_PROJECT_REFS", "").strip()
    allowed = {r.strip() for r in raw_allowed.split(",") if r.strip()} if raw_allowed else {STAGING_REF}

    if not REF_RE.fullmatch(ref):
        raise DestinationError("SUPABASE_STAGING_PROJECT_REF inválido")
    if ref in FORBIDDEN_REFS:
        raise DestinationError("projeto de produção/legado recusado pelo importador")
    if ref != STAGING_REF or ref not in allowed:
        raise DestinationError("ref de destino divergente do Staging autorizado")
    if not token:
        raise DestinationError("SUPABASE_STAGING_ACCESS_TOKEN ausente")
    return ref, token


def _rows(api: Any, sql: str) -> list[Mapping]:
    result = api.query(sql) or []
    return [row for row in result if isinstance(row, Mapping)] if isinstance(result, list) else []


def _count_rows(api: Any) -> dict[str, int]:
    result: dict[str, int] = {}
    for category, sql in count_queries().items():
        rows = _rows(api, sql)
        value = rows[0].get("n") if rows else 0
        try:
            result[category] = int(value)
        except (TypeError, ValueError):
            result[category] = 0
    return result


def _check_tables(api: Any) -> None:
    rows = _rows(api, table_check_query())
    if not rows:
        raise DestinationError(" não foi possível inspecionar as tabelas de destino")
    row = rows[0]
    missing = [name for name, value in row.items() if value is None]
    if missing:
        raise DestinationError("tabelas ausentes no destino: " + ", ".join(sorted(missing)))


def _chunks(values: Iterable[str], size: int = _BATCH) -> Iterable[list[str]]:
    batch: list[str] = []
    for value in sorted(set(values)):
        batch.append(value)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _existing_ids(api: Any, sql_builder, values: Iterable[str]) -> set[str]:
    found: set[str] = set()
    for batch in _chunks(values):
        sql = sql_builder(batch)
        if sql is None:
            continue
        for row in _rows(api, sql):
            value = row.get("id")
            if value is not None:
                found.add(str(value))
    return found


def validate_fks(api: Any, plan: ImportPlan) -> ImportPlan:
    """Remove linhas sem FK no destino e registra divergências (fail-closed)."""
    tickets = affected_tickets(plan)
    workspaces = affected_workspaces(plan)
    existing_tickets = _existing_ids(api, ticket_check_query, tickets)
    existing_workspaces = _existing_ids(api, workspace_check_query, workspaces)

    valid_states = []
    for row in plan.states:
        if row["ticket_id"] not in existing_tickets:
            plan.divergences.append(Divergence("reminder_states", "missing_ticket_fk", row.get("source_fingerprint", "")))
            continue
        ws = row.get("workspace_id")
        if ws and ws not in existing_workspaces:
            plan.divergences.append(Divergence("reminder_states", "missing_workspace_fk", row.get("source_fingerprint", "")))
            continue
        valid_states.append(row)
    plan.states = valid_states

    valid_marks = []
    for row in plan.marks:
        if row["ticket_id"] not in existing_tickets:
            plan.divergences.append(Divergence("reminder_marks", "missing_ticket_fk", row.get("source_fingerprint", "")))
            continue
        valid_marks.append(row)
    plan.marks = valid_marks

    valid_chamado_subs = []
    for row in plan.chamado_subscriptions:
        if row["ticket_id"] not in existing_tickets:
            plan.divergences.append(Divergence(
                "chamado_push_subscriptions", "missing_ticket_fk", row.get("source_fingerprint", "")
            ))
            continue
        valid_chamado_subs.append(row)
    plan.chamado_subscriptions = valid_chamado_subs
    return plan


def import_snapshot(snapshot: Snapshot, api: Any, *, apply: bool, ref: str) -> dict[str, Any]:
    """Importa o snapshot e devolve relatório sem dados sensíveis."""
    if ref != STAGING_REF or ref in FORBIDDEN_REFS:
        raise DestinationError("destino recusado")

    _check_tables(api)
    plan = validate_fks(api, build_import_plan(snapshot))
    before = _count_rows(api)

    report: dict[str, Any] = {
        "destination": {"project_ref": ref, "advisory_lock_key": ADVISORY_IMPORT_KEY},
        "dry_run": not apply,
        "source_counts": dict(snapshot.counts),
        "source_integrity": dict(snapshot.source_integrity),
        "plan_counts": plan.counts(),
        "destination_counts_before": before,
        "destination_counts_after": before,
        "inserted": {category: 0 for category in CATEGORIES if category != "reminder_locks_ignored"},
        "divergences": [d.as_dict() for d in plan.divergences],
        "applied": False,
    }

    if not any(plan.counts().values()):
        report["reason"] = "no_valid_rows"
        return report

    if not apply:
        report["reason"] = "dry_run"
        return report

    sql = build_sql(plan)
    api.query(sql)
    after = _count_rows(api)
    report.update({
        "applied": True,
        "destination_counts_after": after,
        "inserted": {
            category: max(0, after[category] - before[category])
            for category in CATEGORIES if category != "reminder_locks_ignored"
        },
    })
    return report


def write_report(report: Mapping[str, Any], path: Path) -> None:
    text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.write("\n")
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def load_snapshot(path: Path) -> Snapshot:
    data = json.loads(path.read_text(encoding="utf-8"))
    return Snapshot.from_dict(data)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, help="JSON gerado por redis_export.py")
    parser.add_argument("--report", help="onde gravar o relatório JSON (0600)")
    parser.add_argument("--apply", action="store_true", help="executa a importação (sem isso é dry-run)")
    args = parser.parse_args(argv)

    try:
        ref, token = resolve_destination()
        snapshot = load_snapshot(Path(args.snapshot))
        api = ManagementAPI(project_ref=ref, access_token=token)
        report = import_snapshot(snapshot, api, apply=args.apply, ref=ref)
        if args.report:
            write_report(report, Path(args.report))
    except Exception as exc:
        print(f"Falha na importação: {exc}", file=sys.stderr)
        return 1

    print(
        "Importação "
        + ("aplicada" if report["applied"] else "em dry-run")
        + f" em {ref}: "
        + " ".join(f"{k}={v}" for k, v in report["plan_counts"].items())
    )
    print(f"Divergências: {len(report['divergences'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
