"""Testes do migration runner (mocks da Management API — sem tocar no banco real).

Cobre: descoberta/ordenação, versões duplicadas, baseline (env/implícito/banco),
filtro de pendentes, aplicação com advisory lock, falha não registra como
aplicada, rezaplicação não duplica, e falha cedo sem variáveis de ambiente.

Nenhum request sai da máquina: a Management API é simulada por ``FakeAPI``.
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


class FakeAPI:
    """Simula a Management API: guarda as queries e responde de forma configurável."""

    def __init__(self, applied_rows: list[dict] | None = None):
        self.queries: list[str] = []
        self.applied_rows = applied_rows if applied_rows is not None else []
        self.fail_on: str | None = None  # substrings de SQL que disparam falha
        self.http_status = 200

    def query(self, sql: str):
        self.queries.append(sql)
        if self.fail_on and self.fail_on in sql:
            raise ApiError(400, "falha simulada")
        if sql.strip().rstrip(";").strip() == "SELECT version, filename FROM public.schema_migrations":
            return self.applied_rows
        return []


# ---------------------------------------------------------------------------
# fixtures de migrations
# ---------------------------------------------------------------------------

@pytest.fixture
def migrations_dir(tmp_path):
    """Cria um diretório de migrations fictício 000..002 + um arquivo inválido."""
    d = tmp_path / "migrations"
    d.mkdir()
    files = {
        "000_boot.sql": "CREATE TABLE IF NOT EXISTS x (id int);\n",
        "001_create_a.sql": "CREATE TABLE IF NOT EXISTS a (id int);\n",
        "002_create_b.sql": "CREATE TABLE IF NOT EXISTS b (id int);\n",
        "README.md": "não é migration\n",
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
# runner: aplicação
# ---------------------------------------------------------------------------

def test_run_baselines_and_applies_only_above(migrations_dir, monkeypatch):
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    api = FakeAPI(applied_rows=[])
    result = run(migrations_dir, api)
    # baseline implícito = maior versão do repo (002); nada pendente
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
    # banco já tem 000 e 001 (sem baseline explícito)
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
    # falha a migration -> a transação inteira (com INSERT) é revertida.
    api = FakeAPI(applied_rows=[])
    api.fail_on = "CREATE TABLE IF NOT EXISTS boom"
    make_migration(migrations_dir, "004_boom.sql", body="CREATE TABLE IF NOT EXISTS boom (id int);\n")
    mig = core.discover_migrations(migrations_dir)[-1]
    with pytest.raises(ApiError):
        apply_migration(api, mig)
    # nenhuma query adicional de registro foi emitida depois da falha
    assert len(api.queries) == 1


# ---------------------------------------------------------------------------
# runner: erros de configuração
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
            text = "não cai aqui"
            def __init__(self):
                pass
        return R()

    api = ManagementAPI(access_token="tok", project_ref="ref", post=fake_post)
    # falha já no bootstrap
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
