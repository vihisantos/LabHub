"""Contrato estático do E2E das três ondas em Staging."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "ci" / "chamados_workflow_waves_e2e_staging.py"
WORKFLOW = ROOT / ".github" / "workflows" / "staging-reminders-integration.yml"
DOCS = ROOT / "docs" / "operations" / "chamados-qstash-workflow-staging.md"

CODE = SCRIPT.read_text(encoding="utf-8")
YAML = WORKFLOW.read_text(encoding="utf-8")
DOC = DOCS.read_text(encoding="utf-8")


def test_script_existe_e_e_opt_in() -> None:
    assert SCRIPT.is_file()
    assert "SCENARIOS = (\"both\", \"unassigned\", \"assigned\")" in CODE
    assert "_staging_api()" in CODE
    assert "_dispatch_url()" in CODE
    assert "VERCEL_AUTOMATION_BYPASS_SECRET" in CODE
    assert "WAVE_INTERVAL_SECONDS = 120" in CODE
    assert "wf-e2e-" in CODE
    assert "KEEP_E2E_DATA" in CODE
    # Nenhuma credencial pode ser impressa; só IDs sintéticos e janelas ISO.
    assert "print(" in CODE
    assert "QSTASH_TOKEN" not in CODE
    assert "SUPABASE_SERVICE_KEY" not in CODE


def test_script_cobre_as_tres_ondas_e_a_atribuicao() -> None:
    assert "for wave in (1, 2, 3):" in CODE
    assert "atribuição aplicada após a primeira onda" in CODE
    assert "baseline_after_assignment" in CODE
    assert "current_job" in CODE
    assert "chamado_reminder_sent_marks" in CODE
    assert "janela de correlação" in CODE
    assert "publicação REAL confirmada" in CODE


def test_workflow_expoe_os_dois_cenarios_sem_tocar_no_cron() -> None:
    assert "run_workflow_waves_e2e:" in YAML
    assert "wave_scenario:" in YAML
    assert "chamados_workflow_waves_e2e_staging.py" in YAML
    assert "timeout-minutes: 25" in YAML
    assert "push-cron.yml" not in YAML


def test_documentacao_registra_limite_e_risco_do_runner() -> None:
    assert "20 candidatos por tick" in DOC
    assert "24 h" in DOC
    assert "Antes do merge na `main`" in DOC
    assert "115–120" in DOC
    assert "backup/restore" in DOC
    assert "Revisão estática já feita" in DOC


def test_documentacao_registra_as_medicoes_das_tres_ondas() -> None:
    assert "## Validação funcional das três ondas" in DOC
    assert "44918925820" in DOC
    assert "44920500824" in DOC
    assert "14 POSTs" in DOC
    assert "HTTP 200" in DOC
    assert "2/2" in DOC
