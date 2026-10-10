"""Revisão estática da migration 094 (Patrimônio — histórico append-only + motor).

Invariantes verificados no DDL:
  1. append-only: exatamente 2 policies (SELECT/INSERT); ZERO policies de
     UPDATE/DELETE; sem GRANT de UPDATE/DELETE para authenticated;
  2. gates: leitura `patrimonio.view`; INSERT `patrimonio.asset.move`;
  3. 3 funções SECURITY DEFINER com search_path fixo;
  4. guarda do ativo usa `pg_trigger_depth` (não forjável pelo cliente) e
     trava `workspace_id` mutável;
  5. motor valida workspace cruzado, `criacao` forjada, terminal `baixado`,
     empréstimo duplo e devolução sem empréstimo ativo;
  6. snapshots do responsável gravados no próprio movimento.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "094_asset_movements.sql"

SQL = MIGRATION.read_text(encoding="utf-8")


def test_094_apend_only_sem_policies_de_update_delete():
    policies = re.findall(r'CREATE POLICY "([^"]+)"\s+ON public\.asset_movements\s+FOR (\w+)', SQL)
    assert ("asset_movements_select", "SELECT") in policies
    assert ("asset_movements_insert", "INSERT") in policies
    for name, cmd in policies:
        assert cmd in ("SELECT", "INSERT"), f"policy {name} ({cmd}) viola append-only"
    assert len(policies) == 2, f"esperadas 2 policies, encontradas {len(policies)}"


def test_094_sem_grant_de_update_delete():
    grants = re.findall(r"GRANT ([A-Z, ]+) ON public\.asset_movements TO authenticated", SQL)
    assert grants == ["SELECT, INSERT"], f"grants para authenticated incorretos: {grants}"
    assert re.search(r"REVOKE ALL ON public\.asset_movements FROM anon", SQL)
    assert re.search(r"REVOKE ALL ON public\.asset_movements FROM PUBLIC", SQL)


def test_094_gates_de_leitura_e_escrita():
    sel_block = re.search(r'CREATE POLICY "asset_movements_select"(.*?);', SQL, re.S)
    assert sel_block and re.search(r"'\bpatrimonio\.view\b'", sel_block.group(1))
    ins_block = re.search(r'CREATE POLICY "asset_movements_insert"(.*?);', SQL, re.S)
    assert ins_block and re.search(r"'\bpatrimonio\.asset\.move\b'", ins_block.group(1))


def test_094_tres_funcoes_security_definer_com_search_path():
    for fn in ("patrimonio_assets_guard", "patrimonio_asset_created_history", "patrimonio_apply_movement"):
        block = re.search(rf"CREATE OR REPLACE FUNCTION public\.{fn}\(\)(.*?)\$\$;", SQL, re.S)
        assert block, f"função {fn} ausente"
        body = block.group(1)
        assert "SECURITY DEFINER" in body, f"{fn} sem SECURITY DEFINER"
        assert "SET search_path = public" in body, f"{fn} sem search_path fixo"


def test_094_guarda_usa_pg_trigger_depth_e_trava_workspace():
    guard = re.search(r"CREATE OR REPLACE FUNCTION public\.patrimonio_assets_guard\(\)(.*?)\$\$;", SQL, re.S)
    body = guard.group(1)
    assert "pg_trigger_depth() <= 1" in body, "guarda sem discriminação de profundidade"
    assert "NEW.workspace_id IS DISTINCT FROM OLD.workspace_id" in body
    assert "ERRCODE = '42501'" in body


def test_094_triggers_nas_tabelas_certas():
    assert re.search(
        r"CREATE TRIGGER trg_assets_patrimonio_guard\s+BEFORE UPDATE ON public\.assets", SQL
    )
    assert re.search(
        r"CREATE TRIGGER trg_assets_patrimonio_history\s+AFTER INSERT ON public\.assets", SQL
    )
    assert re.search(
        r"CREATE TRIGGER trg_asset_movements_apply\s+BEFORE INSERT ON public\.asset_movements", SQL
    )


def test_094_motor_valida_regras_de_estado():
    motor = re.search(r"CREATE OR REPLACE FUNCTION public\.patrimonio_apply_movement\(\)(.*?)\$\$;", SQL, re.S)
    body = motor.group(1)
    # isolamento em profundidade + criacao forjada
    assert "movimento em workspace diferente do ativo" in body
    assert "pg_trigger_depth() <= 1" in body
    # ciclo de empréstimo sem estados contraditórios
    assert "ativo ja esta emprestado" in body
    assert "devolucao sem emprestimo ativo" in body
    assert "ativo baixado e terminal" in body
    # destino sempre da mesma unidade
    assert "local de destino pertence a outra unidade" in body
    assert "responsavel de destino pertence a outra unidade" in body
    # snapshot imune a renomeação
    assert "NEW.to_responsible_nome" in body and "NEW.to_responsible_matricula" in body
    # autoria nunca do cliente
    assert "COALESCE(NEW.performed_by, auth.uid())" in body


def test_094_fk_do_historico_com_restrict():
    assert re.search(
        r"asset_id\s+UUID NOT NULL REFERENCES public\.assets\(id\) ON DELETE RESTRICT", SQL
    ), "ativo com histórico não pode ser apagado (RESTRICT obrigatório)"
