#!/usr/bin/env python3
"""Gate automático de promoção Staging -> Produção (sem aprovação manual).

``attest``
    Consolida o resultado das etapas obrigatórias de staging num artifact JSON.
``verify``
    Confere que o artifact pertence ao MESMO commit e ao MESMO run que está
    promovendo, que todas as etapas obrigatórias passaram e que não existe run
    mais novo na branch. Um run antigo não pode promover produção.

Nenhum token é impresso. O token do GitHub é usado apenas no header da chamada
de leitura à API e nunca entra no artifact.
"""
from __future__ import annotations

import argparse
import json
import os
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


def _newer_runs(api_url: str, repo: str, token: str, branch: str, run_id: int) -> list[dict]:
    url = f"{api_url}/repos/{repo}/actions/runs"
    response = requests.get(
        url,
        params={"branch": branch, "event": "push", "per_page": 100},
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=30,
    )
    if response.status_code >= 300:
        # Não imprimimos corpo: pode conter detalhes do token/request.
        raise RuntimeError(f"GitHub Actions API retornou HTTP {response.status_code}")
    payload = response.json()
    runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise RuntimeError("resposta inesperada da GitHub Actions API")
    return [
        run for run in runs
        if isinstance(run, dict)
        and isinstance(run.get("id"), int)
        and run["id"] > run_id
    ]


def verify(args: argparse.Namespace) -> int:
    try:
        attestation = _read_json(args.attestation)
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

        token = os.environ.get(args.token_env, "")
        _require(bool(token), f"{args.token_env} ausente")
        newer = _newer_runs(args.api_url, args.repo, token, args.branch, args.run_id)
        _require(not newer, f"existem {len(newer)} run(s) mais novo(s) na branch; run atual está obsoleto")
    except (OSError, ValueError, RuntimeError, requests.RequestException) as exc:
        print(f"[release-gate] BLOCK: {exc}", file=sys.stderr)
        return 1

    print(
        "[release-gate] PASS promoção autorizada: "
        f"commit={args.commit_sha} run={args.run_id} target=production"
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

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
