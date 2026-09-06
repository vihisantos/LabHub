"""Revisão estática da migration 042_rbac2_profiles_role_check_coordinator.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática
do DDL). Esta migration alinha o CHECK `profiles_role_check` (legado da 001)
ao cargo Coordenador Multiunidade introduzido na 040 — sem ela, a aprovação
de um coordenador falha com 23514 check_violation, pois profiles.role
'coordinator' é recusado no banco apesar do app gravá-lo (adminService) e da
041 mapeá-lo para memberships.

Garantias verificadas aqui:
  - DROP CONSTRAINT IF EXISTS profiles_role_check (idempotente).
  - ADD CONSTRAINT com os 4 canônicos (inclui 'coordinator').
  - Formato roleId legado preservado (não rejeita dados históricos).
  - Nenhuma tabela/RLS/seed nova; nenhum DML.

Links:
  - Migration:   supabase/migrations/042_rbac2_profiles_role_check_coordinator.sql
  - Espec RBAC:  docs/architecture/rbac2.0-specification.md
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "042_rbac2_profiles_role_check_coordinator.sql"
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


class TestSubstituicaoDoConstraint:
    def test_drop_idempotente(self, sql):
        assert re.search(
            r"ALTER TABLE public\.profiles DROP CONSTRAINT IF EXISTS profiles_role_check",
            sql,
        )

    def test_add_constraint_com_canonicos_incluindo_coordinator(self, sql):
        assert re.search(
            r"ALTER TABLE public\.profiles ADD CONSTRAINT profiles_role_check\s+"
            r"CHECK \(role IN \(",
            sql,
        )
        for valor in ("admin", "technician", "viewer", "coordinator"):
            assert f"'{valor}'" in sql, f"valor canônico {valor!r} ausente"

    def test_formato_roleid_preservado(self, sql):
        for valor in (
            "role-admin",
            "role-technician",
            "role-viewer",
            "role-coordinator",
        ):
            assert f"'{valor}'" in sql, f"forma roleId {valor!r} ausente"


class TestNaoDestrutivo:
    def test_nao_toca_outras_estruturas(self, sql):
        for proibido in (
            "CREATE TABLE",
            "DROP TABLE",
            "TRUNCATE",
            "CREATE POLICY",
            "DROP POLICY",
            "INSERT INTO",
            "UPDATE ",
            "DELETE FROM",
            "CREATE OR REPLACE FUNCTION",
        ):
            assert proibido not in sql, f"DDL/DML inesperado: {proibido!r}"

    def test_comentario_documenta_o_constraint(self, sql):
        assert "COMMENT ON CONSTRAINT profiles_role_check" in sql
