"""Integration tests for migration 102 against the CI-only ephemeral PostgreSQL.

These tests require DATABASE_URL. They run inside a transaction and always roll
back, so they do not leave grants, roles, rows, or table changes behind.
"""
from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest
from psycopg.errors import InsufficientPrivilege

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "102_schema_migrations_lockdown.sql"
API_ROLES = ("anon", "authenticated", "service_role")
PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")


@pytest.fixture
def db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL não definido; teste requer PostgreSQL efêmero do CI")

    # Fail closed: never allow this destructive-capable integration fixture to
    # run against a remote or non-CI database by accident.
    if not (url.startswith("postgresql://postgres:postgres@localhost:") or
            url.startswith("postgres://postgres:postgres@localhost:")):
        pytest.skip("teste restrito ao PostgreSQL efêmero local do CI")

    conn = psycopg.connect(url)
    try:
        with conn.cursor() as cur:
            for role in API_ROLES:
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
                if cur.fetchone() is None:
                    cur.execute(f'CREATE ROLE "{role}" NOLOGIN')
            # Replicates the Supabase platform: service_role carries BYPASSRLS.
            # BYPASSRLS only bypasses RLS policies — it does NOT grant table
            # privileges by itself, so the REVOKE in migration 102 still blocks
            # this role. The SET ROLE assertions below prove exactly that: with
            # BYPASSRLS and no table privileges, SELECT/INSERT still fail.
            cur.execute('ALTER ROLE "service_role" BYPASSRLS')
            cur.execute("""
                CREATE TABLE IF NOT EXISTS public.schema_migrations (
                    version text PRIMARY KEY,
                    filename text NOT NULL,
                    applied_at timestamptz NOT NULL DEFAULT now(),
                    duration_ms integer NOT NULL DEFAULT 0
                )
            """)
            cur.execute("""
                INSERT INTO public.schema_migrations (version, filename)
                VALUES ('000', '000_test_bootstrap.sql'),
                       ('001', '001_test_existing.sql'),
                       ('035', '035_test_history.sql')
                ON CONFLICT (version) DO NOTHING
            """)
            for role in API_ROLES:
                cur.execute(
                    f'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER '
                    f'ON TABLE public.schema_migrations TO "{role}"'
                )
        yield conn
    finally:
        conn.rollback()
        conn.close()


def _apply_migration(conn):
    conn.execute(MIGRATION.read_text(encoding="utf-8"))


def test_migration_102_locks_down_schema_migrations(db):
    before = db.execute("SELECT count(*) FROM public.schema_migrations").fetchone()[0]
    _apply_migration(db)

    row = db.execute("""
        SELECT c.relrowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'schema_migrations'
    """).fetchone()
    assert row == (True,)
    assert db.execute("""
        SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'schema_migrations'
    """).fetchone()[0] == 0

    for role in API_ROLES:
        for privilege in PRIVILEGES:
            assert db.execute(
                "SELECT has_table_privilege(%s, 'public.schema_migrations', %s)",
                (role, privilege),
            ).fetchone()[0] is False

    # A database owner can still read and write; use a savepoint so the
    # synthetic runner stamp is rolled back with the test transaction.
    assert db.execute("SELECT count(*) FROM public.schema_migrations").fetchone()[0] == before
    db.execute("SAVEPOINT runner_stamp")
    db.execute("""
        INSERT INTO public.schema_migrations (version, filename)
        VALUES ('102_test_lockdown', '102_test_lockdown.sql')
        ON CONFLICT (version) DO NOTHING
    """)
    assert db.execute("""
        SELECT count(*) FROM public.schema_migrations
        WHERE version = '102_test_lockdown'
    """).fetchone()[0] == 1
    db.execute("ROLLBACK TO SAVEPOINT runner_stamp")

    for role in API_ROLES:
        db.execute("SAVEPOINT role_read")
        db.execute(f'SET ROLE "{role}"')
        with pytest.raises(InsufficientPrivilege):
            db.execute("SELECT version FROM public.schema_migrations").fetchall()
        db.execute("ROLLBACK TO SAVEPOINT role_read")

        db.execute("SAVEPOINT role_write")
        db.execute(f'SET ROLE "{role}"')
        with pytest.raises(InsufficientPrivilege):
            db.execute("""
                INSERT INTO public.schema_migrations (version, filename)
                VALUES ('blocked_test', 'blocked_test.sql')
            """)
        db.execute("ROLLBACK TO SAVEPOINT role_write")


def test_migration_102_does_not_mutate_existing_history_rows(db):
    before = db.execute(
        "SELECT version, filename, applied_at, duration_ms "
        "FROM public.schema_migrations ORDER BY version"
    ).fetchall()
    _apply_migration(db)
    after = db.execute(
        "SELECT version, filename, applied_at, duration_ms "
        "FROM public.schema_migrations ORDER BY version"
    ).fetchall()
    assert after == before
