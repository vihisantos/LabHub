"""Importador idempotente do snapshot Redis -> PostgreSQL.

Staging é o destino padrão e usa exclusivamente as variáveis
``SUPABASE_STAGING_*``. Produção é opt-in via ``--target production`` e exige
variáveis ``SUPABASE_PRODUCTION_*`` próprias, allowlist explícita e a
confirmação ``LABHUB_CONFIRM_PRODUCTION_IMPORT=APPLY_PRODUCTION`` quando
``--apply`` é usado. Nenhuma credencial é logada, nenhuma chave Redis é
apagada ou modificada e o padrão continua sendo dry-run.

Este script é uma etapa operacional FORA do CI/CD: o workflow de migrations
continua aplicando DDL automaticamente após o merge na main.
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
TARGET_STAGING = "staging"
TARGET_PRODUCTION = "production"
TARGETS = (TARGET_STAGING, TARGET_PRODUCTION)
ENV_CONFIRM = "LABHUB_CONFIRM_PRODUCTION_IMPORT"
CONFIRM_VALUE = "APPLY_PRODUCTION"
REF_RE = re.compile(r"^[a-z0-9]{20}$")
_BATCH = 200


class DestinationError(RuntimeError):
    """Destino não autorizado ou contrato ausente — nenhuma escrita ocorreu."""


def resolve_destination(target: str = TARGET_STAGING) -> tuple[str, str, str]:
    """Resolve (ref, token, target) sem misturar variáveis de Staging e Produção."""
    resolved = (target or TARGET_STAGING).strip().lower()
    if resolved not in TARGETS:
        raise DestinationError("alvo desconhecido; use 'staging' ou 'production'")

    prefix = "SUPABASE_STAGING_" if resolved == TARGET_STAGING else "SUPABASE_PRODUCTION_"
    ref = os.environ.get(prefix + "PROJECT_REF", "").strip()
    token = os.environ.get(prefix + "ACCESS_TOKEN", "").strip()
    raw_allowed = os.environ.get(prefix + "ALLOWED_PROJECT_REFS", "").strip()
    allowed = {r.strip() for r in raw_allowed.split(",") if r.strip()} if raw_allowed else set()

    if not REF_RE.fullmatch(ref):
        raise DestinationError(prefix + "PROJECT_REF inválido")

    if resolved == TARGET_STAGING:
        # Comportamento histórico preservado: allowlist vazia significa o ref
        # fixo de Staging, e nenhum ref de produção/legado é aceito aqui.
        allowed = allowed or {STAGING_REF}
        if ref in FORBIDDEN_REFS or ref != STAGING_REF or ref not in allowed:
            raise DestinationError("ref de destino divergente do Staging autorizado")
    else:
        if not allowed:
            raise DestinationError(prefix + "ALLOWED_PROJECT_REFS obrigatório em produção")
        if ref not in allowed:
            raise DestinationError("ref de produção fora da allowlist explícita")
        if ref == STAGING_REF:
            raise DestinationError("ref de Staging recusado como destino de produção")

    if not token:
        raise DestinationError(prefix + "ACCESS_TOKEN ausente")
    return ref, token, resolved


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


def import_snapshot(
    snapshot: Snapshot,
    api: Any,
    *,
    apply: bool,
    ref: str,
    target: str = TARGET_STAGING,
) -> dict[str, Any]:
    """Importa o snapshot e devolve relatório sem dados sensíveis."""
    if target == TARGET_STAGING:
        if ref != STAGING_REF or ref in FORBIDDEN_REFS:
            raise DestinationError("destino recusado pelo alvo staging")
    elif target == TARGET_PRODUCTION:
        if ref == STAGING_REF:
            raise DestinationError("destino de produção não pode ser o Staging")
    else:
        raise DestinationError("alvo desconhecido")

    integrity = dict(snapshot.source_integrity or {})
    if integrity and apply and integrity.get("stable") is not True:
        raise DestinationError("snapshot de origem instável; reexportar com os crons parados")

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
    parser.add_argument(
        "--target",
        choices=TARGETS,
        default=TARGET_STAGING,
        help="destino: staging (padrão) ou production (exige variáveis próprias e confirmação)",
    )
    args = parser.parse_args(argv)

    try:
        ref, token, target = resolve_destination(args.target)
        if args.apply and target == TARGET_PRODUCTION:
            if os.environ.get(ENV_CONFIRM, "").strip() != CONFIRM_VALUE:
                raise DestinationError(
                    f"{ENV_CONFIRM}={CONFIRM_VALUE} é obrigatório para --apply em produção"
                )
        snapshot = load_snapshot(Path(args.snapshot))
        api = ManagementAPI(project_ref=ref, access_token=token)
        report = import_snapshot(snapshot, api, apply=args.apply, ref=ref, target=target)
        if args.report:
            write_report(report, Path(args.report))
    except Exception as exc:
        print(f"Falha na importação: {exc}", file=sys.stderr)
        return 1

    print(
        "Importação "
        + ("aplicada" if report["applied"] else "em dry-run")
        + f" em {target}/{ref}: "
        + " ".join(f"{k}={v}" for k, v in report["plan_counts"].items())
    )
    print(f"Divergências: {len(report['divergences'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
