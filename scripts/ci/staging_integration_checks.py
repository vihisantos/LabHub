#!/usr/bin/env python3
"""Integração e health checks de STAGING após aplicar migrations (somente leitura).

Rodar no job ``stage-migrations`` depois do apply. Usa exclusivamente:
  - ``SUPABASE_STAGING_PROJECT_REF``;
  - ``SUPABASE_STAGING_ACCESS_TOKEN``;
  - ``vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS``.

Nunca recebe credencial de produção e nunca emite INSERT/UPDATE/DELETE/DDL:
o runner é chamado com ``dry_run=True`` para provar que não há pendências e
auditar identidade/baseline; as demais consultas também são SELECT.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from migrate.api import ManagementAPI  # noqa: E402
from migrate.environment import (  # noqa: E402
    STAGING,
    TargetEnvironmentError,
    resolve_policy,
    validate_project_ref,
)
from migrate.runner import run  # noqa: E402

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"


def _fail(message: str) -> int:
    print(f"[staging-check] FAIL: {message}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--phase",
        choices=("integration", "health", "all"),
        default="all",
        help="integration = histórico/RPC; health = engine/lockdown/triggers/RLS",
    )
    args = parser.parse_args()

    try:
        policy = resolve_policy(target=STAGING)
    except TargetEnvironmentError as exc:
        return _fail(str(exc))

    ref_var, token_var = policy.credential_vars()
    project_ref = os.environ.get(ref_var, "")
    try:
        validate_project_ref(project_ref, policy)
    except TargetEnvironmentError as exc:
        return _fail(str(exc))

    token = os.environ.get(token_var, "")
    if not token:
        return _fail(f"{token_var} ausente")

    api = ManagementAPI(
        access_token=token,
        project_ref=project_ref,
        access_token_env_var=token_var,
        project_ref_env_var=ref_var,
    )

    # Revalidação read-only: identidade das migrations, histórico, baseline e
    # ausência de pendências após o apply.
    try:
        plan = run(
            MIGRATIONS_DIR,
            api,
            dry_run=True,
            require_baseline=True,
            policy=policy,
        )
    except Exception as exc:  # noqa: BLE001 - fronteira do job
        return _fail(f"dry-run de verificação: {type(exc).__name__}: {exc}")

    if plan.pending:
        return _fail(f"staging ainda tem migrations pendentes: {plan.pending}")
    print(
        "[staging-check] PASS histórico: "
        f"baseline={plan.baseline or '(nenhum)'} origem={plan.baseline_source} "
        f"registradas={len(plan.already_applied)} pendentes=0"
    )

    queries = {
        "objects": """
            SELECT
              to_regclass('public.schema_migrations') IS NOT NULL AS migrations_table,
              to_regclass('public.profiles') IS NOT NULL AS profiles_table,
              to_regclass('public.workspaces') IS NOT NULL AS workspaces_table,
              current_setting('server_version_num')::int AS server_version
        """,
        "history": """
            SELECT count(*)::int AS total,
                   max(version) AS latest
            FROM public.schema_migrations
        """,
        "lockdown": """
            SELECT c.relrowsecurity AS rls_enabled,
                   (SELECT count(*)::int FROM pg_policies p
                     WHERE p.schemaname = 'public'
                       AND p.tablename = 'schema_migrations') AS client_policies
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'schema_migrations'
        """,
        "rpc": """
            SELECT to_regprocedure(
              'public.chamados_workflow_sha256_hex(text)'
            ) IS NOT NULL AS rpc_ok
        """,
        "triggers": """
            SELECT count(*)::int AS triggers
            FROM pg_trigger
            WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
        """,
        "rls_policies": """
            SELECT count(*)::int AS policies
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'profiles'
        """,
    }

    results: dict[str, list[dict]] = {}
    for name, sql in queries.items():
        try:
            rows = api.query(sql)
        except Exception as exc:  # noqa: BLE001
            return _fail(f"consulta {name}: {type(exc).__name__}: {exc}")
        if not isinstance(rows, list) or not rows:
            return _fail(f"consulta {name} sem resultado")
        results[name] = rows

    if args.phase in ("integration", "all"):
        objects = results["objects"][0]
        for key in ("migrations_table", "profiles_table", "workspaces_table"):
            if objects.get(key) is not True:
                return _fail(f"objeto obrigatório ausente: {key}")
        history = results["history"][0]
        if int(history.get("total") or 0) <= 0 or not history.get("latest"):
            return _fail("schema_migrations vazio no staging")
        print(
            "[staging-check] PASS integração: "
            f"migrations registradas={history['total']} última={history['latest']}"
        )
        if results["rpc"][0].get("rpc_ok") is not True:
            return _fail("RPC chamados_workflow_sha256_hex ausente")
        print("[staging-check] PASS RPC presente")

    if args.phase in ("health", "all"):
        version = int(results["objects"][0].get("server_version") or 0)
        if version < 170000:
            return _fail(f"PostgreSQL {version} é anterior ao 17 exigido para Supabase")
        print(f"[staging-check] PASS engine PostgreSQL server_version_num={version}")

        lockdown = results["lockdown"][0]
        if lockdown.get("rls_enabled") is not True:
            return _fail("public.schema_migrations sem RLS")
        if int(lockdown.get("client_policies") or 0) != 0:
            return _fail("public.schema_migrations com políticas de cliente")
        print("[staging-check] PASS lockdown schema_migrations (RLS, sem policies)")

        if int(results["triggers"][0].get("triggers") or 0) <= 0:
            return _fail("nenhum trigger em public.profiles")
        if int(results["rls_policies"][0].get("policies") or 0) <= 0:
            return _fail("nenhuma RLS policy em public.profiles")
        print("[staging-check] PASS triggers/RLS presentes")

    # Migration 122: fail the release gate if the watchdog's revision source
    # is missing, client-writable, or no longer maintained by the trigger.
    if args.phase in ("health", "all"):
        try:
            revision_rows = api.query("""
                SELECT
                    c.relrowsecurity AS rls_enabled,
                    NOT has_table_privilege('anon', c.oid, 'SELECT') AS anon_denied,
                    has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_read,
                    NOT (
                        has_table_privilege('authenticated', c.oid, 'INSERT')
                        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
                        OR has_table_privilege('authenticated', c.oid, 'DELETE')
                        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
                    ) AS auth_read_only,
                    EXISTS (
                        SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public'
                          AND tablename = 'chamados_queue_revisions'
                          AND policyname = 'chamados_queue_revision_read'
                          AND cmd = 'SELECT'
                    ) AS read_policy,
                    EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid = to_regclass('public.chamados_tickets')
                          AND tgname = 'chamados_queue_revision_trigger'
                          AND tgenabled IN ('O', 'A')
                          AND NOT tgisinternal
                          AND tgfoid = to_regprocedure('public.chamados_bump_queue_revision()')
                    ) AS trigger_enabled,
                    NOT has_function_privilege(
                        'authenticated', 'public.chamados_bump_queue_revision()', 'EXECUTE'
                    ) AS direct_exec_denied
                FROM pg_class c
                WHERE c.oid = to_regclass('public.chamados_queue_revisions')
            """)
        except Exception as exc:  # noqa: BLE001
            return _fail(f"queue revision health: {type(exc).__name__}: {exc}")
        required = ("rls_enabled", "anon_denied", "auth_read", "auth_read_only",
                    "read_policy", "trigger_enabled", "direct_exec_denied")
        if not revision_rows or any(revision_rows[0].get(key) is not True for key in required):
            return _fail("queue revision health: RLS, grants, policy or trigger invalid")
        print("[staging-check] PASS queue revision trigger/RLS/grants")

    print(f"[staging-check] PASS phase={args.phase} concluída (somente leitura)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
