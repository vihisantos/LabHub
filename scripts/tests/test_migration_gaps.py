"""Lacunas históricas de schema_migrations e reconciliação controlada.

Os oito cenários abaixo usam as 115 migrations REAIS do repositório e uma
Management API simulada: nenhum banco é tocado. O caso de staging é
reproduzido com 113/114 ausentes e 120 registrada.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from migrate import core
from migrate.api import ApiError
from migrate import reconciliation
from migrate.environment import (
    EXPECTED_PRODUCTION_PROJECT_REF,
    EXPECTED_STAGING_PROJECT_REF,
    PRODUCTION,
    STAGING,
    resolve_policy,
)
from migrate.reconciliation import ReconciliationRule
from migrate.runner import run

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

_MUTATION_MARKERS = (
    "CREATE TABLE IF NOT EXISTS public.schema_migrations",
    "INSERT INTO public.schema_migrations",
    "CREATE TABLE IF NOT EXISTS public.notification_outbox",
    "GRANT ",
    "REVOKE ",
)


class GapAPI:
    """Management API fake: responde só às leituras do runner."""

    def __init__(self, rows: list[dict], fail_on: str | None = None):
        self.rows = rows
        self.fail_on = fail_on
        self.queries: list[str] = []

    def query(self, sql: str):
        self.queries.append(sql)
        if self.fail_on and self.fail_on in sql:
            raise ApiError(500, "falha simulada na verificação do contrato")
        stripped = sql.strip().rstrip(";").strip()
        if stripped == "SELECT to_regclass('public.schema_migrations')":
            return [{"to_regclass": "public.schema_migrations"}]
        if stripped == "SELECT version, filename FROM public.schema_migrations":
            return self.rows
        return []

    def mutating_queries(self) -> list[str]:
        return [q for q in self.queries if any(m in q for m in _MUTATION_MARKERS)]


def _staging_policy():
    return resolve_policy(
        env={}, target=STAGING, allowed_refs=EXPECTED_STAGING_PROJECT_REF
    )


def _production_policy():
    return resolve_policy(
        env={}, target=PRODUCTION, allowed_refs=EXPECTED_PRODUCTION_PROJECT_REF
    )


def _rows(exclude: set[str] | None = None, baseline: str | None = None) -> list[dict]:
    exclude = exclude or set()
    rows = [
        {"version": m.version, "filename": m.filename}
        for m in core.discover_migrations(MIGRATIONS_DIR)
        if m.version not in exclude
    ]
    if baseline:
        rows.append({"version": baseline, "filename": core.BASELINE_FILENAME})
    return rows


def _run(api: GapAPI, policy, *, dry_run: bool = True):
    return run(
        MIGRATIONS_DIR,
        api,
        dry_run=dry_run,
        require_baseline=policy.require_baseline,
        policy=policy,
    )


# 1) Histórico completo até 120: zero pendências.
def test_full_history_has_no_gaps_and_no_pending():
    assert len(core.discover_migrations(MIGRATIONS_DIR)) == 115
    api = GapAPI(_rows())
    result = _run(api, _staging_policy())
    assert result.history_gaps == []
    assert result.pending == []
    assert result.applied == []
    assert result.baseline == "120"
    assert result.baseline_source == "applied_migrations"


# 2) 113/114 ausentes e 120 presente: lacuna detectada (não sucesso enganoso).
def test_missing_113_114_below_120_is_detected():
    api = GapAPI(_rows(exclude={"113", "114"}))
    result = _run(api, _staging_policy())
    assert [g.version for g in result.history_gaps] == ["113", "114"]
    assert [g.filename for g in result.history_gaps] == [
        "113_notification_outbox.sql",
        "114_notification_outbox_contract.sql",
    ]
    assert all(g.baseline == "120" for g in result.history_gaps)
    assert result.reconciliation.versions == ("113", "114")
    assert [c.filename for c in result.reconciliation.contracts] == [
        "114_notification_outbox_contract.sql"
    ]
    assert result.pending == []  # o bug histórico: parecia não haver pendências


# 3) Baseline explícita 035: versões anteriores ignoradas legitimamente.
def test_explicit_baseline_035_skips_older_versions_without_gaps():
    rows = [
        row for row in _rows()
        if int(row["version"]) > 35 and row["filename"] != core.BASELINE_FILENAME
    ]
    rows.append({"version": "035", "filename": core.BASELINE_FILENAME})
    api = GapAPI(rows)
    result = _run(api, _production_policy())
    assert result.baseline == "035"
    assert result.baseline_source == "database"
    assert result.history_gaps == []
    assert result.pending == []


# 4) Contrato íntegro: reconciliação segura e rastreável.
def test_integral_contract_reconciles_113_and_114():
    api = GapAPI(_rows(exclude={"113", "114"}))
    result = _run(api, _staging_policy(), dry_run=False)
    assert result.reconciled == ["113", "114"]
    assert result.applied == ["113", "114"]
    inserts = [
        q for q in api.queries if "INSERT INTO public.schema_migrations" in q
    ]
    assert any("'113_notification_outbox.sql'" in q for q in inserts)
    assert any("'114_notification_outbox_contract.sql'" in q for q in inserts)
    # O contrato é executado ANTES do primeiro registro: sem comprovação,
    # nenhuma linha fictícia entra no histórico.
    contract_at = next(
        i for i, q in enumerate(api.queries)
        if "114: contrato da migration 113 divergente" in q
    )
    first_insert = next(
        i for i, q in enumerate(api.queries)
        if "INSERT INTO public.schema_migrations" in q
    )
    assert contract_at < first_insert


# 5) Contrato incompleto: falha fechada, sem nenhuma escrita.
def test_incomplete_contract_fails_closed_without_writes():
    api = GapAPI(
        _rows(exclude={"113", "114"}),
        fail_on="114: contrato da migration 113 divergente",
    )
    with pytest.raises(core.MigrationGapError) as exc:
        _run(api, _staging_policy(), dry_run=False)
    assert "contrato" in str(exc.value)
    assert api.mutating_queries() == []


def test_postgres_executor_error_is_converted_and_fails_closed():
    """O executor local lança SqlExecutionError; precisa virar erro de domínio."""
    from migrate.pg import SqlExecutionError

    class BrokenContractAPI(GapAPI):
        def query(self, sql):
            if "114: contrato da migration 113 divergente" in sql:
                raise SqlExecutionError(
                    "114: contrato divergente: indice idx_notification_outbox_publish"
                )
            return super().query(sql)

    api = BrokenContractAPI(_rows(exclude={"113", "114"}))
    with pytest.raises(core.MigrationGapError) as exc:
        _run(api, _staging_policy(), dry_run=False)
    assert "indice idx_notification_outbox_publish" in str(exc.value)
    assert api.mutating_queries() == []


# 6) Divergência de filename: bloqueio (histórico e política de reconciliação).
def test_filename_divergence_blocks_history_audit():
    rows = [r for r in _rows(exclude={"113", "114"}) if r["version"] != "112"]
    rows.append({"version": "112", "filename": "112_nome_diferente.sql"})
    with pytest.raises(core.AppliedIdentityError):
        _run(GapAPI(rows), _staging_policy())


def test_filename_divergence_blocks_reconciliation(monkeypatch):
    monkeypatch.setitem(
        reconciliation.RECONCILIATION_RULES,
        "113",
        ReconciliationRule(
            version="113",
            filename="113_nome_diferente.sql",
            reason="regra adulterada",
            contract=reconciliation.STAGING_OUTBOX_CONTRACT,
        ),
    )
    with pytest.raises(core.MigrationGapError):
        _run(GapAPI(_rows(exclude={"113", "114"})), _staging_policy(), dry_run=False)


# 7) Dry-run: nenhuma escrita, lacunas reveladas.
def test_dry_run_reveals_gaps_and_never_writes():
    api = GapAPI(_rows(exclude={"113", "114"}))
    result = _run(api, _staging_policy(), dry_run=True)
    assert result.history_gaps
    assert result.reconciliation.versions == ("113", "114")
    assert result.applied == []
    assert api.mutating_queries() == []
    assert all(
        "SELECT " in q or "to_regclass" in q or "BEGIN;" in q
        for q in api.queries
    )


# 8) Produção íntegra preservada; produção com lacuna bloqueia.
def test_production_integral_history_is_preserved():
    api = GapAPI(_rows(baseline="035"))
    result = _run(api, _production_policy())
    assert result.baseline == "035"
    assert result.history_gaps == []
    assert result.pending == []
    assert result.applied == []


def test_production_never_reconciles_gaps():
    api = GapAPI(_rows(exclude={"113", "114"}))
    with pytest.raises(core.MigrationGapError) as exc:
        _run(api, _production_policy(), dry_run=False)
    assert "LACUNAS" in str(exc.value)
    assert api.mutating_queries() == []
