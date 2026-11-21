"""Testes estáticos das migrations 119/120 (prioridade/paginação da reconciliação)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
MIGRATION_119 = MIGRATIONS / "119_chamados_workflow_outbox_reconcile_priority.sql"
CONTRACT_120 = MIGRATIONS / "120_chamados_workflow_outbox_reconcile_priority_contract.sql"
TEST_119 = MIGRATIONS / "tests" / "119_chamados_workflow_outbox_reconcile_priority_checks.sql"

CODE_119 = MIGRATION_119.read_text(encoding="utf-8")
CODE_120 = CONTRACT_120.read_text(encoding="utf-8")


def test_119_existe_e_cobre_index_cursor_e_prioridade() -> None:
    assert MIGRATION_119.is_file()
    assert "CREATE INDEX IF NOT EXISTS idx_chamados_tickets_workflow_reconcile" in CODE_119
    assert 'ON public.chamados_tickets ("updatedAt" DESC)' in CODE_119
    assert "cursor_updated_at" in CODE_119
    assert "cursor_ticket_id" in CODE_119
    assert "chamados_workflow_sha256_hex" in CODE_119
    assert "NOT EXISTS" in CODE_119
    assert "o.cycle_key = c.cycle_key" in CODE_119
    assert "RETURN NEXT;" in CODE_119
    assert "assigned_to_user_id := v_row.assigned_to_user_id" in CODE_119


def test_119_nao_altera_publicacao_nem_integracao_qstash() -> None:
    sem_comentario = "\n".join(
        linha for linha in CODE_119.splitlines() if not linha.lstrip().startswith("--")
    )
    assert "qstash" not in sem_comentario.lower()
    assert "publish" not in sem_comentario.lower()
    assert "outbox_claim" not in sem_comentario
    assert "outbox_release" not in sem_comentario


def test_120_existe_e_e_somente_leitura() -> None:
    assert CONTRACT_120.is_file()
    sem_comentario = "\n".join(
        linha for linha in CODE_120.splitlines() if not linha.lstrip().startswith("--")
    )
    padrao = re.compile(
        r"^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b|"
        r"^\s*(BEGIN|COMMIT)\s*;",
        re.IGNORECASE | re.MULTILINE,
    )
    assert padrao.search(sem_comentario) is None
    assert "schema_migrations" not in sem_comentario
    for trecho in (
        "idx_chamados_tickets_workflow_reconcile",
        "cursor_updated_at",
        "cursor_ticket_id",
        "chamados_workflow_sha256_hex",
        "NOT EXISTS",
    ):
        assert trecho in CODE_120


def test_harness_sql_da_119_valida_hash_e_paginacao() -> None:
    assert TEST_119.is_file()
    sql = TEST_119.read_text(encoding="utf-8")
    assert "6141f258ecdd315419726e15067a001200a938d12cff993f630df204708fbc05" in sql
    assert "primeira página" in sql
    assert "segunda página" in sql
    assert "ROLLBACK;" in sql
