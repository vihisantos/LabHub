"""Validação estática da separação de credenciais no workflow de migrations.

Adaptado dos testes de segurança da PR #483 para o desenho final: aqui não existe
``workflow_dispatch``. PR interna valida staging, produção só após merge.
``scope -> validate -> stage-migrations -> premerge-gate``; main mantém release-gate.
"""
from __future__ import annotations

import re
from pathlib import Path

WORKFLOW_PATH = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "migrations.yml"
TEXT = WORKFLOW_PATH.read_text(encoding="utf-8")
LINES = TEXT.splitlines()
_JOB_RE = re.compile(r"^  [A-Za-z0-9_-]+:\s*$")


def _job_block(name: str) -> str:
    start = None
    for idx, line in enumerate(LINES):
        if line == f"  {name}:":
            start = idx
            break
    assert start is not None, f"job ausente: {name}"
    end = len(LINES)
    for idx in range(start + 1, len(LINES)):
        if _JOB_RE.match(LINES[idx]):
            end = idx
            break
    return "\n".join(LINES[start:end])


def _env_blocks(block: str) -> list[str]:
    result: list[str] = []
    current: list[str] = []
    env_indent = None
    for line in block.splitlines()[1:]:
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if line.strip() == "env:":
            if current:
                result.append("\n".join(current))
            current = []
            env_indent = indent
            continue
        if env_indent is not None:
            if indent <= env_indent:
                if current:
                    result.append("\n".join(current))
                current = []
                env_indent = None
            else:
                current.append(line)
    if current:
        result.append("\n".join(current))
    return result


def test_staging_uses_only_staging_credentials_in_every_step() -> None:
    env_blocks = _env_blocks(_job_block("stage-migrations"))
    target_envs = [env for env in env_blocks if "SUPABASE_STAGING_PROJECT_REF:" in env]
    assert len(target_envs) >= 5
    for env in target_envs:
        assert (
            "SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}" in env
        )
        assert (
            "SUPABASE_STAGING_ACCESS_TOKEN: ${{ secrets.SUPABASE_STAGING_ACCESS_TOKEN }}" in env
        )
        assert "SUPABASE_STAGING_ALLOWED_PROJECT_REFS: ${{ vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS }}" in env
        assert "SUPABASE_PROJECT_REF:" not in env
        assert "SUPABASE_ACCESS_TOKEN:" not in env
        assert "secrets.SUPABASE_PROJECT_REF" not in env
        assert "secrets.SUPABASE_ACCESS_TOKEN" not in env


def test_production_uses_only_production_credentials_in_every_step() -> None:
    env_blocks = _env_blocks(_job_block("production"))
    target_envs = [env for env in env_blocks if "SUPABASE_ACCESS_TOKEN:" in env]
    assert len(target_envs) >= 4
    for env in target_envs:
        assert "SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}" in env
        assert "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}" in env
        assert "BASELINE_VERSION: ${{ secrets.BASELINE_VERSION }}" in env
        assert "SUPABASE_STAGING_" not in env
        assert "secrets.SUPABASE_STAGING_" not in env


def test_no_manual_dispatch_or_environment_approval() -> None:
    # Comentários explicam a ausência do gate; só contam linhas de configuração.
    config = [line for line in LINES if not line.lstrip().startswith("#")]
    assert not any(line.strip().startswith("workflow_dispatch:") for line in config)
    assert [line.strip() for line in config if line.strip().startswith("environment:")] == ["environment: production-migrations"]
    assert "environment: production-migrations" in _job_block("production")
    assert "secrets.SUPABASE_PRODUCTION_ENV_READY" in _job_block("production")
    assert 'if [ "$PRODUCTION_ENV_READY" != 1 ]' in _job_block("production")
    assert "SUPABASE_PRODUCTION_ENV_READY" not in _job_block("stage-migrations")
    for forbidden in (
        "MIGRATIONS_RELEASE_APPROVED",
        "required_reviewers",
        "inputs.confirm",
    ):
        assert forbidden not in TEXT


def test_pull_requests_cannot_apply_to_production() -> None:
    for job_name in ("release-gate", "production"):
        block = _job_block(job_name)
        assert "github.event_name == 'push'" in block
        assert "github.ref == 'refs/heads/main'" in block
        assert "pull_request" not in block
    stage = _job_block("stage-migrations")
    assert "github.event.pull_request.head.repo.full_name == github.repository" in stage
    assert "staging_candidate_guard.py" in stage
    assert "secrets.SUPABASE_ACCESS_TOKEN" not in stage
    gate = _job_block("premerge-gate")
    assert "always()" in gate
    assert 'test "$STAGING_RESULT" = success' in gate
    validate = _job_block("validate")
    assert "github.event_name == 'pull_request'" in validate
    assert "secrets." not in validate


def test_shared_jobs_never_use_from_scratch() -> None:
    for job_name in ("stage-migrations", "production"):
        assert "--from-scratch" not in _job_block(job_name)


def test_production_depends_on_the_automatic_staging_gate() -> None:
    assert "needs: release-gate" in _job_block("production")
    gate = _job_block("release-gate")
    assert "needs: [validate, stage-migrations]" in gate
    assert "release_gate.py verify" in gate
