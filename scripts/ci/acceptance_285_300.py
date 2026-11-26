"""Real PostgreSQL acceptance checks for issues #285 and #300.

Only the disposable GitHub Actions PostgreSQL service is supported. Synthetic
migrations run in a separate randomly named database; RBAC fixtures, including
the table-level grants needed to model Supabase defaults, are rolled back.
Never grant EXECUTE to the helper under test or connect to a shared project.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

from migrate.runner import ADVISORY_LOCK_KEY

CI_DSN = "postgresql://postgres:postgres@localhost:5432/postgres"
CLI = Path(__file__).resolve().parents[1] / "migrate.py"


def require_disposable(dsn: str) -> None:
    if dsn != CI_DSN:
        raise RuntimeError("Acceptance checks require the disposable PostgreSQL CI service")


def check_runner(dsn: str) -> None:
    require_disposable(dsn)
    db = "ci_runner_" + uuid.uuid4().hex
    with psycopg.connect(dsn, autocommit=True) as control:
        control.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db)))
        try:
            target = make_conninfo(dsn, dbname=db)
            with tempfile.TemporaryDirectory(prefix="labhub-runner-ci-") as folder:
                root = Path(folder)
                first = root / "001_create_probe.sql"
                second = root / "002_mutate_probe.sql"
                first.write_text(
                    "CREATE TABLE public.ci_probe (id integer PRIMARY KEY);"
                    "INSERT INTO public.ci_probe VALUES (1);", encoding="utf-8"
                )
                second.write_text(
                    "INSERT INTO public.ci_probe VALUES (2);"
                    "CREATE TABLE public.ci_probe_ddl (id integer);"
                    "DO $$ BEGIN RAISE EXCEPTION 'CI_ROLLBACK_PROBE'; END $$;",
                    encoding="utf-8",
                )

                def run_cli(options: str = ""):
                    env = dict(os.environ)
                    for key in ("BASELINE_VERSION", "MIGRATE_FROM_SCRATCH", "MIGRATE_TARGET"):
                        env.pop(key, None)
                    env["DATABASE_URL"] = make_conninfo(target, options=options)
                    return subprocess.run(
                        [sys.executable, str(CLI), "--target", "local",
                         "--migrations-dir", str(root), "--from-scratch"],
                        env=env, capture_output=True, text=True, timeout=30,
                    )

                def snapshot():
                    with psycopg.connect(target) as conn:
                        return (
                            conn.execute("SELECT id FROM public.ci_probe ORDER BY id").fetchall(),
                            conn.execute("SELECT version, filename FROM public.schema_migrations ORDER BY version").fetchall(),
                            conn.execute("SELECT to_regclass('public.ci_probe_ddl')").fetchone()[0],
                        )

                failed = run_cli()
                assert failed.returncode == 1 and "CI_ROLLBACK_PROBE" in failed.stderr, (
                    "Expected a real migration SQL failure and nonzero CLI exit"
                )
                expected = ([(1,)], [("001", first.name)], None)
                assert snapshot() == expected, "Failed migration left DDL, DML or history behind"

                # Repair exactly the same filename/version, then prove the real
                # runner cannot execute while a second session owns its lock.
                second.write_text(
                    "INSERT INTO public.ci_probe VALUES (2);"
                    "CREATE TABLE public.ci_probe_ddl (id integer);",
                    encoding="utf-8",
                )
                with psycopg.connect(target) as holder:
                    holder.execute("SELECT pg_advisory_xact_lock(%s)", (ADVISORY_LOCK_KEY,))
                    blocked = run_cli("-c lock_timeout=1500")
                    assert blocked.returncode == 1 and "lock timeout" in blocked.stderr.lower(), (
                        "Runner did not wait on the advisory lock held by another session"
                    )
                    assert snapshot() == expected, "Blocked runner changed database state"
                    holder.commit()

                recovered = run_cli()
                assert recovered.returncode == 0, "Repaired migration failed after lock release"
                complete = ([(1,), (2,)], [("001", first.name), ("002", second.name)], "ci_probe_ddl")
                assert snapshot() == complete, "Recovery did not apply exactly the pending migration"
                assert run_cli().returncode == 0, "Second execution failed"
                assert snapshot() == complete, "Second execution was not idempotent"
        finally:
            control.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(db)))


def check_workspace_acl(dsn: str) -> None:
    require_disposable(dsn)
    helper = "public.can_manage_workspace_apps(uuid)"
    with psycopg.connect(dsn) as conn:
        try:
            # PUBLIC is a pseudo-role (OID 0), not a pg_roles entry.
            acl = conn.execute(
                """SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                          has_function_privilege('anon', p.oid, 'EXECUTE'),
                          has_function_privilege(p.proowner, p.oid, 'EXECUTE'),
                          EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,
                            acldefault('f', p.proowner))) a
                            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
                          p.prosecdef, 'search_path=public' = ANY(p.proconfig)
                   FROM pg_proc p WHERE p.oid = %s::regprocedure""", (helper,)
            ).fetchone()
            assert acl == (True, False, True, False, True, True), (
                "Unexpected helper ACL, SECURITY DEFINER or search_path"
            )

            # The vanilla PG stub lacks Supabase's default PUBLIC-schema table
            # grants. Reproduce only the required relation ACLs in this rolled
            # back transaction; do not grant EXECUTE on either helper.
            conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_app_settings TO authenticated")
            conn.execute("GRANT SELECT, INSERT ON public.app_data_backups TO authenticated")
            ws_a, ws_b = uuid.uuid4(), uuid.uuid4()
            for ws in (ws_a, ws_b):
                conn.execute(
                    "INSERT INTO public.workspaces (id, name, slug) VALUES (%s, %s, %s)",
                    (ws, "CI ACL", "ci-acl-" + ws.hex),
                )
            users = {key: uuid.uuid4() for key in ("manager", "viewer", "inactive", "super", "outsider")}
            for key, uid in users.items():
                email = f"ci-acl-{uid.hex}@labhub-ci.test"
                conn.execute(
                    """INSERT INTO auth.users (id, instance_id, aud, role, email,
                       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                       is_sso_user, is_anonymous)
                       VALUES (%s, '00000000-0000-0000-0000-000000000000',
                       'authenticated', 'authenticated', %s, now(),
                       '{"provider":"email","providers":["email"]}'::jsonb,
                       '{"name":"CI ACL"}'::jsonb, false, false)""", (uid, email)
                )
                updated = conn.execute(
                    "UPDATE public.profiles SET status='active', is_super_admin=%s WHERE id=%s",
                    (key == "super", uid),
                )
                assert updated.rowcount == 1, "Auth fixture failed to create profile"

            for key, role, status in (
                ("manager", "adm", "active"), ("viewer", "vis", "active"),
                ("inactive", "adm", "suspended"),
            ):
                result = conn.execute(
                    """INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
                       SELECT %s, %s, id, %s FROM public.roles WHERE slug=%s""",
                    (users[key], ws_a, status, role),
                )
                assert result.rowcount == 1, "Missing expected RBAC role"
            assert conn.execute(
                """SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
                   WHERE r.slug='adm' AND rp.action='admin.app.purge' AND rp.scope='workspace'"""
            ).fetchone()[0] == 1, "Missing admin workspace action"

            def as_user(uid):
                conn.execute("SET LOCAL ROLE authenticated")
                conn.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid),))
                conn.execute("SELECT set_config('request.jwt.claim.role', 'authenticated', true)")
                conn.execute("SELECT set_config('request.jwt.claims', %s, true)",
                             ('{"sub":"' + str(uid) + '","role":"authenticated"}',))
                assert conn.execute(
                    "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"
                ).fetchone() == ("authenticated", False, False), "RLS session bypasses policy"

            def denied_insert(table, workspace, app_id):
                try:
                    with conn.transaction():
                        conn.execute(
                            sql.SQL("INSERT INTO public.{} (workspace_id, app_id) VALUES (%s, %s)")
                            .format(sql.Identifier(table)), (workspace, app_id),
                        )
                except psycopg.errors.InsufficientPrivilege as exc:
                    assert "row-level security" in str(exc).lower(), "Denied for wrong reason"
                else:
                    raise AssertionError(f"RLS unexpectedly allowed {table}")

            for key, workspace, allowed in (
                ("super", ws_b, True), ("manager", ws_a, True),
                ("manager", ws_b, False), ("viewer", ws_a, False),
                ("inactive", ws_a, False), ("outsider", ws_a, False),
            ):
                app_id = "ci-" + uuid.uuid4().hex
                as_user(users[key])
                try:
                    assert conn.execute(
                        "SELECT public.can_manage_workspace_apps(%s)", (workspace,)
                    ).fetchone()[0] is allowed, f"Incorrect helper decision: {key}"
                    assert conn.execute(
                        "SELECT public.can_manage_workspace_apps(NULL)"
                    ).fetchone()[0] is False, "NULL workspace must be denied"
                    if allowed:
                        conn.execute(
                            "INSERT INTO public.workspace_app_settings (workspace_id, app_id) VALUES (%s, %s)",
                            (workspace, app_id),
                        )
                        assert conn.execute(
                            "UPDATE public.workspace_app_settings SET settings='{\"ci\":true}' WHERE workspace_id=%s AND app_id=%s",
                            (workspace, app_id),
                        ).rowcount == 1, "Allowed settings update failed"
                        conn.execute(
                            "INSERT INTO public.app_data_backups (workspace_id, app_id) VALUES (%s, %s)",
                            (workspace, app_id),
                        )
                        assert conn.execute(
                            "DELETE FROM public.workspace_app_settings WHERE workspace_id=%s AND app_id=%s",
                            (workspace, app_id),
                        ).rowcount == 1, "Allowed settings delete failed"
                    else:
                        denied_insert("workspace_app_settings", workspace, app_id)
                        denied_insert("app_data_backups", workspace, app_id)
                finally:
                    conn.execute("RESET ROLE")
        finally:
            conn.rollback()
