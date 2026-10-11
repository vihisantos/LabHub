"""Revisão estática da migration 093 (Patrimônio — evolução de public.assets).

Pontos-chave: colunas novas (`responsible_id`, `condition`), CHECKs de
status/condição (status SEM 'danificado' — condição física é outro eixo), FKs
"quentes" com ON DELETE RESTRICT (fecham bypass de histórico via DELETE), e
endurecimento das policies de escrita por Action (antes: membership genérica
da 033). DELETE permanece super admin only.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "093_assets_patrimonio_columns.sql"

SQL = MIGRATION.read_text(encoding="utf-8")

STATUS = ("draft", "disponivel", "em_uso", "emprestado", "manutencao", "em_transito", "nao_localizado", "baixado")
CONDITION = ("novo", "bom", "regular", "danificado", "inservivel")


def test_093_colunas_novas():
    assert re.search(r"ADD COLUMN IF NOT EXISTS responsible_id UUID", SQL)
    assert re.search(r"ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'bom'", SQL)


def test_093_check_de_condicao_sem_virar_status():
    cond = re.search(r"assets_condition_check\s+CHECK \(condition IN \((.*?)\)\)", SQL, re.S)
    assert cond, "assets_condition_check ausente"
    for value in CONDITION:
        assert f"'{value}'" in cond.group(1), f"condition sem '{value}'"

    status = re.search(r"assets_status_check\s+CHECK \(status IN \((.*?)\)\)", SQL, re.S)
    assert status, "assets_status_check ausente"
    for value in STATUS:
        assert f"'{value}'" in status.group(1), f"status sem '{value}'"
    # redundância proibida: 'danificado' é condition, não status
    assert "'danificado'" not in status.group(1), "'danificado' não pode ser status (é condition)"


def test_093_fks_quentes_com_restrict():
    loc = re.search(
        r"FOREIGN KEY \(location_id\) REFERENCES public\.patrimonio_locations\(id\)\s+ON DELETE RESTRICT",
        SQL,
    )
    assert loc, "FK de location_id ausente ou sem RESTRICT"
    resp = re.search(r"responsible_id UUID\s+REFERENCES public\.patrimonio_responsibles\(id\) ON DELETE RESTRICT", SQL)
    assert resp, "FK de responsible_id ausente ou sem RESTRICT"


def test_093_fk_somente_uma_vez_com_guarda_idempotente():
    assert "WHERE conname = 'assets_location_fk'" in SQL
    assert SQL.count("ADD CONSTRAINT assets_location_fk") == 1


@pytest.mark.parametrize(
    ("policy", "action"),
    [
        ("public_assets_insert", "patrimonio.asset.create"),
        ("public_assets_update", "patrimonio.asset.edit"),
        ("public_assets_select", "patrimonio.view"),
    ],
)
def test_093_policies_endurecidas_por_action(policy, action):
    block = re.search(rf'CREATE POLICY "{policy}"\s+ON public\.assets(.*?);', SQL, re.S)
    assert block, f"policy {policy} ausente"
    assert re.search(rf"'\b{action}\b'", block.group(1)), f"{policy} sem gate {action}"


def test_093_delete_somente_super_admin():
    block = re.search(r'CREATE POLICY "public_assets_delete"\s+ON public\.assets(.*?);', SQL, re.S)
    assert block, "policy delete ausente"
    body = block.group(1)
    assert "is_super_admin()" in body
    assert "user_has_action" not in body, "delete não pode ser aberto por Action"


def test_093_drop_das_policies_anteriores():
    for policy in ("public_assets_select", "public_assets_insert", "public_assets_update", "public_assets_delete"):
        assert re.search(rf'DROP POLICY IF EXISTS "{policy}" ON public\.assets', SQL), f"drop da {policy} ausente"


def test_093_indice_para_deduplicacao_de_import():
    assert re.search(
        r"CREATE INDEX IF NOT EXISTS idx_assets_ws_serial\s+ON public\.assets \(workspace_id, serial_number\)", SQL
    )
