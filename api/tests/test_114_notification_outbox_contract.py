"""Testes estáticos da migration 114 (contrato somente leitura da 113)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "114_notification_outbox_contract.sql"
CODE = MIGRATION.read_text(encoding="utf-8")
SEM_COMMENTARIO = "\n".join(
    linha for linha in CODE.splitlines() if not linha.lstrip().startswith("--")
)


def test_114_existe_e_e_somente_leitura() -> None:
    assert MIGRATION.is_file()
    # Comandos no início de linha seriam DDL/DML. 'INSERT'/'UPDATE' aparecem
    # como nome de privilégio dentro de has_table_privilege(...), o que é leitura.
    padrao = re.compile(
        r"^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b|"
        r"^\s*(BEGIN|COMMIT)\s*;",
        re.IGNORECASE | re.MULTILINE,
    )
    assert padrao.search(SEM_COMMENTARIO) is None
    assert "schema_migrations" not in SEM_COMMENTARIO


def test_114_cobre_todos_os_objetos_da_113() -> None:
    tabela_113 = (ROOT / "supabase" / "migrations" / "113_notification_outbox.sql").read_text(
        encoding="utf-8"
    )
    funcoes = set(re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)", tabela_113))
    indices = set(re.findall(r"CREATE INDEX IF NOT EXISTS (\w+)", tabela_113))
    assert funcoes, "a 113 deve declarar funcoes"
    assert indices, "a 113 deve declarar indices"
    for nome in funcoes:
        assert nome in CODE, f"funcao {nome} nao verificada"
    for nome in indices:
        assert nome in CODE, f"indice {nome} nao verificado"
    for coluna in (
        "event_id", "notification_id", "payload", "status", "attempts",
        "publish_attempts", "available_at", "published_at", "locked_by",
        "lock_token", "lock_expires_at", "last_error", "created_at",
        "updated_at", "delivered_at",
    ):
        assert f"'{coluna}'" in CODE, f"coluna {coluna} nao verificada"


def test_114_valida_rls_e_grants_sem_recriar() -> None:
    assert "has_table_privilege('service_role'" in CODE
    assert "has_function_privilege('service_role'" in CODE
    assert "has_function_privilege('public'" in CODE
    assert "relforcerowsecurity" in CODE
    assert "prosecdef" in CODE
    assert "search_path" in CODE
    assert "RAISE EXCEPTION" in CODE
