"""Static regression checks for migration 102: migration history is not an API table."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "102_schema_migrations_lockdown.sql"
CHECKS = ROOT / "supabase" / "migrations" / "tests" / "102_schema_migrations_lockdown_checks.sql"


def _code_without_comments(path: Path) -> str:
    return "\n".join(
        line for line in path.read_text(encoding="utf-8").splitlines()
        if not line.strip().startswith("--")
    )


def test_102_follows_101_and_has_runtime_check():
    assert (ROOT / "supabase" / "migrations" / "101_ticket_events_status_metrics.sql").is_file()
    assert MIGRATION.is_file()
    assert CHECKS.is_file()


def test_102_revokes_all_api_role_privileges():
    code = re.sub(r"\s+", " ", _code_without_comments(MIGRATION)).upper()
    assert "REVOKE ALL PRIVILEGES ON TABLE PUBLIC.SCHEMA_MIGRATIONS FROM PUBLIC, ANON, AUTHENTICATED, SERVICE_ROLE;" in code
    assert len(re.findall(r"\bREVOKE\b", code)) == 1


def test_102_enables_rls_without_client_policies_or_grants():
    code = _code_without_comments(MIGRATION).upper()
    assert "ALTER TABLE PUBLIC.SCHEMA_MIGRATIONS ENABLE ROW LEVEL SECURITY;" in code
    assert not re.search(r"\bGRANT\b", code)
    assert not re.search(r"\bCREATE\s+POLICY\b", code)
    assert "CASCADE" not in code


def test_102_does_not_mutate_migration_history_rows():
    code = _code_without_comments(MIGRATION)
    assert not re.search(r"\b(INSERT\s+INTO|UPDATE\s+public\.schema_migrations|DELETE\s+FROM|TRUNCATE)\b", code, re.I)


def test_102_sql_checks_effective_privileges_and_rls():
    checks = CHECKS.read_text(encoding="utf-8")
    assert "relrowsecurity" in checks
    assert "pg_policies" in checks
    assert "has_table_privilege" in checks
    for role in ("anon", "authenticated", "service_role"):
        assert role in checks
    for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"):
        assert privilege in checks


def test_102_sql_checks_maintain_privilege_on_postgresql_17():
    """`REVOKE ALL PRIVILEGES` also revokes MAINTAIN on PostgreSQL 17+; the
    checks must assert its absence there, guarded so the PostgreSQL 16 CI
    image (which does not know MAINTAIN) still passes."""
    checks = CHECKS.read_text(encoding="utf-8")
    assert "MAINTAIN" in checks
    # Guard pinning: the MAINTAIN assertion must be skipped on pre-17 servers.
    assert "server_version_num" in checks
    assert "170000" in checks
