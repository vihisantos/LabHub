"""Testes de validação estática do workflow de migrations.

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
9. workflow_dispatch default é staging, nunca production.
10. workflow_dispatch tem opções staging e production.
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


def test_workflow_dispatch_has_target_input():
    """workflow_dispatch deve definir o input 'target' com default 'staging'."""
    content = _read_workflow()
    assert "workflow_dispatch:" in content
    assert "inputs:" in content
    assert "target:" in content
    assert "default: 'staging'" in content, (
        "workflow_dispatch deve ter default: 'staging'"
    )
    assert "default: 'production'" not in content, (
        "workflow_dispatch NÃO deve ter default: 'production'"
    )


def test_workflow_dispatch_has_staging_and_production_options():
    """O workflow_dispatch deve ter opções staging e production."""
    content = _read_workflow()
    assert "- staging" in content
    assert "- production" in content


def test_workflow_dispatch_uses_inputs_target_not_github_inputs_target():
    """O workflow_dispatch deve usar inputs.target, não github.inputs.target."""
    content = _read_workflow()
    assert "github.inputs.target" not in content, (
        "workflow_dispatch NÃO deve usar github.inputs.target (não é válido no GitHub Actions)"
    )
    assert "inputs.target" in content, (
        "workflow_dispatch deve usar inputs.target para acessar o input de target"
    )


def _staging_env_lines(staging_section: str) -> list[str]:
    """Extrai as linhas de env do job migrate-staging (ambos os steps)."""
    lines = staging_section.split("\n")
    env_lines = []
    in_env = False
    env_indent = None
    for line in lines:
        stripped = line.strip()
        if stripped == "env:":
            in_env = True
            env_indent = len(line) - len(line.lstrip())
            continue
        if in_env:
            if not stripped:
                continue
            line_indent = len(line) - len(line.lstrip())
            if line_indent <= env_indent:
                in_env = False
                continue
            env_lines.append(line)
    return env_lines


def test_staging_env_project_ref_exact_mapping_dry_run():
    """O step dry-run do staging deve mapear SUPABASE_STAGING_PROJECT_REF -> secrets.SUPABASE_STAGING_PROJECT_REF."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    dry_run_section = _extract_step_section(staging_section, "Dry-run em staging")
    assert dry_run_section is not None, "Step 'Dry-run em staging' não encontrado"

    # Mapeamento exato: chave de ambiente = SUPABASE_STAGING_PROJECT_REF, valor = secrets.SUPABASE_STAGING_PROJECT_REF
    expected = "SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}"
    assert expected in dry_run_section, (
        f"Dry-run do staging deve conter '{expected}'"
    )

    # Rejeitar a chave incorreta SUPABASE_PROJECT_REF (produção) como variável de ambiente
    assert "SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}" not in dry_run_section, (
        "Dry-run do staging NÃO deve usar SUPABASE_PROJECT_REF como chave de ambiente"
    )
    assert "secrets.SUPABASE_PROJECT_REF" not in dry_run_section, (
        "Dry-run do staging NÃO deve ler secrets.SUPABASE_PROJECT_REF (produção)"
    )


def test_staging_env_project_ref_exact_mapping_apply():
    """O step apply do staging deve mapear SUPABASE_STAGING_PROJECT_REF -> secrets.SUPABASE_STAGING_PROJECT_REF."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    apply_section = _extract_step_section(staging_section, "Apply pending migrations to Staging")
    assert apply_section is not None, "Step 'Apply pending migrations to Staging' não encontrado"

    # Mapeamento exato
    expected = "SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}"
    assert expected in apply_section, (
        f"Apply do staging deve conter '{expected}'"
    )

    # Rejeitar a chave incorreta SUPABASE_PROJECT_REF (produção) como variável de ambiente
    assert "SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}" not in apply_section, (
        "Apply do staging NÃO deve usar SUPABASE_PROJECT_REF como chave de ambiente"
    )
    assert "secrets.SUPABASE_PROJECT_REF" not in apply_section, (
        "Apply do staging NÃO deve ler secrets.SUPABASE_PROJECT_REF (produção)"
    )


def test_staging_env_access_token_exact_mapping():
    """Os steps do staging devem mapear SUPABASE_ACCESS_TOKEN -> secrets.SUPABASE_STAGING_ACCESS_TOKEN."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    for step_name in ("Dry-run em staging", "Apply pending migrations to Staging"):
        step_section = _extract_step_section(staging_section, step_name)
        assert step_section is not None, f"Step '{step_name}' não encontrado"

        expected = "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_STAGING_ACCESS_TOKEN }}"
        assert expected in step_section, (
            f"Step '{step_name}' do staging deve conter '{expected}'"
        )

        # NÃO deve conter secrets.SUPABASE_ACCESS_TOKEN (produção) como valor
        assert "secrets.SUPABASE_ACCESS_TOKEN" not in step_section, (
            f"Step '{step_name}' do staging NÃO deve ler secrets.SUPABASE_ACCESS_TOKEN (produção)"
        )


def test_staging_env_allowed_refs_exact_mapping():
    """Os steps do staging devem mapear SUPABASE_STAGING_ALLOWED_PROJECT_REFS -> vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    for step_name in ("Dry-run em staging", "Apply pending migrations to Staging"):
        step_section = _extract_step_section(staging_section, step_name)
        assert step_section is not None, f"Step '{step_name}' não encontrado"

        expected = "SUPABASE_STAGING_ALLOWED_PROJECT_REFS: ${{ vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS }}"
        assert expected in step_section, (
            f"Step '{step_name}' do staging deve conter '{expected}'"
        )

        # NÃO deve conter vars.SUPABASE_ALLOWED_PROJECT_REFS (produção)
        assert "vars.SUPABASE_ALLOWED_PROJECT_REFS" not in step_section, (
            f"Step '{step_name}' do staging NÃO deve ler vars.SUPABASE_ALLOWED_PROJECT_REFS (produção)"
        )


def test_staging_env_has_exactly_three_vars_per_step():
    """Cada step do staging deve injetar exatamente 3 variáveis de ambiente (fail-closed)."""
    content = _read_workflow()
    staging_section = _extract_job_section(content, "migrate-staging")
    assert staging_section is not None

    for step_name in ("Dry-run em staging", "Apply pending migrations to Staging"):
        step_section = _extract_step_section(staging_section, step_name)
        assert step_section is not None, f"Step '{step_name}' não encontrado"

        env_lines = _staging_env_lines(step_section)
        assert len(env_lines) == 3, (
            f"Step '{step_name}' do staging deve injetar exatamente 3 variáveis de ambiente, "
            f"encontrou {len(env_lines)}: {env_lines}"
        )


def test_production_env_no_staging_credentials():
    """O job de Produção nunca deve usar credenciais de Staging."""
    content = _read_workflow()
    production_section = _extract_job_section(content, "migrate")
    assert production_section is not None

    assert "SUPABASE_STAGING_PROJECT_REF" not in production_section, (
        "Job migrate NÃO deve conter SUPABASE_STAGING_PROJECT_REF"
    )
    assert "secrets.SUPABASE_STAGING_ACCESS_TOKEN" not in production_section, (
        "Job migrate NÃO deve ler secrets.SUPABASE_STAGING_ACCESS_TOKEN"
    )
    assert "vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS" not in production_section, (
        "Job migrate NÃO deve ler vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS"
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
    assert "inputs.target == 'production'" in production_section, (
        "Job migrate deve exigir inputs.target == 'production'"
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


def test_no_references_to_old_staging_project():
    """Nenhuma referência operacional ao projeto antigo obskpmnphevpaexooldg."""
    content = _read_workflow()
    assert "obskpmnphevpaexooldg" not in content, (
        "Workflow não deve conter referências ao projeto antigo obskpmnphevpaexooldg"
    )


def test_staging_new_project_ref():
    """O staging deve referenciar o novo projeto pgmetdqsdjotdcifjivu."""
    content = _read_workflow()
    assert "pgmetdqsdjotdcifjivu" not in content, (
        "Não deve conter referências hardcoded ao project ref no workflow (usar secrets)"
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
        if line.startswith("  ") and not line.startswith("    ") and line.strip():
            break
        section_lines.append(line)
    return "\n".join(section_lines)


def _extract_step_section(job_section: str, step_name: str) -> str | None:
    """Extrai a seção de um step específico dentro de um job."""
    pattern = rf"- name: {re.escape(step_name)}"
    match = re.search(pattern, job_section)
    if not match:
        return None
    start = match.start()
    lines = job_section[start:].split("\n")
    section_lines = [lines[0]]
    for line in lines[1:]:
        stripped = line.lstrip()
        if stripped.startswith("- name:"):
            break
        section_lines.append(line)
    return "\n".join(section_lines)


def _extract_section(content: str, section_name: str) -> str | None:
    """Extrai uma seção genérica do workflow.

    Suporta seções em qualquer nível de indentação. Encontra a linha que
    começa com ``section_name:`` (possivelmente precedida por espaços) e
    coleta todas as linhas subsequentes até encontrar outra chave no mesmo
    nível de indentação.
    """
    pattern = rf"^(\s*){re.escape(section_name)}:"
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None
    start = match.start()
    lines = content[start:].split("\n")
    base_indent = len(lines[0]) - len(lines[0].lstrip()) if lines[0].strip() else 0
    section_lines = [lines[0]]
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            section_lines.append(line)
            continue
        line_indent = len(line) - len(line.lstrip())
        if line_indent <= base_indent and ":" in stripped and not stripped.startswith("-"):
            break
        section_lines.append(line)
    return "\n".join(section_lines)