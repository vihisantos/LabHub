"""Testes estáticos da migration 118 (contrato somente leitura da 117)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "118_chamados_workflow_outbox_reconcile_contract.sql"
CODE = MIGRATION.read_text(encoding="utf-8")
SEM_COMMENTARIO = "\n".join(
    linha for linha in CODE.splitlines() if not linha.lstrip().startswith("--")
)


def test_118_existe_e_e_somente_leitura() -> None:
    assert MIGRATION.is_file()
    padrao = re.compile(
        r"^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b|"
        r"^\s*(BEGIN|COMMIT)\s*;",
        re.IGNORECASE | re.MULTILINE,
    )
    assert padrao.search(SEM_COMMENTARIO) is None
    assert "schema_migrations" not in SEM_COMMENTARIO


def test_118_cobre_todos_os_objetos_da_117() -> None:
    base = (ROOT / "supabase" / "migrations" / "117_chamados_workflow_outbox_reconcile.sql").read_text(
        encoding="utf-8"
    )
    funcoes = set(re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)", base))
    assert funcoes == {
        "chamados_workflow_outbox_reconcile_tick",
        "chamados_workflow_outbox_reconcile_candidates",
    }
    for nome in funcoes:
        assert nome in CODE, f"funcao {nome} nao verificada"
    for coluna in ("singleton", "last_run_at"):
        assert f"'{coluna}'" in CODE, f"coluna {coluna} nao verificada"


def test_118_valida_rls_e_grants_sem_recriar() -> None:
    assert "has_table_privilege('service_role'" in CODE
    assert "has_function_privilege('service_role'" in CODE
    assert "has_function_privilege('public'" in CODE
    assert "relforcerowsecurity" in CODE
    assert "prosecdef" in CODE
    assert "search_path" in CODE
    assert "RAISE EXCEPTION" in CODE
