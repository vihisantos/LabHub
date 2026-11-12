"""Static safety assertions for migration 108 (no database is contacted)."""
from pathlib import Path
import re


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "108_session_workspace_context.sql"
)


def test_session_context_is_unique_and_not_client_accessible():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert re.search(r"session_id\s+uuid\s+primary key", sql)
    assert "alter table public.session_workspace_contexts enable row level security" in sql
    assert "revoke all on public.session_workspace_contexts from public, anon, authenticated" in sql
    assert "grant select, insert, update, delete on public.session_workspace_contexts to service_role" in sql


def test_session_validation_binds_signed_session_id_to_user_and_expiry():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    validator = sql.split("create or replace function public.labhub_auth_session_is_active", 1)[1]
    validator = validator.split("create or replace function public.labhub_set_session_workspace_context", 1)[0]
    assert "security definer" in validator
    assert "set search_path = pg_catalog" in validator
    assert "from auth.sessions as s" in validator
    assert "s.id = p_session_id" in validator
    assert "s.user_id = p_user_id" in validator
    assert "s.not_after is null or s.not_after > clock_timestamp()" in validator
    assert "p_token_exp <= extract(epoch from clock_timestamp())" in validator


def test_activation_rpc_locks_revision_and_inserts_in_same_transaction():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    create = sql.split("create or replace function public.labhub_create_tv_activation_for_context", 1)[1]
    create = create.split("revoke all on function", 1)[0]
    lock = create.index("for update")
    check = create.index("v_context.revision <> p_expected_revision")
    insert = create.index("insert into public.tv_activation_codes")
    assert lock < check < insert
    assert "v_context.workspace_id <> p_expected_workspace_id" in create
    assert "v_context.workspace_id, p_user_id" in create
    assert "security definer" in create
    assert "set search_path = pg_catalog" in create


def test_privileged_rpcs_are_not_executable_by_clients():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    functions = [
        "labhub_auth_session_is_active(uuid, uuid, bigint)",
        "labhub_set_session_workspace_context(uuid, uuid, uuid, bigint)",
        "labhub_get_session_workspace_context(uuid, uuid, bigint)",
        "labhub_create_tv_activation_for_context(uuid, uuid, bigint, uuid, bigint, text, text, timestamptz)",
    ]
    for signature in functions:
        assert f"revoke all on function public.{signature} from public, anon, authenticated" in sql
        assert f"grant execute on function public.{signature} to service_role" in sql
