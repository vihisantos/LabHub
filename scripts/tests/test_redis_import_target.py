"""Barreiras de destino do importador Redis -> PostgreSQL.

Staging continua sendo o alvo padrão. Produção só é aceita com variáveis
próprias, allowlist explícita e confirmação para ``--apply``. Nenhum teste
faz requisição: a Management API é substituída por um objeto falso.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1]
for _path in (str(_SCRIPTS), str(_SCRIPTS / "migrate")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from migrate import redis_import as importer  # noqa: E402
from migrate.redis_contract import Snapshot  # noqa: E402

PROD_REF = "abcdefghijklmnopqrst"
OTHER_REF = "zyxwvutsrqponmlkjihg"


class FakeAPI:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def query(self, sql: str):
        self.calls.append(sql)
        return []


def _clear(monkeypatch):
    for key in (
        "SUPABASE_STAGING_PROJECT_REF",
        "SUPABASE_STAGING_ACCESS_TOKEN",
        "SUPABASE_STAGING_ALLOWED_PROJECT_REFS",
        "SUPABASE_PRODUCTION_PROJECT_REF",
        "SUPABASE_PRODUCTION_ACCESS_TOKEN",
        "SUPABASE_PRODUCTION_ALLOWED_PROJECT_REFS",
        importer.ENV_CONFIRM,
    ):
        monkeypatch.delenv(key, raising=False)


def test_staging_default_keeps_historical_behavior(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", importer.STAGING_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "token-staging-falso")
    assert importer.resolve_destination() == (
        importer.STAGING_REF, "token-staging-falso", importer.TARGET_STAGING
    )


def test_staging_refuses_production_ref(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", PROD_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "token")
    with pytest.raises(importer.DestinationError):
        importer.resolve_destination(importer.TARGET_STAGING)


def test_production_requires_explicit_allowlist(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_PRODUCTION_PROJECT_REF", PROD_REF)
    monkeypatch.setenv("SUPABASE_PRODUCTION_ACCESS_TOKEN", "token")
    with pytest.raises(importer.DestinationError, match="ALLOWED_PROJECT_REFS"):
        importer.resolve_destination(importer.TARGET_PRODUCTION)


def test_production_refuses_staging_ref(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_PRODUCTION_PROJECT_REF", importer.STAGING_REF)
    monkeypatch.setenv("SUPABASE_PRODUCTION_ACCESS_TOKEN", "token")
    monkeypatch.setenv("SUPABASE_PRODUCTION_ALLOWED_PROJECT_REFS", importer.STAGING_REF)
    with pytest.raises(importer.DestinationError):
        importer.resolve_destination(importer.TARGET_PRODUCTION)


def test_production_refuses_ref_outside_allowlist(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_PRODUCTION_PROJECT_REF", PROD_REF)
    monkeypatch.setenv("SUPABASE_PRODUCTION_ACCESS_TOKEN", "token")
    monkeypatch.setenv("SUPABASE_PRODUCTION_ALLOWED_PROJECT_REFS", OTHER_REF)
    with pytest.raises(importer.DestinationError, match="allowlist"):
        importer.resolve_destination(importer.TARGET_PRODUCTION)


def test_production_accepts_allowlisted_ref(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("SUPABASE_PRODUCTION_PROJECT_REF", PROD_REF)
    monkeypatch.setenv("SUPABASE_PRODUCTION_ACCESS_TOKEN", "token-producao-falso")
    monkeypatch.setenv("SUPABASE_PRODUCTION_ALLOWED_PROJECT_REFS", f"{OTHER_REF},{PROD_REF}")
    assert importer.resolve_destination(importer.TARGET_PRODUCTION) == (
        PROD_REF, "token-producao-falso", importer.TARGET_PRODUCTION
    )


def test_unknown_target_is_rejected(monkeypatch):
    _clear(monkeypatch)
    with pytest.raises(importer.DestinationError, match="alvo desconhecido"):
        importer.resolve_destination("producao")


def test_import_snapshot_rejects_staging_ref_for_production_target():
    with pytest.raises(importer.DestinationError):
        importer.import_snapshot(
            Snapshot(), FakeAPI(), apply=False,
            ref=importer.STAGING_REF, target=importer.TARGET_PRODUCTION,
        )


def test_unstable_snapshot_is_refused_before_any_write():
    snapshot = Snapshot()
    snapshot.source_integrity = {"stable": False, "values_changed": 3}
    api = FakeAPI()
    with pytest.raises(importer.DestinationError, match="instável"):
        importer.import_snapshot(
            snapshot, api, apply=True,
            ref=PROD_REF, target=importer.TARGET_PRODUCTION,
        )
    assert api.calls == []


def test_main_requires_confirmation_before_any_api_client(monkeypatch, tmp_path):
    _clear(monkeypatch)
    monkeypatch.setattr(
        importer, "resolve_destination",
        lambda target: (PROD_REF, "token", importer.TARGET_PRODUCTION),
    )

    def _forbidden_client(**_kwargs):
        raise AssertionError("nenhum cliente HTTP pode ser criado sem confirmacao")

    monkeypatch.setattr(importer, "ManagementAPI", _forbidden_client)
    snapshot = tmp_path / "snapshot.json"
    snapshot.write_text(json.dumps(Snapshot().to_dict()), encoding="utf-8")

    assert importer.main([
        "--snapshot", str(snapshot), "--target", importer.TARGET_PRODUCTION, "--apply",
    ]) == 1
