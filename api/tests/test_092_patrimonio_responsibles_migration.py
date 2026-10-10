"""Revisão estática da migration 092 (Patrimônio — diretório de responsáveis).

Responsável institucional NÃO depende de conta: `profile_id` é opcional
(ON DELETE SET NULL), matrícula preservada quando disponível, uniques parciais
por workspace (um registro por perfil e por matrícula). Leitura gated por
`patrimonio.view`; escrita por `patrimonio.responsibles.manage`.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "092_patrimonio_responsibles.sql"

SQL = MIGRATION.read_text(encoding="utf-8")


def test_092_tabela_com_colunas_essenciais():
    ddl = re.search(r"CREATE TABLE IF NOT EXISTS public\.patrimonio_responsibles \((.*?)\);", SQL, re.S)
    assert ddl, "CREATE TABLE de patrimonio_responsibles ausente"
    body = ddl.group(1)
    for col in ("nome", "matricula", "email", "profile_id", "workspace_id"):
        assert re.search(rf"\b{col}\b", body), f"coluna {col} ausente"
    assert "btrim(nome) <> ''" in body


def test_092_profile_id_opcional_e_set_null():
    fk = re.search(r"profile_id\s+UUID\s+REFERENCES public\.profiles\(id\) ON DELETE SET NULL", SQL)
    assert fk, "profile_id deve ser opcional com ON DELETE SET NULL (responsável sem conta é válido)"


@pytest.mark.parametrize(
    ("index_name", "key"),
    [("ux_patrimonio_responsibles_ws_profile", "profile_id"), ("ux_patrimonio_responsibles_ws_matricula", "matricula")],
)
def test_092_uniques_parciais_por_workspace(index_name, key):
    block = re.search(
        rf"CREATE UNIQUE INDEX IF NOT EXISTS {index_name}\s+ON public\.patrimonio_responsibles \(workspace_id, {key}\)\s+WHERE {key} IS NOT NULL",
        SQL,
    )
    assert block, f"unique parcial {index_name} ausente/incorreto"


@pytest.mark.parametrize(
    ("policy", "action", "cmd"),
    [
        ("patrimonio_responsibles_select", "patrimonio.view", "FOR SELECT"),
        ("patrimonio_responsibles_insert", "patrimonio.responsibles.manage", "FOR INSERT"),
        ("patrimonio_responsibles_update", "patrimonio.responsibles.manage", "FOR UPDATE"),
        ("patrimonio_responsibles_delete", "patrimonio.responsibles.manage", "FOR DELETE"),
    ],
)
def test_092_policies_gated_por_action(policy, action, cmd):
    block = re.search(
        rf'CREATE POLICY "{policy}"\s+ON public\.patrimonio_responsibles\s+{cmd}(.*?);',
        SQL,
        re.S,
    )
    assert block, f"policy {policy} ausente"
    assert re.search(rf"'\b{action}\b'", block.group(1)), f"{policy} sem gate {action}"


def test_092_acl_e_rls():
    assert re.search(r"REVOKE ALL ON public\.patrimonio_responsibles FROM anon", SQL)
    assert re.search(r"GRANT SELECT, INSERT, UPDATE, DELETE ON public\.patrimonio_responsibles TO authenticated", SQL)
    assert re.search(r"ALTER TABLE public\.patrimonio_responsibles ENABLE ROW LEVEL SECURITY", SQL)
