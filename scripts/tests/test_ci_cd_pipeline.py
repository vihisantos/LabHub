"""Contrato do pipeline automático de migrations (consolidação #476/#477/#478/#483).

14 testes obrigatórios (m01..m14) + testes da estrutura YAML de jobs/deps.
Nenhum teste conecta em Supabase: o workflow é analisado como texto/YAML e as
políticas do runner são exercitadas com objetos/mocks locais.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from migrate.core import BaselineConfigurationError, pending_migrations  # noqa: E402
from migrate.environment import (  # noqa: E402
    ENV_STAGING_ALLOWED_REFS,
    EXPECTED_PRODUCTION_PROJECT_REF,
    EXPECTED_STAGING_PROJECT_REF,
    resolve_policy,
    validate_expected_destination,
    validate_project_ref,
)
from migrate.runner import _validate_baseline  # noqa: E402

WORKFLOW_PATH = ROOT / ".github" / "workflows" / "migrations.yml"
WORKFLOW_TEXT = WORKFLOW_PATH.read_text(encoding="utf-8")
CHECKS_SQL = ROOT / "supabase" / "migrations" / "tests" / "102_schema_migrations_lockdown_checks.sql"
STAGING_HEALTH = SCRIPTS / "ci" / "staging_integration_checks.py"
RELEASE_GATE = SCRIPTS / "ci" / "release_gate.py"

_STAGING_REF = "pgmetdqsdjotdcifjivu"
_OTHER_REF = "abcdefghijklmnopqrst"


class _WorkflowLoader(yaml.SafeLoader):
    """SafeLoader que não transforma a chave YAML `on` em booleano."""


for _ch, _resolvers in list(_WorkflowLoader.yaml_implicit_resolvers.items()):
    _WorkflowLoader.yaml_implicit_resolvers[_ch] = [
        (tag, regex)
        for tag, regex in _resolvers
        if tag != "tag:yaml.org,2002:bool"
    ]


def _workflow() -> dict:
    data = yaml.load(WORKFLOW_TEXT, Loader=_WorkflowLoader)
    assert isinstance(data, dict)
    return data


def _job(name: str) -> dict:
    jobs = _workflow()["jobs"]
    assert name in jobs, f"job ausente: {name}"
    return jobs[name]


def _steps(job_name: str) -> list[dict]:
    return [s for s in _job(job_name).get("steps", []) if isinstance(s, dict)]


def _step(job_name: str, name_part: str) -> dict:
    for step in _steps(job_name):
        if name_part in str(step.get("name", "")):
            return step
    raise AssertionError(f"step '{name_part}' não encontrado no job '{job_name}'")


def _step_index(job_name: str, name_part: str) -> int:
    for idx, step in enumerate(_steps(job_name)):
        if name_part in str(step.get("name", "")):
            return idx
    raise AssertionError(f"step '{name_part}' não encontrado no job '{job_name}'")


def _env(job_name: str, name_part: str) -> dict:
    env = _step(job_name, name_part).get("env") or {}
    assert isinstance(env, dict)
    return env


def _load_module(name: str, filename: str):
    path = SCRIPTS / "ci" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# ───────────────────────── 14 TESTES OBRIGATÓRIOS ─────────────────────────


def test_m01_merge_on_main_starts_delivery_without_manual_gate() -> None:
    """m01: merge na main dispara entrega autônoma, sem aprovação/dispatch."""
    triggers = _workflow()["on"]
    assert "main" in triggers["push"]["branches"]
    assert "workflow_dispatch" not in triggers
    for forbidden in (
        "MIGRATIONS_RELEASE_APPROVED",
        "MIGRATIONS_BACKUP_CONFIRMED",
        "required_reviewers",
        "inputs.confirm",
    ):
        assert forbidden not in WORKFLOW_TEXT, f"gate manual indevido: {forbidden}"
    production_if = str(_job("production").get("if", ""))
    assert "github.event_name == 'push'" in production_if
    assert "github.ref == 'refs/heads/main'" in production_if


def test_m02_pr_runs_validation_on_disposable_postgresql_17() -> None:
    """m02: PR roda lint/testes/migrations em PostgreSQL efêmero."""
    validate = _job("validate")
    assert "pull_request" in _workflow()["on"]
    assert "github.event_name == 'pull_request'" in str(validate.get("if"))
    assert validate["services"]["postgres"]["image"] == "postgres:17"
    assert "localhost:5432" in str(validate["env"]["DATABASE_URL"])
    runs = "\n".join(str(s.get("run", "")) for s in _steps("validate"))
    for required in ("pytest", "ci_dry_run_smoke.py", "ci_migration_suite.py"):
        assert required in runs


def test_m03_pr_never_touches_production_and_staging_is_internal_only() -> None:
    """m03: PR interna pode testar staging; produção permanece exclusiva da main."""
    stage = str(_job("stage-migrations").get("if", ""))
    assert "pull_request" in stage
    assert "github.event.pull_request.head.repo.full_name == github.repository" in stage
    assert "staging_candidate_guard.py" in str(_steps("stage-migrations"))
    for job_name in ("release-gate", "production"):
        assert "pull_request" not in str(_job(job_name).get("if", ""))
    validate_text = str(_job("validate"))
    for secret in (
        "secrets.SUPABASE_STAGING_ACCESS_TOKEN",
        "secrets.SUPABASE_ACCESS_TOKEN",
        "secrets.SUPABASE_STAGING_PROJECT_REF",
        "secrets.SUPABASE_PROJECT_REF",
    ):
        assert secret not in validate_text, f"credencial compartilhada no validate: {secret}"
    validate_runs = "\n".join(str(s.get("run", "")) for s in _steps("validate"))
    assert "--target staging" not in validate_runs
    assert "--target production" not in validate_runs


def test_m04_mandatory_delivery_order_is_explicit() -> None:
    """m04: ordem commit→efêmero→staging→gate→produção, com estágios internos."""
    assert _job("stage-migrations").get("needs") == "validate"
    assert set(_job("release-gate")["needs"]) == {"validate", "stage-migrations"}
    assert _job("production").get("needs") == "release-gate"

    stage_order = [
        "Confirm staging target",
        "Staging dry-run",
        "Verify staging baseline",
        "Apply pending migrations to Staging",
        "Staging integration tests",
        "Staging health checks",
        "Confirm all mandatory staging steps",
    ]
    indexes = [_step_index("stage-migrations", part) for part in stage_order]
    assert indexes == sorted(indexes)

    prod_order = [
        "Confirm production target",
        "Production dry-run",
        "Verify production baseline",
        "Re-verify run identity and main HEAD before apply",
        "Apply pending migrations (pending only)",
        "Final state validation",
        "Observability summary",
    ]
    prod_indexes = [_step_index("production", part) for part in prod_order]
    assert prod_indexes == sorted(prod_indexes)


def test_m05_any_mandatory_failure_blocks_production() -> None:
    """m05: etapa obrigatória que falha impede a promoção (fail-closed)."""
    text = RELEASE_GATE.read_text(encoding="utf-8")
    mandatory = {
        "target_confirmed",
        "staging_dry_run",
        "baseline_history_verified",
        "staging_apply",
        "staging_integration_tests",
        "staging_health_checks",
    }
    assert all(f'"{step}"' in text for step in mandatory)
    assert "continue-on-error" not in WORKFLOW_TEXT
    assert "|| true" not in WORKFLOW_TEXT
    for job_name, step_part in (
        ("stage-migrations", "Apply pending migrations to Staging"),
        ("production", "Re-verify run identity and main HEAD before apply"),
        ("production", "Apply pending migrations (pending only)"),
    ):
        assert "if" not in _step(job_name, step_part)
    attest = str(_step("stage-migrations", "Confirm all mandatory staging steps").get("run"))
    assert "--tests-passed" in attest and "--health-passed" in attest


def test_m06_staging_and_production_are_serialized() -> None:
    """m06: staging, gate e produção compartilham a mesma fila de entrega."""
    groups = []
    for job_name in ("stage-migrations", "release-gate", "production"):
        concurrency = _job(job_name)["concurrency"]
        groups.append(concurrency["group"])
        assert str(concurrency["cancel-in-progress"]).lower() == "false"
    assert groups == ["migrations-delivery"] * 3


def test_m07_allowlists_are_independent_and_mandatory() -> None:
    """m07: cada target tem allowlist própria; sem ela o runner aborta."""
    staging_env = _env("stage-migrations", "Staging dry-run")
    production_env = _env("production", "Production dry-run")
    assert staging_env["SUPABASE_STAGING_ALLOWED_PROJECT_REFS"] == (
        "${{ vars.SUPABASE_STAGING_ALLOWED_PROJECT_REFS }}"
    )
    assert production_env["SUPABASE_ALLOWED_PROJECT_REFS"] == (
        "${{ vars.SUPABASE_ALLOWED_PROJECT_REFS }}"
    )
    assert "SUPABASE_ALLOWED_PROJECT_REFS" not in staging_env
    assert "SUPABASE_STAGING_ALLOWED_REFS" not in production_env

    with pytest.raises(Exception):
        resolve_policy(target="staging", env={})
    policy = resolve_policy(target="production", env={"SUPABASE_ALLOWED_PROJECT_REFS": _OTHER_REF})
    assert policy.require_baseline is True


def test_m08_credentials_are_isolated_per_environment() -> None:
    """m08: staging nunca lê token/ref de produção e vice-versa."""
    for step in _steps("stage-migrations"):
        env = step.get("env") or {}
        assert "SUPABASE_ACCESS_TOKEN" not in env
        assert "SUPABASE_PROJECT_REF" not in env
        values = " ".join(str(v) for v in env.values())
        assert "secrets.SUPABASE_ACCESS_TOKEN" not in values
        assert "secrets.SUPABASE_PROJECT_REF" not in values

    for step in _steps("production"):
        env = step.get("env") or {}
        assert "SUPABASE_STAGING_ACCESS_TOKEN" not in env
        assert "SUPABASE_STAGING_PROJECT_REF" not in env
        values = " ".join(str(v) for v in env.values())
        assert "secrets.SUPABASE_STAGING_ACCESS_TOKEN" not in values
        assert "secrets.SUPABASE_STAGING_PROJECT_REF" not in values

    cli = (SCRIPTS / "migrate.py").read_text(encoding="utf-8")
    assert "policy.credential_vars()" in cli


def test_m09_cross_environment_credential_is_rejected(monkeypatch) -> None:
    """m09: presença de credencial cruzada aborta antes de qualquer request."""
    guard = _load_module("target_guard_under_test", "target_guard.py")
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", _STAGING_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "staging-token")
    monkeypatch.setenv("SUPABASE_STAGING_ALLOWED_PROJECT_REFS", _STAGING_REF)
    monkeypatch.setenv(ENV_STAGING_ALLOWED_REFS, _STAGING_REF)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "producao-token-vazada")
    monkeypatch.delenv("MIGRATE_TARGET", raising=False)
    assert guard.main(["--target", "staging"]) == 2


def test_shared_target_rejects_database_url_bypass(monkeypatch) -> None:
    """Um DSN em staging/produção pularia allowlist e token isolado: fail-closed."""
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", _STAGING_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "staging-token")
    monkeypatch.setenv("SUPABASE_STAGING_ALLOWED_PROJECT_REFS", _STAGING_REF)
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("MIGRATE_TARGET", raising=False)

    spec = importlib.util.spec_from_file_location(
        "migrate_cli_pipeline_under_test", SCRIPTS / "migrate.py"
    )
    assert spec is not None and spec.loader is not None
    cli = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = cli
    spec.loader.exec_module(cli)

    with pytest.raises(SystemExit) as exc:
        cli.main(["--target", "staging", "--database-url", "postgresql://user:pass@host/db"])
    assert exc.value.code == 2


def test_m10_real_project_identity_is_confirmed(monkeypatch) -> None:
    """m10: ref fora da allowlist aborta; confirmação vem antes do dry-run."""
    guard = _load_module("target_guard_identity_under_test", "target_guard.py")
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", _OTHER_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "staging-token")
    monkeypatch.setenv("SUPABASE_STAGING_ALLOWED_PROJECT_REFS", _STAGING_REF)
    monkeypatch.setenv(ENV_STAGING_ALLOWED_REFS, _STAGING_REF)
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("MIGRATE_TARGET", raising=False)
    assert guard.main(["--target", "staging"]) == 2

    policy = resolve_policy(
        target="staging", env={ENV_STAGING_ALLOWED_REFS: _STAGING_REF}
    )
    with pytest.raises(Exception):
        validate_project_ref(_OTHER_REF, policy)
    assert _step_index("stage-migrations", "Confirm staging target") < _step_index(
        "stage-migrations", "Staging dry-run"
    )


def test_m11_baseline_history_and_pending_are_verified() -> None:
    """m11: baseline e histórico são verificados antes de qualquer apply."""
    policy = resolve_policy(
        target="staging", env={ENV_STAGING_ALLOWED_REFS: _STAGING_REF}
    )
    assert policy.require_baseline is True
    with pytest.raises(BaselineConfigurationError):
        _validate_baseline(
            baseline="999",
            migrations=[SimpleNamespace(number=100)],
            applied_versions={"001"},
        )
    for job_name, verify_part, apply_part in (
        ("stage-migrations", "Verify staging baseline", "Apply pending migrations to Staging"),
        ("production", "Verify production baseline", "Apply pending migrations (pending only)"),
    ):
        assert _step_index(job_name, verify_part) < _step_index(job_name, apply_part)


def test_m12_apply_is_idempotent_and_pending_only() -> None:
    """m12: só pendentes são aplicados; nada é reaplicado ou recriado do zero."""
    migrations = [
        SimpleNamespace(version="001", number=1),
        SimpleNamespace(version="002", number=2),
    ]
    assert pending_migrations(migrations, {"001"}, "001") == [migrations[1]]
    assert pending_migrations(migrations, {"001", "002"}, "002") == []
    for job_name in ("stage-migrations", "production"):
        runs = "\n".join(str(s.get("run", "")) for s in _steps(job_name))
        assert "--from-scratch" not in runs
        assert "--target local" not in runs
    assert 'applied.get("pending") == applied.get("applied")' in RELEASE_GATE.read_text(
        encoding="utf-8"
    )


def test_m13_destructive_and_incompatible_changes_are_blocked(monkeypatch, tmp_path) -> None:
    """m13: DROP/DELETE/TRUNCATE/ALTER TYPE adicionados bloqueiam o pipeline."""
    analyzer = _load_module("analyze_migrations_under_test", "analyze_migrations.py")
    relative = "supabase/migrations/999_risco.sql"
    target = tmp_path / relative
    target.parent.mkdir(parents=True, exist_ok=True)

    target.write_text("ALTER TABLE public.foo DROP COLUMN bar;\n", encoding="utf-8")
    monkeypatch.setattr(analyzer, "changed_sql_files", lambda *a: [relative])
    monkeypatch.setattr(
        analyzer, "added_lines", lambda *a: ["ALTER TABLE public.foo DROP COLUMN bar;"]
    )
    _files, acknowledged, blocked = analyzer.analyze("base", "head", tmp_path)
    assert not acknowledged
    assert blocked and "drop-column" in blocked[0]

    # ci-destructive-ack é observabilidade, NÃO autorização: sem aprovação
    # humana no pipeline, a operação continua bloqueada.
    target.write_text(
        "-- ci-destructive-ack: limpeza revisitada em PR\n"
        "ALTER TABLE public.foo DROP COLUMN bar;\n",
        encoding="utf-8",
    )
    _files, acknowledged, blocked = analyzer.analyze("base", "head", tmp_path)
    assert acknowledged and blocked and "drop-column" in blocked[0]
    assert "não autoriza" in acknowledged[0]

    target.write_text("ALTER COLUMN preco TYPE numeric(10,2);\n", encoding="utf-8")
    monkeypatch.setattr(
        analyzer, "added_lines", lambda *a: ["ALTER COLUMN preco TYPE numeric(10,2);"]
    )
    _files, _ack, blocked = analyzer.analyze("base", "head", tmp_path)
    assert blocked and "alter-column-type" in blocked[0]


def test_unverifiable_sql_is_blocked(monkeypatch, tmp_path) -> None:
    """SQL dinâmico, UPDATE sem WHERE e DROP em comentário bloco não passam."""
    analyzer = _load_module("analyze_unverifiable_under_test", "analyze_migrations.py")
    relative = "supabase/migrations/998_risco.sql"
    target = tmp_path / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(analyzer, "changed_sql_files", lambda *a: [relative])

    cases = (
        (["EXECUTE format('DROP TABLE %s', v_name);"], "unverifiable-dynamic-sql"),
        (["UPDATE public.foo SET bar = 1;"], "unfiltered-update"),
        (["ALTER TABLE public.foo ALTER COLUMN preco SET DATA TYPE numeric(10,2);"], "alter-column-type"),
        (["DROP/* sep */TABLE public.foo;"], "drop-object"),
    )
    for lines, kind in cases:
        target.write_text("\n".join(lines) + "\n", encoding="utf-8")
        monkeypatch.setattr(analyzer, "added_lines", lambda *a, _l=lines: _l)
        _files, _ack, blocked = analyzer.analyze("base", "head", tmp_path)
        assert any(f"[{kind}]" in item for item in blocked), (kind, blocked)

    # CREATE TRIGGER ... EXECUTE PROCEDURE é estático: não pode ser confundido
    # com EXECUTE dinâmico.
    static = ["CREATE TRIGGER t AFTER INSERT ON public.foo EXECUTE PROCEDURE public.f();"]
    target.write_text("\n".join(static) + "\n", encoding="utf-8")
    monkeypatch.setattr(analyzer, "added_lines", lambda *a: static)
    _files, _ack, blocked = analyzer.analyze("base", "head", tmp_path)
    assert blocked == []


def test_destructive_ack_is_observability_only(monkeypatch, tmp_path, capsys) -> None:
    """Mesmo com ACK, o CLI retorna 1 e mantém o log do achado."""
    analyzer = _load_module("analyze_ack_cli_under_test", "analyze_migrations.py")
    monkeypatch.setattr(
        analyzer,
        "analyze",
        lambda *a: (["x"], ["linha ACK informativa"], ["x:1 [drop-column] DROP COLUMN"]),
    )
    code = analyzer.main([
        "--base-sha", "base", "--head-sha", "head", "--root", str(tmp_path)
    ])
    output = capsys.readouterr()
    assert code == 1
    assert "NOTE/ACK" in output.out and "BLOCK" in output.err


def test_m14_supabase_postgresql_17_compatibility_is_enforced() -> None:
    """m14: validação e health check usam PostgreSQL 17/Supabase (MAINTAIN)."""
    assert _job("validate")["services"]["postgres"]["image"] == "postgres:17"
    checks = CHECKS_SQL.read_text(encoding="utf-8")
    assert "MAINTAIN" in checks
    assert "server_version_num" in checks and "170000" in checks
    health = STAGING_HEALTH.read_text(encoding="utf-8")
    assert "170000" in health and "server_version_num" in health
    suite = (SCRIPTS / "ci" / "ci_migration_suite.py").read_text(encoding="utf-8")
    assert "supabase/migrations/tests" in suite


def test_test_119_uses_relative_time_anchor() -> None:
    """Regressão: fixtures da janela móvel não podem voltar a usar datas fixas."""
    path = ROOT / "supabase" / "migrations" / "tests" / (
        "119_chamados_workflow_outbox_reconcile_priority_checks.sql"
    )
    text = path.read_text(encoding="utf-8")
    assert "clock_timestamp()" in text and "v_anchor" in text
    assert "2026-11-21 " not in text
    for required in (
        "ARRAY[v_first, v_second]",
        "ARRAY[v_third, v_new]",
        "chamados_workflow_sha256_hex",
        "ROLLBACK;",
    ):
        assert required in text


def test_release_gate_rejects_stale_runs(tmp_path, monkeypatch) -> None:
    """Só runs de Migrations em commit posterior invalidam o artifact."""
    gate = _load_module("release_gate_stale_under_test", "release_gate.py")
    commit = "a" * 40
    payload = {
        "status": "passed",
        "target": "staging",
        "commit_sha": commit,
        "run_id": "123",
        "project_ref_fingerprint": gate._EXPECTED_STAGING_FINGERPRINT,
        "tests_passed": True,
        "health_checks_passed": True,
        "mandatory_steps": {step: True for step in gate._MANDATORY_STEPS},
        "migrations_applied": ["100"],
        "migrations_pending": ["100"],
    }
    attestation = tmp_path / "staging-release.json"
    attestation.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("GITHUB_TOKEN", "token-falso")
    args = gate.build_parser().parse_args([
        "verify",
        "--attestation", str(attestation),
        "--commit-sha", commit,
        "--run-id", "123",
        "--repo", "vihisantos/LabHub",
    ])
    monkeypatch.setattr(gate, "_migrations_workflow_id", lambda *a: 42)

    def api(runs):
        def fake_get_json(url, token, params=None):
            if "/git/ref/heads/" in url:
                return {"object": {"sha": commit}}
            return {"workflow_runs": runs}
        return fake_get_json

    monkeypatch.setattr(gate, "_get_json", api([
        {"id": 999, "head_sha": "b" * 40, "head_branch": "main"}
    ]))
    assert gate.verify(args) == 1

    monkeypatch.setattr(gate, "_get_json", api([]))
    assert gate.verify(args) == 0


# ─────────────────── TESTES ESTRUTURAIS DO YAML (jobs/deps) ────────────────


def test_yaml_job_dependency_graph_is_exact() -> None:
    jobs = _workflow()["jobs"]
    assert set(jobs) == {"scope", "validate", "stage-migrations", "premerge-gate", "release-gate", "production"}
    assert jobs["validate"]["needs"] == "scope"
    assert set(jobs["premerge-gate"]["needs"]) == {"scope", "validate", "stage-migrations"}
    assert jobs["stage-migrations"]["needs"] == "validate"
    assert set(jobs["release-gate"]["needs"]) == {"validate", "stage-migrations"}
    assert jobs["production"]["needs"] == "release-gate"


def test_yaml_step_environments_have_exact_secret_mapping() -> None:
    staging = _env("stage-migrations", "Staging dry-run")
    assert staging["SUPABASE_STAGING_PROJECT_REF"] == (
        "${{ secrets.SUPABASE_STAGING_PROJECT_REF }}"
    )
    assert staging["SUPABASE_STAGING_ACCESS_TOKEN"] == (
        "${{ secrets.SUPABASE_STAGING_ACCESS_TOKEN }}"
    )
    production = _env("production", "Apply pending migrations (pending only)")
    assert production["SUPABASE_PROJECT_REF"] == "${{ secrets.SUPABASE_PROJECT_REF }}"
    assert production["SUPABASE_ACCESS_TOKEN"] == "${{ secrets.SUPABASE_ACCESS_TOKEN }}"
    assert production["BASELINE_VERSION"] == "${{ secrets.BASELINE_VERSION }}"


def test_yaml_production_has_final_preapply_guard() -> None:
    """O último passo antes do apply relê o artifact e checa commit/run/HEAD."""
    steps = _steps("production")
    guard = _step("production", "Re-verify run identity and main HEAD before apply")
    apply_step = _step("production", "Apply pending migrations (pending only)")
    gi, ai = steps.index(guard), steps.index(apply_step)
    assert gi < ai
    # O único passo entre a barreira e o apply é o marcador de estágio.
    assert all(
        str(step.get("name", "")).startswith("Mark production apply")
        for step in steps[gi + 1:ai]
    )
    run = str(guard.get("run"))
    for required in (
        "release_gate.py preapply",
        "--attestation .artifacts/staging-release.json",
        '--commit-sha "$GITHUB_SHA"',
        '--run-id "$GITHUB_RUN_ID"',
        '--repo "$GITHUB_REPOSITORY"',
    ):
        assert required in run
    assert guard["env"]["GITHUB_TOKEN"] == "${{ secrets.GITHUB_TOKEN }}"

    download = _step("production", "Download staging attestation for final guard")
    assert download["with"]["name"] == "staging-release-${{ github.sha }}"
    assert steps.index(download) < steps.index(guard)


def test_yaml_has_no_manual_trigger_and_production_has_isolated_environment() -> None:
    data = _workflow()
    assert "workflow_dispatch" not in data["on"]
    for name, job in data["jobs"].items():
        if name == "production":
            assert job["environment"] == "production-migrations"
        else:
            assert "environment" not in job
    guard = _step("production", "Require configured production-only environment")
    assert guard["env"]["PRODUCTION_ENV_READY"] == "${{ secrets.SUPABASE_PRODUCTION_ENV_READY }}"
    assert _step_index("production", "Require configured production-only environment") < _step_index("production", "Confirm production target")
    assert "outputs" not in data["jobs"].get("release-gate", {})


# ───────── 2) PUSH POSTERIOR NÃO DEIXA MIGRATIONS PENDENTES ────────────────


def test_yaml_push_to_main_has_no_paths_filter() -> None:
    """Todo push na main dispara a entrega, inclusive fora de migrations."""
    triggers = _workflow()["on"]
    push = triggers["push"]
    assert "main" in push["branches"]
    assert "paths" not in push, "filtro paths deixaria o HEAD da main sem execução"
    # O check requerido sempre aparece; scope evita banco em PR sem SQL/runner.
    assert "paths" not in triggers["pull_request"]
    assert "git diff" in str(_steps("scope"))
    assert "needs.scope.outputs.required" in str(_job("validate")["if"])


def test_consecutive_pushes_resume_delivery_without_reapply() -> None:
    """Pushes consecutivos: nova execução retoma pendências, sem reaplicar."""
    assert "paths" not in _workflow()["on"]["push"]
    for job_name in ("stage-migrations", "release-gate", "production"):
        concurrency = _job(job_name)["concurrency"]
        assert concurrency["group"] == "migrations-delivery"
        assert str(concurrency["cancel-in-progress"]).lower() == "false"
    # O run anterior é barrado no preapply quando o HEAD muda; o push seguinte
    # dispara um novo run que aplica apenas o que falta.
    assert "preapply" in str(_step("production", "Re-verify run identity").get("run"))
    for job_name in ("stage-migrations", "production"):
        runs = "\n".join(str(step.get("run", "")) for step in _steps(job_name))
        assert "--from-scratch" not in runs
        assert "pending" in runs or "migrate.py" in runs


# ─── 3) VERIFICAÇÃO INDEPENDENTE DAS IDENTIDADES DE STAGING/PRODUÇÃO ───────


def test_expected_project_refs_are_distinct_and_pinned() -> None:
    assert EXPECTED_STAGING_PROJECT_REF == "pgmetdqsdjotdcifjivu"
    assert EXPECTED_PRODUCTION_PROJECT_REF == "hvqxantwqwarqhymnyqb"
    assert EXPECTED_STAGING_PROJECT_REF != EXPECTED_PRODUCTION_PROJECT_REF
    # O runner aplica a mesma barreira, mesmo sem passar pelo target_guard.
    assert "validate_expected_destination(project_ref, policy)" in (
        SCRIPTS / "migrate.py"
    ).read_text(encoding="utf-8")


def test_wrong_allowlist_cannot_authorize_wrong_project(monkeypatch) -> None:
    """Secret e allowlist trocados juntos ainda bloqueiam (fail-closed)."""
    guard = _load_module("target_guard_wrong_project_under_test", "target_guard.py")
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("MIGRATE_TARGET", raising=False)

    # Cenário 1: secret aponta para produção, allowlist foi trocada junto.
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", EXPECTED_PRODUCTION_PROJECT_REF)
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "staging-token")
    monkeypatch.setenv(
        "SUPABASE_STAGING_ALLOWED_PROJECT_REFS", EXPECTED_PRODUCTION_PROJECT_REF
    )
    assert guard.main(["--target", "staging"]) == 2

    # Cenário 2: allowlist contém os dois projetos.
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", EXPECTED_STAGING_PROJECT_REF)
    monkeypatch.setenv(
        "SUPABASE_STAGING_ALLOWED_PROJECT_REFS",
        f"{EXPECTED_STAGING_PROJECT_REF},{EXPECTED_PRODUCTION_PROJECT_REF}",
    )
    assert guard.main(["--target", "staging"]) == 2


def test_production_guard_requires_baseline_and_pinned_ref(monkeypatch) -> None:
    guard = _load_module("target_guard_prod_under_test", "target_guard.py")
    monkeypatch.delenv("MIGRATE_TARGET", raising=False)
    monkeypatch.delenv("SUPABASE_STAGING_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("SUPABASE_PROJECT_REF", EXPECTED_PRODUCTION_PROJECT_REF)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "producao-token")
    monkeypatch.setenv("SUPABASE_ALLOWED_PROJECT_REFS", EXPECTED_PRODUCTION_PROJECT_REF)
    monkeypatch.delenv("BASELINE_VERSION", raising=False)
    assert guard.main(["--target", "production"]) == 2

    monkeypatch.setenv("BASELINE_VERSION", "035")
    assert guard.main(["--target", "production"]) == 0

    # Allowlist de produção apontando para staging: bloqueia mesmo com token válido.
    monkeypatch.setenv("SUPABASE_ALLOWED_PROJECT_REFS", EXPECTED_STAGING_PROJECT_REF)
    assert guard.main(["--target", "production"]) == 2

    policy = resolve_policy(
        target="staging", env={"SUPABASE_STAGING_ALLOWED_PROJECT_REFS": _STAGING_REF}
    )
    validate_expected_destination(_STAGING_REF, policy)


# ─── 4) LACUNAS HISTÓRICAS SÃO EXPOSTAS AOS GATES DO CI ────────────────────


def test_cli_publishes_history_gaps_and_reconciliation_in_json() -> None:
    """O artifact do dry-run precisa revelar lacunas, nunca sucesso enganoso."""
    migrate_source = (SCRIPTS / "migrate.py").read_text(encoding="utf-8")
    for field in (
        '"history_gaps"',
        '"reconciliation_plan"',
        '"reconciliation_contracts"',
        '"reconciled"',
    ):
        assert field in migrate_source


def test_staging_gate_rejects_unreconciled_gaps() -> None:
    gate = "\n".join(
        line for line in WORKFLOW_TEXT.splitlines()
        if any(marker in line for marker in (
            "staging-gate", "unreconciled", "history_gaps", "reconciliation_plan"
        ))
    )
    assert "history_gaps" in gate
    assert "reconciliation_plan" in gate
    assert "not unreconciled" in gate
    assert "BLOCK" in gate


def test_production_gate_rejects_any_history_gap() -> None:
    gate = "\n".join(
        line for line in WORKFLOW_TEXT.splitlines()
        if any(marker in line for marker in (
            "production-gate", "lacunas não autorizadas", "history_gaps", "not gaps"
        ))
    )
    assert "history_gaps" in gate
    assert "not gaps" in gate
    assert "BLOCK" in gate


def test_reconciliation_is_staging_only_and_contract_backed() -> None:
    source = (SCRIPTS / "migrate" / "reconciliation.py").read_text(encoding="utf-8")
    assert 'version="113"' in source
    assert 'version="114"' in source
    assert "114_notification_outbox_contract.sql" in source
    # A garantia é do PostgreSQL, não de inspeção de texto do SQL.
    assert "is_read_only_contract" not in source
    # Nenhuma regra genérica por prefixo: lacuna desconhecida bloqueia.
    assert "RECONCILIATION_RULES.get(gap.version)" in source
    runner_source = (SCRIPTS / "migrate" / "runner.py").read_text(encoding="utf-8")
    assert "BEGIN READ ONLY;" in runner_source
    assert "ROLLBACK;" in runner_source
    assert runner_source.count("policy.is_staging") >= 1


def test_premerge_gate_cannot_pass_when_required_staging_is_skipped_or_failed():
    gate = _job("premerge-gate")
    assert "always()" in gate["if"]
    script = _step("premerge-gate", "Require real staging success")["run"]
    import os
    import subprocess
    for required, validation, staging, internal, scope, expected in (
        ("true", "success", "success", "true", "success", 0),
        ("true", "success", "skipped", "true", "success", 1),
        ("true", "failure", "skipped", "true", "success", 1),
        ("true", "success", "success", "false", "success", 1),
        ("false", "skipped", "skipped", "true", "success", 0),
        ("false", "skipped", "skipped", "true", "failure", 1),
        ("", "skipped", "skipped", "true", "success", 1),
    ):
        env = dict(os.environ, REQUIRED=required, VALIDATE_RESULT=validation,
                   STAGING_RESULT=staging, INTERNAL_PR=internal, SCOPE_RESULT=scope)
        assert subprocess.run(["bash", "-c", script], env=env, capture_output=True).returncode == expected
