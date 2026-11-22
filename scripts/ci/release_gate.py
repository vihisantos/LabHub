#!/usr/bin/env python3
"""Gate automático de promoção Staging -> Produção (sem aprovação manual).

``attest``
    Consolida o resultado das etapas obrigatórias de staging num artifact JSON.
``verify``
    Confere que o artifact pertence ao MESMO commit e ao MESMO run que está
    promovendo, que todas as etapas obrigatórias passaram e que não existe run
    mais novo na branch. Um run antigo não pode promover produção.

``preapply``
    Última barreira, executada IMEDIATAMENTE antes da aplicação em produção:
    repete a checagem de run/commit e confirma na API do GitHub que o HEAD da
    main ainda é o commit atestado. Qualquer erro de API, run mais novo ou
    divergência de commit bloqueia a aplicação (fail-closed).

Nenhum token é impresso. O token do GitHub é usado apenas no header da chamada
de leitura à API e nunca entra no artifact.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

_MANDATORY_STEPS = (
    "target_confirmed",
    "staging_dry_run",
    "baseline_history_verified",
    "staging_apply",
    "staging_integration_tests",
    "staging_health_checks",
)


def _read_json(path: str) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON esperado como objeto: {path}")
    return payload


def _write_json(path: str, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def attest(args: argparse.Namespace) -> int:
    dry = _read_json(args.dry_run_json)
    applied = _read_json(args.apply_json)

    _require(dry.get("status") == "success", "dry-run de staging não terminou com sucesso")
    _require(applied.get("status") == "success", "aplicação em staging não terminou com sucesso")
    _require(dry.get("target") == "staging", "dry-run não aponta para staging")
    _require(applied.get("target") == "staging", "aplicação não aponta para staging")
    _require(bool(applied.get("dry_run")) is False, "JSON de aplicação marcado como dry-run")
    _require(bool(applied.get("from_scratch")) is False, "--from-scratch é proibido em staging")
    _require(
        applied.get("pending") == applied.get("applied"),
        "migrations pendentes != migrations aplicadas",
    )

    mandatory = {
        "target_confirmed": True,
        "staging_dry_run": True,
        "baseline_history_verified": bool(
            dry.get("schema_migrations_exists")
            or dry.get("baseline_source") in ("database", "applied_migrations", "env")
        ),
        "staging_apply": True,
        "staging_integration_tests": args.tests_passed,
        "staging_health_checks": args.health_passed,
    }
    _require(all(mandatory.values()), f"etapas obrigatórias incompletas: {mandatory}")

    payload = {
        "status": "passed" if all(mandatory.values()) else "failed",
        "target": "staging",
        "commit_sha": args.commit_sha,
        "run_id": str(args.run_id),
        "workflow": args.workflow,
        "project_ref_fingerprint": args.project_ref_fingerprint,
        "duration_seconds": args.duration_seconds,
        "baseline": applied.get("baseline"),
        "baseline_source": applied.get("baseline_source"),
        "db_baseline": applied.get("db_baseline"),
        "env_baseline": applied.get("env_baseline"),
        "schema_migrations_exists": applied.get("schema_migrations_exists"),
        "migrations_pending": applied.get("pending", []),
        "migrations_applied": applied.get("applied", []),
        "tests_passed": args.tests_passed,
        "health_checks_passed": args.health_passed,
        "mandatory_steps": mandatory,
        "created_at": int(time.time()),
    }
    _write_json(args.output, payload)
    print(
        "[release-gate] PASS estagiado: "
        f"commit={payload['commit_sha']} run={payload['run_id']} "
        f"project_fingerprint={payload['project_ref_fingerprint']} "
        f"aplicadas={len(payload['migrations_applied'])}"
    )
    return 0


def _get_json(url: str, token: str, params: dict[str, Any] | None = None) -> Any:
    """GET autenticado na API do GitHub; erro vira exceção (fail-closed)."""
    response = requests.get(
        url,
        params=params,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=30,
    )
    if response.status_code >= 300:
        # Não imprimimos corpo nem headers: podem conter detalhes do token.
        raise RuntimeError(f"GitHub API retornou HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError("resposta inválida da API do GitHub") from exc


def _newer_runs(api_url: str, repo: str, token: str, branch: str, run_id: int) -> list[dict]:
    payload = _get_json(
        f"{api_url}/repos/{repo}/actions/runs",
        token,
        {"branch": branch, "event": "push", "per_page": 100},
    )
    runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise RuntimeError("resposta inesperada da GitHub Actions API")
    return [
        run for run in runs
        if isinstance(run, dict)
        and isinstance(run.get("id"), int)
        and run["id"] > run_id
    ]


def _main_head_sha(api_url: str, repo: str, token: str, branch: str) -> str:
    """Lê o SHA atual da branch na API; NUNCA confia em valor do próprio job."""
    payload = _get_json(f"{api_url}/repos/{repo}/git/ref/heads/{branch}", token)
    ref = payload.get("object") if isinstance(payload, dict) else None
    sha = ref.get("sha") if isinstance(ref, dict) else None
    _require(
        isinstance(sha, str) and re.fullmatch(r"[0-9a-fA-F]{40}", sha) is not None,
        "ref da branch principal ausente/inválido na API do GitHub",
    )
    return str(sha)


def _validate_attestation(attestation: dict[str, Any], args: argparse.Namespace) -> None:
    """Valida identidade e etapas do artifact, sem chamadas de rede."""
    _require(
        isinstance(args.commit_sha, str)
        and bool(args.commit_sha.strip())
        and not any(char.isspace() for char in args.commit_sha),
        "commit_sha do job inválido",
    )
    _require(isinstance(args.run_id, int) and args.run_id > 0, "run_id do job inválido")
    _require(attestation.get("status") == "passed", "status do artifact não é passed")
    _require(attestation.get("target") == "staging", "artifact não é de staging")
    _require(bool(attestation.get("project_ref_fingerprint")), "fingerprint do projeto ausente")
    _require(attestation.get("commit_sha") == args.commit_sha, "commit do artifact diverge")
    _require(str(attestation.get("run_id")) == str(args.run_id), "run_id do artifact diverge")
    _require(attestation.get("tests_passed") is True, "testes de staging não passaram")
    _require(
        attestation.get("health_checks_passed") is True,
        "health checks de staging não passaram",
    )
    mandatory = attestation.get("mandatory_steps")
    _require(isinstance(mandatory, dict), "mandatory_steps ausente no artifact")
    for step in _MANDATORY_STEPS:
        _require(mandatory.get(step) is True, f"etapa obrigatória não passou: {step}")

    migrated = attestation.get("migrations_applied")
    pending = attestation.get("migrations_pending")
    _require(isinstance(migrated, list) and isinstance(pending, list), "listas de migrations ausentes")
    _require(migrated == pending, "nem toda migration pendente foi aplicada em staging")


def _api_context(args: argparse.Namespace) -> str:
    token = os.environ.get(args.token_env, "")
    _require(bool(token), f"{args.token_env} ausente")
    newer = _newer_runs(args.api_url, args.repo, token, args.branch, args.run_id)
    _require(
        not newer,
        f"existem {len(newer)} run(s) mais novo(s) na branch; run atual está obsoleto",
    )
    return token


def verify(args: argparse.Namespace) -> int:
    try:
        attestation = _read_json(args.attestation)
        _validate_attestation(attestation, args)
        _api_context(args)
    except (OSError, ValueError, RuntimeError, requests.RequestException) as exc:
        print(f"[release-gate] BLOCK: {exc}", file=sys.stderr)
        return 1

    print(
        "[release-gate] PASS promoção autorizada: "
        f"commit={args.commit_sha} run={args.run_id} target=production"
    )
    return 0


def preapply(args: argparse.Namespace) -> int:
    """Barreira final, executada logo antes do apply em produção."""
    try:
        attestation = _read_json(args.attestation)
        _validate_attestation(attestation, args)
        token = _api_context(args)
        head = _main_head_sha(args.api_url, args.repo, token, args.branch)
        _require(
            head.lower() == args.commit_sha.lower(),
            f"HEAD da main divergiu do commit atestado (head={head}, artifact={args.commit_sha})",
        )
    except (OSError, ValueError, RuntimeError, requests.RequestException) as exc:
        print(f"[release-gate] BLOCK pré-apply: {exc}", file=sys.stderr)
        return 1

    print(
        "[release-gate] PASS pré-apply: "
        f"commit={args.commit_sha} run={args.run_id} branch_head={head}"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    a = sub.add_parser("attest", help="consolida o resultado de staging")
    a.add_argument("--output", required=True)
    a.add_argument("--dry-run-json", required=True)
    a.add_argument("--apply-json", required=True)
    a.add_argument("--commit-sha", required=True)
    a.add_argument("--run-id", required=True, type=int)
    a.add_argument("--workflow", required=True)
    a.add_argument("--project-ref-fingerprint", required=True)
    a.add_argument("--duration-seconds", required=True, type=float)
    a.add_argument("--tests-passed", required=True, type=lambda v: v.lower() == "true")
    a.add_argument("--health-passed", required=True, type=lambda v: v.lower() == "true")
    a.set_defaults(func=attest)

    v = sub.add_parser("verify", help="valida o artifact e a frescor do run")
    v.add_argument("--attestation", required=True)
    v.add_argument("--commit-sha", required=True)
    v.add_argument("--run-id", required=True, type=int)
    v.add_argument("--repo", required=True)
    v.add_argument("--branch", default="main")
    v.add_argument("--api-url", default="https://api.github.com")
    v.add_argument("--token-env", default="GITHUB_TOKEN")
    v.set_defaults(func=verify)

    p = sub.add_parser("preapply", help="barreira final antes do apply em produção")
    p.add_argument("--attestation", required=True)
    p.add_argument("--commit-sha", required=True)
    p.add_argument("--run-id", required=True, type=int)
    p.add_argument("--repo", required=True)
    p.add_argument("--branch", default="main")
    p.add_argument("--api-url", default="https://api.github.com")
    p.add_argument("--token-env", default="GITHUB_TOKEN")
    p.set_defaults(func=preapply)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
