"""Contrato estático do agendamento do worker e do CI/CD automático.

O worker deve ser chamado pelo MESMO job do push-cron (sem novo job, sem
minutos extras de Actions, sem sobreposição) e o workflow de migrations deve
continuar aplicando pendentes automaticamente após merge na main: a validação
obrigatória vive nos checks da PR e no Staging, não em aprovação manual.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
CRON = (WORKFLOWS / "push-cron.yml").read_text(encoding="utf-8")
MIGRATIONS = (WORKFLOWS / "migrations.yml").read_text(encoding="utf-8")
STAGING = (WORKFLOWS / "staging-reminders-integration.yml").read_text(encoding="utf-8")


def test_worker_e_chamado_no_mesmo_job_do_push_cron() -> None:
    assert "jobs:" in CRON
    assert CRON.count("runs-on:") == 1, "nao criar segundo job de cron"
    assert "/api/notifications/worker" in CRON
    assert "-X POST" in CRON
    assert "Authorization: Bearer ${CRON_SECRET}" in CRON
    assert '{"publish_limit":5,"consume_limit":5}' in CRON
    assert 'test "$status" = "200"' in CRON


def test_cron_tem_concorrencia_e_timeout() -> None:
    assert "concurrency:" in CRON
    assert "group: push-cron" in CRON
    assert "cancel-in-progress: false" in CRON
    assert "timeout-minutes:" in CRON
    # Schedule deslocado para evitar o minuto cheio: a cada 5 minutos.
    assert re.search(r"- cron: '\d+(?:-\d+)?/5 \* \* \* \*'", CRON)
    assert "permissions:" in CRON


def test_migrations_continua_automatico_sem_aprovacao_manual() -> None:
    assert "branches: [main]" in MIGRATIONS
    assert "python scripts/migrate.py --target staging --dry-run" in MIGRATIONS
    assert "python scripts/migrate.py --target staging" in MIGRATIONS
    assert "python scripts/migrate.py --target production --dry-run" in MIGRATIONS
    assert "python scripts/migrate.py --target production" in MIGRATIONS
    # A promoção depende do gate automático de staging para o MESMO commit/run.
    assert "needs: validate" in MIGRATIONS
    assert "needs: [validate, stage-migrations]" in MIGRATIONS
    assert "needs: release-gate" in MIGRATIONS
    assert "stage-migrations:" in MIGRATIONS
    assert "release-gate:" in MIGRATIONS
    config = [line for line in MIGRATIONS.splitlines() if not line.lstrip().startswith("#")]
    assert not any(line.strip().startswith("workflow_dispatch:") for line in config)
    assert [line.strip() for line in config if line.strip().startswith("environment:")] == ["environment: production-migrations"]
    assert "SUPABASE_PRODUCTION_ENV_READY" in MIGRATIONS
    for proibido in (
        "MIGRATIONS_RELEASE_APPROVED",
        "MIGRATIONS_BACKUP_CONFIRMED",
        "required_reviewers",
        "inputs.confirm",
    ):
        assert proibido not in MIGRATIONS, f"gate manual indevido: {proibido}"


def test_staging_pode_registrar_113_e_114_pelo_runner() -> None:
    assert "apply_outbox_migration" in STAGING
    assert "--version 113 --filename 113_notification_outbox.sql" in STAGING
    assert "--version 114 --filename 114_notification_outbox_contract.sql" in STAGING
