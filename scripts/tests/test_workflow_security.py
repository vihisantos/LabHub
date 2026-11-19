"""Testes de integração para validar o workflow de migrations.

Estes testes fazem validação estática do arquivo .github/workflows/migrations.yml
para garantir que:

1. As variáveis de ambiente do job migrate-staging correspondem exatamente ao
   contrato de environment.py (SUPABASE_STAGING_PROJECT_REF, não SUPABASE_PROJECT_REF).
2. Staging nunca recebe credenciais de Produção.
3. Produção nunca recebe credenciais de Staging.
4. PR nunca executa o job de Produção.
5. Dispatch com destino staging nunca executa Produção.
6. Dispatch em branch diferente da main nunca executa Produção.
7. Push na main executa os dois ambientes após validate.
8. Staging vazio usa --from-scratch e não registra versões artificialmente.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

WORKFLOW_PATH = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "migrations.yml"


def _read_workflow() -> str:
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def test_workflow_file_exists():
    """O arquivo do workflow deve existir."""
    assert WORKFLOW_PATH.is_file(), f"Workflow não encontrado: {WORKFLOW_PATH}"


def test_workflow_has_three_jobs():
    """O workflow deve definir exatamente três jobs: validate, migrate-staging, migrate."""
    content = _read_workflow()
    assert "validate:" in content
    assert "migrate-staging:" in content
    assert "migrate:" in content


def test_staging_job_uses_staging_project_ref_secret():
    """O job migrate-staging deve usar SUPABASE_STAGING_PROJECT_REF, não SUPABASE_PROJECT_REF."""
    content = _read_workflow()
    # Encontrar a seção do job migrate-staging
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None, "Job migrate-staging não encontrado"

    # Deve conter SUPABASE_STAGING_PROJECT_REF (secret correto do staging)
    assert "SUPABASE_STAGING_PROJECT_REF" in staging_section, (
        "Job migrate-staging deve usar SUPABASE_STAGING_PROJECT_REF"
    )
    assert "secrets.SUPABASE_STAGING_PROJECT_REF" in staging_section, (
        "Job migrate-staging deve ler SUPABASE_STAGING_PROJECT_REF do secrets"
    )
    # NÃO deve conter SUPABASE_PROJECT_REF (produção) no job de staging
    assert "secrets.SUPABASE_PROJECT_REF" not in staging_section, (
        "Job migrate-staging NÃO deve usar secrets.SUPABASE_PROJECT_REF (produção)"
    )


def test_staging_job_uses_staging_access_token_secret():
    """O job migrate-staging deve usar SUPABASE_STAGING_ACCESS_TOKEN, não SUPABASE_ACCESS_TOKEN."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    assert "secrets.SUPABASE_STAGING_ACCESS_TOKEN" in staging_section, (
        "Job migrate-staging deve ler SUPABASE_STAGING_ACCESS_TOKEN do secrets"
    )
    assert "secrets.SUPABASE_ACCESS_TOKEN" not in staging_section, (
        "Job migrate-staging NÃO deve usar secrets.SUPABASE_ACCESS_TOKEN (produção)"
    )


def test_staging_job_uses_staging_allowed_refs_variable():
    """O job migrate-staging deve usar SUPABASE_STAGING_ALLOWED_PROJECT_REFS, não SUPABASE_ALLOWED_PROJECT_REFS."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    assert "vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS" in staging_section, (
        "Job migrate-staging deve ler SUPABASE_STAGING_ALLOWED_PROJECT_REFS das vars"
    )
    assert "vars.SUPABASE_ALLOWED_PROJECT_REFS" not in staging_section, (
        "Job migrate-staging NÃO deve usar vars.SUPABASE_ALLOWED_PROJECT_REFS (produção)"
    )


def test_production_job_uses_production_project_ref_secret():
    """O job migrate deve usar SUPABASE_PROJECT_REF (produção), não SUPABASE_STAGING_PROJECT_REF."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None, "Job migrate não encontrado"

    assert "secrets.SUPABASE_PROJECT_REF" in production_section, (
        "Job migrate deve ler SUPABASE_PROJECT_REF do secrets"
    )
    assert "secrets.SUPABASE_STAGING_PROJECT_REF" not in production_section, (
        "Job migrate NÃO deve usar secrets.SUPABASE_STAGING_PROJECT_REF (staging)"
    )


def test_production_job_uses_production_allowed_refs_variable():
    """O job migrate deve usar SUPABASE_ALLOWED_PROJECT_REFS, não SUPABASE_STAGING_ALLOWED_PROJECT_REFS."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    assert "vars.SUPABASE_ALLOWED_PROJECT_REFS" in production_section, (
        "Job migrate deve ler SUPABASE_ALLOWED_PROJECT_REFS das vars"
    )
    assert "vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS" not in production_section, (
        "Job migrate NÃO deve usar vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS (staging)"
    )


def test_staging_job_uses_from_scratch():
    """O job migrate-staging deve usar --from-scratch tanto no dry-run quanto na aplicação real."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    # Dry-run deve incluir --from-scratch
    dry_run_section = _extract_step_section(staging_section, "Dry-run em staging")
    assert "--from-scratch" in dry_run_section, (
        "Dry-run do staging deve incluir --from-scratch"
    )
    assert "--dry-run" in dry_run_section, (
        "Dry-run do staging deve incluir --dry-run"
    )

    # Aplicação real deve incluir --from-scratch
    apply_section = _extract_step_section(staging_section, "Apply pending migrations to Staging")
    assert "--from-scratch" in apply_section, (
        "Aplicação do staging deve incluir --from-scratch"
    )
    assert "--dry-run" not in apply_section, (
        "Aplicação real do staging NÃO deve incluir --dry-run"
    )


def test_production_job_does_not_use_from_scratch():
    """O job migrate (produção) NÃO deve usar --from-scratch."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    # Nem dry-run nem aplicação real devem usar --from-scratch em produção
    assert "--from-scratch" not in production_section, (
        "Job migrate (produção) NÃO deve usar --from-scratch"
    )


def test_pr_never_runs_production_job():
    """O job de Produção nunca deve rodar em pull_request."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    # A condição do job migrate não deve incluir pull_request
    assert "pull_request" not in production_section.split("runs-on:")[0], (
        "Job migrate não deve ser executado em pull_request"
    )


def test_workflow_dispatch_staging_never_runs_production():
    """O workflow_dispatch com target=staging nunca deve executar o job de Produção."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    # A condição do job migrate deve exigir target=production
    assert "github.inputs.target == 'production'" in production_section, (
        "Job migrate deve exigir github.inputs.target == 'production'"
    )


def test_workflow_dispatch_non_main_never_runs_production():
    """O workflow_dispatch em branch diferente da main nunca deve executar Produção."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    # A condição deve exigir github.ref == 'refs/heads/main'
    assert "github.ref == 'refs/heads/main'" in production_section, (
        "Job migrate deve exigir github.ref == 'refs/heads/main'"
    )


def test_push_main_runs_both_jobs():
    """Push na main deve executar ambos os ambientes após validate."""
    content = _read_workflow()

    # migrate-staging deve rodar em push/main
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None
    assert "github.event_name == 'push' && github.ref == 'refs/heads/main'" in staging_section, (
        "Job migrate-staging deve rodar em push para main"
    )

    # migrate deve rodar em push/main
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None
    assert "github.event_name == 'push' && github.ref == 'refs/heads/main'" in production_section, (
        "Job migrate deve rodar em push para main"
    )


def test_workflow_dispatch_default_is_staging():
    """O valor padrão do workflow_dispatch deve ser staging, nunca production."""
    content = _read_workflow()
    wf_dispatch_section = _extract_section(content, "workflow_dispatch")
    assert wf_dispatch_section is not None
    assert "default: 'staging'" in wf_dispatch_section, (
        "workflow_dispatch deve ter default: 'staging'"
    )
    assert "default: 'production'" not in wf_dispatch_section, (
        "workflow_dispatch NÃO deve ter default: 'production'"
    )


def test_workflow_dispatch_has_staging_and_production_options():
    """O workflow_dispatch deve ter opções staging e production."""
    content = _read_workflow()
    wf_dispatch_section = _extract_section(content, "workflow_dispatch")
    assert wf_dispatch_section is not None
    assert "staging" in wf_dispatch_section
    assert "production" in wf_dispatch_section


def test_no_references_to_old_staging_project():
    """Nenhuma referência operacional ao projeto antigo obskpmnphevpaexooldg."""
    content = _read_workflow()
    assert "obskpmnphevpaexooldg" not in content, (
        "Workflow não deve conter referências ao projeto antigo obskpmnphevpaexooldg"
    )


def _extract_job_section(content: str, job_name: str) -> str | None:
    """Extrai a seção de um job específico do workflow YAML."""
    # Procurar por "  job_name:" (com indentação de 2 espaços)
    pattern = rf"^  {re.escape(job_name)}:"
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None
    start = match.start()
    # Encontrar o próximo job (linha que começa com 2 espaços e não é um passo)
    lines = content[start:].split("\n")
    section_lines = [lines[0]]  # Primeira linha (nome do job)
    for line in lines[1:]:
        # Se a linha começa com 2 espaços e não é um passo (não começa com "      -")
        # e não está vazia, é um novo job
        if line.startswith("  ") and not line.startswith("    ") and line.strip():
            break
        section_lines.append(line)
    return "\n".join(section_lines)


def _extract_step_section(job_section: str, step_name: str) -> str | None:
    """Extrai a seção de um step específico dentro de um job."""
    # Procurar por "- name: step_name"
    pattern = rf"- name: {re.escape(step_name)}"
    match = re.search(pattern, job_section)
    if not match:
        return None
    start = match.start()
    lines = job_section[start:].split("\n")
    section_lines = [lines[0]]  # Primeira linha (nome do step)
    for line in lines[1:]:
        # Se a linha começa com "- name:" é um novo step
        if line.startswith("- name:"):
            break
        section_lines.append(line)
    return "\n".join(section_lines)


def _extract_section(content: str, section_name: str) -> str | None:
    """Extrai uma seção genérica do workflow.

    Suporta seções em qualquer nível de indentação. Encontra a linha que
    começa com `section_name:` (possivelmente precedida por espaços) e
    coleta todas as linhas subsequentes até encontrar outra chave no mesmo
    nível de indentação.
    """
    # Encontrar a linha da seção (pode ter qualquer indentação)
    pattern = rf"^(\s*){re.escape(section_name)}:"
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None
    start = match.start()
    base_indent = len(match.group(1))

    lines = content[start:].split("\n")
    section_lines = [lines[0]]
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            section_lines.append(line)
            continue
        line_indent = len(line) - len(line.lstrip())
        # Se a linha tem o mesmo ou menor indent que a seção base e tem ":" 
        # (é uma nova chave no mesmo nível ou superior), parar
        if line_indent <= base_indent and ":" in stripped and not stripped.startswith("-"):
            break
        section_lines.append(line)
    return "\n".join(section_lines)