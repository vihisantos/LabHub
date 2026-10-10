"""Revisão estática da migration 095 (Patrimônio — matriz de acesso AJUSTADA).

Matriz efetiva:
  patrimonio.view  → tec + coordinator (leitura de DADO via RLS)
  7 operações      → tec exclusivamente
  vis/lider/demais → ZERO Actions de patrimônio
  coordinator      → SEM exportação (consulta pura, até decisão explícita)
  sem wildcard; scope=workspace; super admin fora das Actions (bypass vive
  nas policies — invariante da 059); TRAVAS fail-closed abortam a migration.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "095_patrimonio_rbac_actions.sql"

SQL = MIGRATION.read_text(encoding="utf-8")

MUTATIONS = (
    "patrimonio.asset.create",
    "patrimonio.asset.edit",
    "patrimonio.asset.move",
    "patrimonio.locations.manage",
    "patrimonio.responsibles.manage",
    "patrimonio.import.run",
    "patrimonio.export",
)
ALL_ACTIONS = ("patrimonio.view",) + MUTATIONS


def test_095_seeds_no_escopo_workspace():
    seeds = re.findall(r"\(\s*v_(\w+),\s+'(patrimonio\.[^']+)',\s+'(\w+)'\)", SQL)
    assert len(seeds) == 9, f"esperadas 9 seeds (2 view + 7 operações), encontradas {len(seeds)}"
    by_action = {action: role for role, action, _ in seeds}
    for action in MUTATIONS:
        assert by_action.get(action) == "tec", f"{action} deve ser concedida só ao tec"
    assert all(scope == "workspace" for _, _, scope in seeds)


def test_095_view_para_tec_e_coordinator():
    block = re.search(r"INSERT INTO public\.role_permissions \(role_id, action, scope\) VALUES(.*?)ON CONFLICT", SQL, re.S)
    assert block, "seed ausente"
    body = block.group(1)
    view_rows = re.findall(r"\(\s*v_\w+,\s+'patrimonio\.view',\s+'workspace'\)", body)
    assert len(view_rows) == 2, "patrimonio.view deve ter exatamente 2 seeds (tec + coordinator)"
    assert "v_coordinator" in body and "v_tec" in body


def test_095_trava_view_somente_tec_coordinator():
    assert re.search(
        r"patrimonio\.view[^;]*?r\.slug NOT IN \('tec', 'coordinator'\)", SQL, re.S
    ) or re.search(r"r\.slug NOT IN \('tec', 'coordinator'\)[^;]*?patrimonio\.view", SQL, re.S), (
        "TRAVA de patrimonio.view ausente"
    )


def test_095_trava_mutacoes_somente_tec():
    block = re.search(r"rp\.action IN \(\s*'patrimonio\.asset\.create'.*?\)\s+AND r\.slug <> 'tec'", SQL, re.S)
    assert block, "TRAVA de mutações exclusivas do tec ausente"


def test_095_trava_vis_e_lider_zerados():
    block = re.search(r"r\.slug IN \('vis', 'lider'\)\s+AND rp\.action LIKE 'patrimonio\.%'", SQL)
    assert block, "TRAVA vis/lider sem Actions de patrimônio ausente"


def test_095_trava_sem_wildcards_e_sem_scope_errado():
    assert re.search(r"rp\.action LIKE 'patrimonio\.%'\s*\n?\s*AND \(rp\.action LIKE '%\*%'", SQL), (
        "TRAVA de wildcard ausente"
    )
    assert re.search(
        r"WHERE rp\.action LIKE 'patrimonio\.%'\s*\n?\s*AND rp\.scope <> 'workspace'", SQL
    ), "TRAVA de scope ausente"


def test_095_coordinator_sem_exportacao():
    # a seed não concede export ao coordinator e a TRAVA 2 aborta se alguém conceder
    seeds = re.findall(r"\(v_(\w+), '(patrimonio\.export)'", SQL)
    assert seeds == [("tec", "patrimonio.export")], "export deve ser exclusivo do tec"


def test_095_fail_closed_se_roles_ausentes():
    assert "roles tec/coordinator ausentes" in SQL, "seed deve abortar sem as roles do RBAC 2.0"
    assert "ON CONFLICT (role_id, action, scope) DO NOTHING" in SQL, "seed idempotente"


def test_095_super_admin_fora_das_actions():
    # nenhuma seed usa super admin; menção ao bypass só em comentário/policy
    seeds = re.findall(r"\(\s*v_(\w+),\s+'patrimonio\.", SQL)
    assert all(role in ("tec", "coordinator") for role in seeds)
    insert_block = re.search(r"INSERT INTO public\.role_permissions.*?ON CONFLICT.*?;", SQL, re.S).group(0)
    assert "is_super_admin" not in insert_block
