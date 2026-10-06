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

# ===========================================================================
# Issue #285 — hardening do migration runner
# ===========================================================================

from migrate.environment import (  # noqa: E402
    ENV_ALLOWED_REFS,
    LOCAL,
    PRODUCTION,
    TargetEnvironmentError,
    resolve_policy,
    validate_project_ref,
)
from migrate.runner import _resolve_baseline  # noqa: E402

_REF = "abcdefghijklmnopqrst"
_OTHER_REF = "zyxwvutsrqponmlkjihg"


# ---------------------------------------------------------------------------
# #285 D1 — BASELINE_VERSION fail-closed em produção
# ---------------------------------------------------------------------------

def test_production_without_baseline_fails_closed(migrations_dir, monkeypatch):
    """Sem BASELINE_VERSION em produção o runner ABORTA em vez de no-op silencioso."""
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[], table_exists=True)
    with pytest.raises(core.BaselineConfigurationError) as exc:
        run(migrations_dir, api, require_baseline=True)
    msg = str(exc.value)
    assert "BASELINE_VERSION" in msg
    # Nenhuma migration pode ter sido aplicada no caminho do erro.
    assert not any("CREATE TABLE IF NOT EXISTS a" in q for q in api.queries)


def test_missing_baseline_production_writes_nothing_even_without_table(migrations_dir, monkeypatch):
    """Produção sem BASELINE_VERSION e sem a tabela de histórico: ZERO escritas.

    Este é o caso em que o bootstrap (`CREATE TABLE IF NOT EXISTS`) aconteceria
    antes do fail-closed se a resolução do baseline viesse depois dele. O
    fail-closed precisa anteceder qualquer escrita, inclusive essa.
    """
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[], table_exists=False)
    with pytest.raises(core.BaselineConfigurationError):
        run(migrations_dir, api, require_baseline=True)
    assert not api.mutating_queries()


def test_production_with_baseline_env_applies_only_above(migrations_dir, monkeypatch):
    """Regressão: produção COM baseline explícito continua aplicando o que está acima."""
    monkeypatch.setenv("BASELINE_VERSION", "001")
    api = FakeAPI(applied_rows=[], table_exists=True)
    result = run(migrations_dir, api, require_baseline=True)
    assert result.baseline == "001"
    assert result.applied == ["002"]
    assert "__baseline__" in " ".join(api.queries)


def test_local_keeps_implicit_baseline_fallback(migrations_dir, monkeypatch):
    """Regressão: local sem baseline mantém o fallback implícito (uso de dev)."""
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[], table_exists=True)
    result = run(migrations_dir, api, require_baseline=False)
    assert result.baseline == "002"
    assert result.applied == []


def test_existing_rows_resolve_baseline_without_env(migrations_dir, monkeypatch):
    """Com histórico no banco, o baseline vem do próprio banco (fail-closed não se aplica)."""
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(
        applied_rows=[
            {"version": "001", "filename": "__baseline__"},
            {"version": "000", "filename": "000_boot.sql"},
        ],
        table_exists=True,
    )
    result = run(migrations_dir, api, require_baseline=True)
    assert result.baseline == "001"
    assert result.applied == ["002"]


def test_db_baseline_higher_than_repo_skips_everything(migrations_dir, monkeypatch):
    """Baseline do banco acima do repo: nada é pendente (estado já reconciliado)."""
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(
        applied_rows=[{"version": "080", "filename": "__baseline__"}],
        table_exists=True,
    )
    result = run(migrations_dir, api, require_baseline=True)
    assert result.baseline == "080"
    assert result.applied == []


def test_resolve_baseline_requires_env_when_strict(migrations_dir):
    ms = core.discover_migrations(migrations_dir)
    with pytest.raises(core.BaselineConfigurationError):
        _resolve_baseline(
            applied_versions=set(),
            db_baseline=None,
            env_baseline=None,
            from_scratch=False,
            migrations=ms,
            require_baseline=True,
        )


# ---------------------------------------------------------------------------
# #285 D2 — SQL: filename nunca é interpolado cru
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("value", ["086", "086_x.sql", "__baseline__", "000_initial.sql"])
def test_sql_string_literal_accepts_known_safe_values(value):
    assert core.sql_string_literal(value) == f"'{value}'"


@pytest.mark.parametrize(
    "value",
    [
        "086_x';DROP TABLE users;--.sql",
        "086_x --.sql",
        "086_x.sql;",
        "' OR 1=1 --",
        "086 x.sql",
        "../086_x.sql",
        "086_x.SQL",
        "086_x.sql'",
        "",
    ],
)
def test_sql_string_literal_rejects_injection(value):
    with pytest.raises(core.MigrationFilenameError):
        core.sql_string_literal(value)


def test_apply_migration_quotes_filename_as_literal(migrations_dir):
    """Regressão: o INSERT emitted usa literal simples, não o filename cru."""
    make_migration(migrations_dir, "003_add_c.sql", "CREATE TABLE IF NOT EXISTS c (id int);\n")
    m = next(x for x in core.discover_migrations(migrations_dir) if x.version == "003")
    api = FakeAPI()
    apply_migration(api, m)
    sql = "\n".join(api.queries)
    assert "'003_add_c.sql'" in sql
    assert "'003'" in sql


def test_baseline_stamp_uses_safe_literals(migrations_dir, monkeypatch):
    monkeypatch.setenv("BASELINE_VERSION", "001")
    api = FakeAPI(applied_rows=[], table_exists=True)
    run(migrations_dir, api, require_baseline=True)
    stamps = [q for q in api.queries if "INSERT INTO public.schema_migrations" in q]
    assert stamps, "esperava o INSERT de baseline"
    assert "'001'" in stamps[0] and "'__baseline__'" in stamps[0]


# ---------------------------------------------------------------------------
# #285 D3 — filenames estritos (descoberta rejeita antes de qualquer rede)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "filename",
    [
        "086_x.sql;",
        "086_x';DROP TABLE users;--.sql",
        "086_x --.sql",
        "086_x--.sql",
        "86_x.sql",
        "086_X.sql",
    ],
)
def test_validate_migration_filename_rejects_bad_names(filename):
    with pytest.raises(core.MigrationFilenameError):
        core.validate_migration_filename(filename)


def test_discover_rejects_malformed_migration_filename(migrations_dir):
    make_migration(migrations_dir, "086_bad-name.sql")
    with pytest.raises(core.MigrationFilenameError):
        core.discover_migrations(migrations_dir)


def test_discover_accepts_repo_real_filenames():
    """Os 84 filenames reais do repositório continuam válidos (gaps inclusos)."""
    repo_dir = Path(core.__file__).resolve().parents[2] / "supabase" / "migrations"
    ms = core.discover_migrations(repo_dir)
    assert len(ms) >= 84
    for m in ms:
        core.validate_migration_filename(m.filename)


def test_real_repo_filenames_are_safe_sql_literals():
    """Cada filename/version real precisa sobreviver à interpolação no SQL.

    É o que quebraria a cadeia efêmera do CI em runtime se algum arquivo tivesse
    caractere fora da allowlist de `sql_string_literal`.
    """
    repo_dir = Path(core.__file__).resolve().parents[2] / "supabase" / "migrations"
    for m in core.discover_migrations(repo_dir):
        assert core.sql_string_literal(m.version) == f"'{m.version}'"
        assert core.sql_string_literal(m.filename) == f"'{m.filename}'"


# ---------------------------------------------------------------------------
# #285 D4 — auditoria de identidade / renumeração
# ---------------------------------------------------------------------------

def _m(version, filename):
    return core.Migration(
        version=version, number=int(version), name=filename, path=Path(filename), filename=filename
    )


_MIGS = [_m("001", "001_a.sql"), _m("002", "002_b.sql"), _m("003", "003_c.sql")]


def test_identity_audit_allows_legitimate_gaps():
    """Gaps de numeração são legítimos e não podem ser reportados (#285)."""
    rows = [{"version": "001", "filename": "001_a.sql"}, {"version": "003", "filename": "003_c.sql"}]
    assert core.audit_applied_identities(rows, _MIGS) == []


def test_identity_audit_ignores_baseline_row():
    rows = [{"version": "080", "filename": "__baseline__"}]
    assert core.audit_applied_identities(rows, _MIGS) == []


def test_identity_audit_flags_renumbered_in_place():
    """Mesmo número, filename diferente = renumeração que o runner não absorve."""
    rows = [{"version": "003", "filename": "003_antigo.sql"}]
    div = core.audit_applied_identities(rows, _MIGS)
    assert len(div) == 1
    assert div[0].reason == "renumbered"
    assert div[0].repository_filename == "003_c.sql"


def test_identity_audit_flags_missing_file():
    rows = [{"version": "009", "filename": "009_sumiu.sql"}]
    div = core.audit_applied_identities(rows, _MIGS)
    assert len(div) == 1
    assert div[0].reason == "missing_file"


def test_identity_audit_flags_renumbered_away():
    """Arquivo aplicado existe no repo, mas sob outro número."""
    rows = [{"version": "007", "filename": "002_b.sql"}]
    div = core.audit_applied_identities(rows, _MIGS)
    assert len(div) == 1
    assert div[0].reason == "renumbered_away"


def test_run_aborts_on_renumbered_before_any_ddl(migrations_dir):
    """Integração: renumeração aborta ANTES de aplicar qualquer migration."""
    api = FakeAPI(
        applied_rows=[{"version": "002", "filename": "002_nome_antigo.sql"}], table_exists=True
    )
    with pytest.raises(core.AppliedIdentityError):
        run(migrations_dir, api)
    # Nenhum DDL de migration pode ter sido emitido.
    assert not any("CREATE TABLE IF NOT EXISTS b" in q for q in api.queries)


def test_run_aborts_on_renumbered_before_bootstrap_ddl(migrations_dir):
    """A auditoria precede QUALQUER escrita — nem o bootstrap da tabela roda antes."""
    api = FakeAPI(
        applied_rows=[{"version": "002", "filename": "002_nome_antigo.sql"}], table_exists=True
    )
    with pytest.raises(core.AppliedIdentityError):
        run(migrations_dir, api)
    assert not api.mutating_queries()


def test_dry_run_also_aborts_on_renumbered(migrations_dir):
    """O plano do dry-run também precisa acusar a renumeração (e sem escrever)."""
    api = FakeAPI(
        applied_rows=[{"version": "002", "filename": "002_nome_antigo.sql"}], table_exists=True
    )
    with pytest.raises(core.AppliedIdentityError):
        run(migrations_dir, api, dry_run=True)
    assert not api.mutating_queries()


# ---------------------------------------------------------------------------
# #285 D5 — política de ambiente / destino fail-closed
# ---------------------------------------------------------------------------

def test_resolve_policy_rejects_unknown_target():
    with pytest.raises(TargetEnvironmentError) as exc:
        resolve_policy(target="staging")
    assert "staging" in str(exc.value)


def test_resolve_policy_defaults_to_local():
    assert resolve_policy().target == LOCAL


def test_resolve_policy_production_requires_baseline():
    policy = resolve_policy(target=PRODUCTION, allowed_refs=_REF)
    assert policy.require_baseline is True
    assert policy.enforce_allowlist is True


def test_resolve_policy_production_requires_allowlist():
    """Sem allowlist o destino de produção não é verificável => aborta."""
    with pytest.raises(TargetEnvironmentError) as exc:
        resolve_policy(target=PRODUCTION)
    assert ENV_ALLOWED_REFS in str(exc.value)


def test_resolve_policy_production_reads_allowlist_from_env(monkeypatch):
    monkeypatch.setenv(ENV_ALLOWED_REFS, _REF)
    policy = resolve_policy(target=PRODUCTION)
    assert policy.allowed_project_refs == (_REF,)


def test_validate_project_ref_rejects_empty():
    with pytest.raises(TargetEnvironmentError):
        validate_project_ref("", resolve_policy())


@pytest.mark.parametrize("bad", ["abcdefghijk", "ABCDEFGHIJKLMNOPQRST", "abc-def-ghij-klmnopqrs", _REF + "x"])
def test_validate_project_ref_rejects_bad_format(bad):
    with pytest.raises(TargetEnvironmentError):
        validate_project_ref(bad, resolve_policy())


def test_validate_project_ref_accepts_allowed_ref():
    policy = resolve_policy(target=PRODUCTION, allowed_refs=f"{_REF},{_OTHER_REF}")
    validate_project_ref(_REF, policy)


def test_validate_project_ref_rejects_ref_outside_allowlist():
    """Secret trocado apontando para outro projeto aborta antes de qualquer HTTP."""
    policy = resolve_policy(target=PRODUCTION, allowed_refs=_OTHER_REF)
    with pytest.raises(TargetEnvironmentError) as exc:
        validate_project_ref(_REF, policy)
    # A mensagem não pode ecoar o ref (pode ser o valor disparado por engano).
    assert _REF not in str(exc.value)


def test_error_messages_never_leak_token_values():
    policy = resolve_policy(target=PRODUCTION, allowed_refs=_OTHER_REF)
    with pytest.raises(TargetEnvironmentError) as exc:
        validate_project_ref(_REF, policy)
    assert _REF not in str(exc.value)
    assert _OTHER_REF not in str(exc.value)


# ─────────────────────────────────────────────────────────────────────────────
# Carregamento de .env por alvo (regressão #285)
#
# O .env do repositório aponta para STAGING (ref obskpmnphevpaexooldg,
# BASELINE_VERSION=000). Como load_dotenv roda com override=False, o primeiro
# arquivo a definir a variável vence. Sem carregar .env.production antes de .env
# em --target production, uma execução local de produção herdaria o ref e o
# baseline do staging em silêncio.
# ─────────────────────────────────────────────────────────────────────────────

_PROD_REF = "ypkulvbllxgkjzhpzemf"
_STAGING_REF = "obskpmnphevpaexooldg"
_ENV_VARS = (
    "SUPABASE_PROJECT_REF",
    "BASELINE_VERSION",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_ALLOWED_PROJECT_REFS",
    "MIGRATE_TARGET",
)


def _load_cli():
    """Importa scripts/migrate.py apesar da colisão de nome com o pacote migrate/."""
    import importlib.util

    cli_path = Path(__file__).resolve().parents[1] / "migrate.py"
    spec = importlib.util.spec_from_file_location("migrate_cli_under_test", cli_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def env_home(tmp_path, monkeypatch):
    """Raiz isolada, com .env/.env.local de staging e .env.production de prod."""
    (tmp_path / ".env").write_text(
        f"SUPABASE_PROJECT_REF={_STAGING_REF}\nBASELINE_VERSION=000\n", encoding="utf-8"
    )
    (tmp_path / ".env.local").write_text(
        "SUPABASE_ACCESS_TOKEN=sbp_token_de_dev\n", encoding="utf-8"
    )
    (tmp_path / ".env.production").write_text(
        f"SUPABASE_PROJECT_REF={_PROD_REF}\nBASELINE_VERSION=035\n", encoding="utf-8"
    )
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    cli = _load_cli()
    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    return cli


def test_load_env_local_target_uses_staging_env(env_home):
    env_home._load_env("local")
    assert os.environ["SUPABASE_PROJECT_REF"] == _STAGING_REF
    assert os.environ["BASELINE_VERSION"] == "000"


def test_load_env_production_ignores_staging_baseline(env_home):
    """Regressão: produção jamais pode herdar BASELINE_VERSION=000 do staging.

    Um baseline 000 aceito em produção marcaria 000..034 como aplicadas sem
    nunca terem rodado — um no-op silencioso reportando sucesso.
    """
    env_home._load_env("production")
    assert os.environ["SUPABASE_PROJECT_REF"] == _PROD_REF
    assert os.environ["BASELINE_VERSION"] == "035"


def test_load_env_production_still_reads_token_from_env_local(env_home):
    """A precedência do .env.production não pode expulsar o PAT de .env.local."""
    env_home._load_env("production")
    assert os.environ["SUPABASE_ACCESS_TOKEN"] == "sbp_token_de_dev"


def test_load_env_production_blocks_staging_ref_when_env_production_lacks_it(
    env_home, monkeypatch
):
    """Se .env.production não define o ref, o de STAGING não pode vazar.

    O .env.production real do repositório traz apenas credenciais de frontend
    (VITE_SUPABASE_URL/ANON_KEY, SUPABASE_URL/SERVICE_KEY) — não define
    SUPABASE_PROJECT_REF. Sem o bloqueio, o runner cairia no ref de staging.
    """
    (env_home.PROJECT_ROOT / ".env.production").write_text(
        "SUPABASE_SERVICE_KEY=svc_key\n", encoding="utf-8"
    )
    env_home._load_env("production")
    assert "SUPABASE_PROJECT_REF" not in os.environ


def test_load_env_production_blocks_identity_from_env_local(env_home):
    """BASELINE_VERSION de .env.local também não vale para produção."""
    (env_home.PROJECT_ROOT / ".env.local").write_text(
        "SUPABASE_ACCESS_TOKEN=sbp_token_de_dev\nBASELINE_VERSION=000\n", encoding="utf-8"
    )
    (env_home.PROJECT_ROOT / ".env.production").write_text(
        "SUPABASE_SERVICE_KEY=svc_key\n", encoding="utf-8"
    )
    env_home._load_env("production")
    assert os.environ["SUPABASE_ACCESS_TOKEN"] == "sbp_token_de_dev"
    assert "BASELINE_VERSION" not in os.environ


def test_load_env_production_honours_migrate_target_variable(env_home, monkeypatch):
    """--target ausente: MIGRATE_TARGET=production no ambiente também isola."""
    monkeypatch.setenv("MIGRATE_TARGET", "production")
    env_home._load_env(None)
    assert os.environ["SUPABASE_PROJECT_REF"] == _PROD_REF
    assert os.environ["BASELINE_VERSION"] == "035"


def test_load_env_never_overrides_explicit_environment(env_home, monkeypatch):
    """Uma variável já exportada pelo shell/secret continua soberana."""
    monkeypatch.setenv("SUPABASE_PROJECT_REF", _OTHER_REF)
    env_home._load_env("production")
    assert os.environ["SUPABASE_PROJECT_REF"] == _OTHER_REF


def test_load_env_tolerates_missing_env_files(tmp_path, monkeypatch):
    """Sem nenhum .env o runner segue usando só o ambiente do processo."""
    cli = _load_cli()
    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    cli._load_env("production")
    assert "SUPABASE_PROJECT_REF" not in os.environ
