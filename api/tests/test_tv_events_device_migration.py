"""Revisão estática da migration 055_tv_events_device_scope.sql.

A suíte backend deste repositório roda SEM Postgres ao vivo (padrão das demais
em api/tests): as garantias do DDL são verificadas por análise estática, para
que qualquer regressão futura na migration quebre o build.
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "055_tv_events_device_scope.sql"
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def test_coluna_device_id_nullable_referenciando_tv_devices(sql):
    """device_id é opcional (NULL = evento do campus, todas as TVs)."""
    assert "ADD COLUMN IF NOT EXISTS device_id uuid" in sql
    assert "REFERENCES public.tv_devices(id) ON DELETE SET NULL" in sql


def test_indice_por_device(sql):
    assert "idx_tv_events_device" in sql
    assert "idx_tv_events_workspace_device" in sql


def test_guard_permite_device_id_null(sql):
    body = re.search(
        r"FUNCTION public\.tv_event_device_guard\(\).*?AS \$\$(.*?)\$\$", sql, re.DOTALL
    )
    assert body, "função tv_event_device_guard não encontrada"
    assert "IF NEW.device_id IS NULL THEN" in body.group(1)


def test_guard_impede_device_de_outro_workspace(sql):
    assert "DEVICE_NOT_FOUND" in sql
    assert "DEVICE_WORKSPACE_MISMATCH" in sql
    assert "trg_tv_event_device_guard" in sql
