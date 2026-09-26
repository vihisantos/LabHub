"""Testes do migration runner (mocks da Management API â€” sem tocar no banco real).

Cobre: descoberta/ordenaÃ§Ã£o, versÃµes duplicadas, baseline (env/implÃ­cito/banco),
filtro de pendentes, aplicaÃ§Ã£o com advisory lock, falha nÃ£o registra como
aplicada, rezaplicaÃ§Ã£o nÃ£o duplica, e falha cedo sem variÃ¡veis de ambiente.

Nenhum request sai da mÃ¡quina: a Management API Ã© simulada por ``FakeAPI``.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from migrate import core
from migrate.api import ApiError
from migrate.runner import ADVISORY_LOCK_KEY, apply_migration, run

FIXTURES = Path(__file__).parent / "fixtures"

# SQL que NUNCA pode aparecer durante um dry-run (prova de nÃ£o-mutaÃ§Ã£o).
_MUTATION_MARKERS = (
    "CREATE TABLE IF NOT EXISTS public.schema_migrations",
    "INSERT INTO public.schema_migrations",
)


class FakeAPI:
    """Simula a Management API: guarda as queries e responde de forma configurÃ¡vel."""

    def __init__(self, applied_rows: list[dict] | None = None, table_exists: bool = True):
        self.queries: list[str] = []
        self.applied_rows = applied_rows if applied_rows is not None else []
        self.fail_on: str | None = None  # substrings de SQL que disparam falha
        self.http_status = 200
        self.table_exists = table_exists

    def query(self, sql: str):
        self.queries.append(sql)
        if self.fail_on and self.fail_on in sql:
            raise ApiError(400, "falha simulada")
        stripped = sql.strip().rstrip(";").strip()
        if stripped == "SELECT to_regclass('public.schema_migrations')":
            return [{"to_regclass": "public.schema_migrations"}] if self.table_exists else []
        if stripped == "SELECT version, filename FROM public.schema_migrations":
            return self.applied_rows
        return []

    def mutating_queries(self) -> list[str]:
        return [q for q in self.queries if any(marker in q for marker in _MUTATION_MARKERS)]


# ---------------------------------------------------------------------------
# fixtures de migrations
# ---------------------------------------------------------------------------

@pytest.fixture
def migrations_dir(tmp_path):
    """Cria um diretÃ³rio de migrations fictÃ­cio 000..002 + um arquivo invÃ¡lido."""
    d = tmp_path / "migrations"
    d.mkdir()
    files = {
        "000_boot.sql": "CREATE TABLE IF NOT EXISTS x (id int);\n",
        "001_create_a.sql": "CREATE TABLE IF NOT EXISTS a (id int);\n",
        "002_create_b.sql": "CREATE TABLE IF NOT EXISTS b (id int);\n",
        "README.md": "nÃ£o Ã© migration\n",
    }
    for name, body in files.items():
        (d / name).write_text(body, encoding="utf-8")
    return d


def make_migration(d: Path, name: str, body: str = "CREATE TABLE IF NOT EXISTS t (id int);\n"):
    p = d / name
    p.write_text(body, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# core: descoberta
# ---------------------------------------------------------------------------

def test_discover_orders_numerically(migrations_dir):
    ms = core.discover_migrations(migrations_dir)
    assert [m.version for m in ms] == ["000", "001", "002"]
    assert ms[0].number < ms[1].number < ms[2].number


def test_discover_ignores_non_migrations(migrations_dir):
    ms = core.discover_migrations(migrations_dir)
    assert all(m.filename.endswith(".sql") for m in ms)
    assert "README.md" not in [m.filename for m in ms]


def test_discover_duplicate_versions_raise(migrations_dir):
    make_migration(migrations_dir, "002_dup.sql")
    with pytest.raises(core.MigrationVersionError):
        core.discover_migrations(migrations_dir)


def test_latest_version(migrations_dir):
    ms = core.discover_migrations(migrations_dir)
    assert core.latest_version(ms) == "002"


# ---------------------------------------------------------------------------
# core: pendentes / baseline
# ---------------------------------------------------------------------------

def _migs():
    return [
        core.Migration(version="000", number=0, name="a", path=Path("x"), filename="000_x.sql"),
        core.Migration(version="001", number=1, name="b", path=Path("x"), filename="001_b.sql"),
        core.Migration(version="002", number=2, name="c", path=Path("x"), filename="002_c.sql"),
    ]


def test_pending_filters_applied_and_baseline():
    ms = _migs()
    pend = core.pending_migrations(ms, {"001"}, baseline_version="000")
    assert [m.version for m in pend] == ["002"]


def test_pending_ignores_baseline_and_lower():
    ms = _migs()
    pend = core.pending_migrations(ms, set(), baseline_version="002")
    assert pend == []


def test_pending_no_baseline_applies_all():
    ms = _migs()
    pend = core.pending_migrations(ms, set(), None)
    assert [m.version for m in pend] == ["000", "001", "002"]


# ---------------------------------------------------------------------------
# runner: aplicaÃ§Ã£o
# ---------------------------------------------------------------------------

def test_run_baselines_and_applies_only_above(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[])
    result = run(migrations_dir, api)
    # baseline implÃ­cito = maior versÃ£o do repo (002); nada pendente
    assert result.baseline == "002"
    assert result.pending == []
    assert result.applied == []
    # a baseline foi gravada
    stamp = [q for q in api.queries if "__baseline__" in q]
    assert stamp and "'002'" in stamp[0]


def test_run_env_baseline_applies_only_above(migrations_dir, monkeypatch):
    monkeypatch.setenv("BASELINE_VERSION", "001")
    api = FakeAPI(applied_rows=[])
    result = run(migrations_dir, api)
    assert result.baseline == "001"
    assert result.pending == ["002"]
    assert result.applied == ["002"]


def test_run_with_existing_rows_skips_applied(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    # banco jÃ¡ tem 000 e 001 (sem baseline explÃ­cito)
    api = FakeAPI(applied_rows=[
        {"version": "000", "filename": "000_boot.sql"},
        {"version": "001", "filename": "001_create_a.sql"},
    ])
    result = run(migrations_dir, api)
    # baseline = maior aplicada (001)
    assert result.baseline == "001"
    assert result.pending == ["002"]
    assert result.applied == ["002"]


def test_run_nothing_pending_when_all_applied(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[
        {"version": "000", "filename": "000_boot.sql"},
        {"version": "001", "filename": "001_create_a.sql"},
        {"version": "002", "filename": "002_create_b.sql"},
    ])
    result = run(migrations_dir, api)
    assert result.pending == []
    assert result.applied == []


def test_apply_migration_wraps_with_advisory_lock_and_insert(migrations_dir):
    api = FakeAPI(applied_rows=[])
    mig = core.Migration(version="003", number=3, name="c", path=Path("x"), filename="003_c.sql")
    make_migration(migrations_dir, "003_c.sql", body="CREATE TABLE IF NOT EXISTS c (id int);\n")
    mig = core.discover_migrations(migrations_dir)[-1]
    apply_migration(api, mig)
    assert len(api.queries) == 1
    sql = api.queries[0]
    assert f"pg_advisory_xact_lock({ADVISORY_LOCK_KEY})" in sql
    assert "BEGIN;" in sql and "COMMIT;" in sql
    assert "003_c.sql" in sql
    assert "schema_migrations" in sql
    assert "ON CONFLICT (version) DO NOTHING" in sql


def test_apply_migration_failure_not_recorded(migrations_dir):
    # falha a migration -> a transaÃ§Ã£o inteira (com INSERT) Ã© revertida.
    api = FakeAPI(applied_rows=[])
    api.fail_on = "CREATE TABLE IF NOT EXISTS boom"
    make_migration(migrations_dir, "004_boom.sql", body="CREATE TABLE IF NOT EXISTS boom (id int);\n")
    mig = core.discover_migrations(migrations_dir)[-1]
    with pytest.raises(ApiError):
        apply_migration(api, mig)
    # nenhuma query adicional de registro foi emitida depois da falha
    assert len(api.queries) == 1


# ---------------------------------------------------------------------------
# runner: dry-run (realmente read-only)
# ---------------------------------------------------------------------------

def test_dry_run_empty_db_never_writes(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(table_exists=False)  # banco ainda nem tem schema_migrations
    result = run(migrations_dir, api, dry_run=True)
    # planeja com baseline implÃ­cito de produÃ§Ã£o (nÃ£o marca nada)
    assert result.baseline == "002"
    assert result.pending == []
    # NENHUM CREATE TABLE / INSERT Ã© emitido â€” sÃ³ leitura
    assert api.mutating_queries() == []
    assert all(("SELECT " in q) or ("to_regclass" in q) for q in api.queries)


def test_dry_run_from_scratch_empty_db_never_writes(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(table_exists=False)
    result = run(migrations_dir, api, dry_run=True, from_scratch=True)
    assert result.baseline is None
    assert result.pending == ["000", "001", "002"]
    assert api.mutating_queries() == []
    assert all(("SELECT " in q) or ("to_regclass" in q) for q in api.queries)


def test_dry_run_with_existing_rows_plans_only(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[
        {"version": "000", "filename": "000_boot.sql"},
        {"version": "001", "filename": "001_create_a.sql"},
    ])
    result = run(migrations_dir, api, dry_run=True)
    assert result.baseline == "001"
    assert result.pending == ["002"]
    assert result.applied == []
    assert api.mutating_queries() == []


def test_dry_run_does_not_bootstrap_nor_stamp(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(table_exists=False)
    run(migrations_dir, api, dry_run=True)
    sql = "\n".join(api.queries)
    assert "CREATE TABLE IF NOT EXISTS public.schema_migrations" not in sql
    assert "__baseline__" not in sql
    assert "pg_advisory_xact_lock" not in sql


# ---------------------------------------------------------------------------
# runner: from-scratch (banco novo â†’ aplica 000 em diante)
# ---------------------------------------------------------------------------

def test_from_scratch_applies_everything(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[])
    result = run(migrations_dir, api, from_scratch=True)
    assert result.baseline is None
    assert result.pending == ["000", "001", "002"]
    assert result.applied == ["000", "001", "002"]
    # sem linha de baseline gravada
    assert all("__baseline__" not in q for q in api.queries)


def test_from_scratch_rerun_is_idempotent(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[
        {"version": "000", "filename": "000_boot.sql"},
        {"version": "001", "filename": "001_create_a.sql"},
        {"version": "002", "filename": "002_create_b.sql"},
    ])
    result = run(migrations_dir, api, from_scratch=True)
    assert result.pending == []
    assert result.applied == []


# ---------------------------------------------------------------------------
# core: strip de transaÃ§Ã£o embutida (migration 000 tem BEGIN/COMMIT no arquivo)
# ---------------------------------------------------------------------------

def test_strip_inner_transaction_removes_wrapping_begin_commit():
    sql = "BEGIN;\nCREATE TABLE IF NOT EXISTS t (id int);\nCOMMIT;\n"
    assert core.strip_inner_transaction(sql) == "CREATE TABLE IF NOT EXISTS t (id int);\n"


def test_strip_inner_transaction_is_noop_without_emb():
    sql = "CREATE TABLE IF NOT EXISTS t (id int);\n"
    assert core.strip_inner_transaction(sql) == sql


def test_strip_inner_transaction_ignores_plpgsql_begin_end():
    sql = "DO $$ BEGIN PERFORM 1; END $$;\nCOMMIT;\n"
    # o bloco DO usa begin/end SEM ';' na linha -> nÃ£o Ã© tocado
    assert core.strip_inner_transaction(sql) == "DO $$ BEGIN PERFORM 1; END $$;\n"


def test_strip_inner_transaction_case_insensitive():
    sql = "begin;\nSELECT 1;\ncommit;\n"
    assert core.strip_inner_transaction(sql) == "SELECT 1;\n"


def test_apply_migration_with_embedded_transaction_is_wrapped_once(migrations_dir):
    # corpo com BEGIN/COMMIT prÃ³prios (caso da 000 em banco novo)
    make_migration(
        migrations_dir,
        "005_embedded.sql",
        body="BEGIN;\nCREATE TABLE IF NOT EXISTS embedded (id int);\nCOMMIT;\n",
    )
    api = FakeAPI(applied_rows=[])
    mig = core.discover_migrations(migrations_dir)[-1]
    apply_migration(api, mig)
    sql = api.queries[0]
    # wrapper tem exatamente UMA transaÃ§Ã£o (nÃ£o duas apÃ³s o strip)
    assert sql.count("BEGIN;") == 1
    assert sql.count("COMMIT;") == 1
    assert "CREATE TABLE IF NOT EXISTS embedded (id int);" in sql
    assert "ON CONFLICT (version) DO NOTHING" in sql


# ---------------------------------------------------------------------------
# runner: erros de configuraÃ§Ã£o
# ---------------------------------------------------------------------------

def test_missing_env_vars_fails_fast(monkeypatch):
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("SUPABASE_PROJECT_REF", raising=False)
    from migrate.api import ManagementAPI
    api = ManagementAPI(access_token="", project_ref="")
    with pytest.raises(ApiError):
        api._headers()


def test_query_raises_on_http_error():
    from migrate.api import ManagementAPI
    from migrate.runner import run
    import requests

    def fake_post(url, json, headers, timeout):
        class R:
            status_code = 401
            text = "nÃ£o cai aqui"
            def __init__(self):
                pass
        return R()

    api = ManagementAPI(access_token="tok", project_ref="ref", post=fake_post)
    # falha jÃ¡ no bootstrap
    with pytest.raises(ApiError):
        _bootstrap = api.query("SELECT 1")


def test_query_returns_rows():
    from migrate.api import ManagementAPI

    def fake_post(url, json, headers, timeout):
        class R:
            status_code = 200
            text = "[]"
            def json(self):
                return [{"version": "001", "filename": "001_x.sql"}]
        return R()

    api = ManagementAPI(access_token="tok", project_ref="ref", post=fake_post)
    assert api.query("SELECT ...") == [{"version": "001", "filename": "001_x.sql"}]


# ---------------------------------------------------------------------------
# PostgresExecutor (PG efÃªmero do CI)
# ---------------------------------------------------------------------------

def test_postgres_executor_requires_dsn(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from migrate.pg import PostgresExecutor, SqlExecutionError
    with pytest.raises(SqlExecutionError):
        PostgresExecutor()


class _Ctx:
    """Base p/ fakes do driver psycopg (context manager protocol)."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None


class _FakeCur(_Ctx):
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _FakeConn(_Ctx):
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor


def test_postgres_executor_redacts_tokens_in_errors():
    from migrate.pg import PostgresExecutor, SqlExecutionError

    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmM.xabcde"

    def boom_query(sql, prepare=False):
        raise RuntimeError(f"connection broken sbp_123456789012345678 {jwt}")

    fake_cur = _FakeCur(execute=boom_query)
    fake_conn = _FakeConn(cursor=fake_cur)
    fake_psycopg = type("Psy", (), {"connect": staticmethod(lambda dsn, **kw: fake_conn)})()

    executor = PostgresExecutor(dsn="postgresql://u:p@localhost/db")
    executor._psycopg = fake_psycopg
    with pytest.raises(SqlExecutionError) as exc:
        executor.query("SELECT 1")
    assert jwt not in str(exc.value)
    assert "sbp_" not in str(exc.value)
    assert "[REDACTED]" in str(exc.value)


def test_postgres_executor_returns_rows():
    from migrate.pg import PostgresExecutor

    fake_cur = _FakeCur(
        execute=lambda sql, prepare=False: None,
        description=[type("Col", (), {"name": "version"})()],
        fetchall=lambda: [("001",)],
    )
    fake_conn = _FakeConn(cursor=fake_cur)
    fake_psycopg = type("Psy", (), {"connect": staticmethod(lambda dsn, **kw: fake_conn)})()

    executor = PostgresExecutor(dsn="postgresql://u:p@localhost/db")
    executor._psycopg = fake_psycopg
    assert executor.query("SELECT 1") == [{"version": "001"}]
