#!/usr/bin/env python3
"""Confirma a identidade do destino ANTES de qualquer requisição (fail-closed).

Uso no CI:
    python scripts/ci/target_guard.py --target staging

Valida, sem abrir conexão e sem imprimir valores:
  - allowlist específica do target presente e não vazia;
  - project ref com formato canônico e presente na allowlist;
  - identidade INDEPENDENTE: ref e allowlist batem com o destino esperado no
    código (pgmetdqsdjotdcifjivu para staging, hvqxantwqwarqhymnyqb para
    produção), mesmo que secret e allowlist tenham sido alterados juntos;
  - token específico do target presente (nunca lido/impresso);
  - ausência de credencial cruzada (staging não usa token de produção e vice-versa);
  - BASELINE_VERSION presente em produção (fail-fast antes do runner).

Qualquer divergência aborta com código 2 antes do dry-run e, portanto, antes
de qualquer escrita.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from migrate.environment import (  # noqa: E402
    ENV_ACCESS_TOKEN,
    ENV_BASELINE,
    ENV_STAGING_ACCESS_TOKEN,
    STAGING,
    TargetEnvironmentError,
    resolve_policy,
    validate_expected_destination,
    validate_project_ref,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, choices=["local", STAGING, "production"])
    args = parser.parse_args(argv)

    try:
        policy = resolve_policy(target=args.target)
    except TargetEnvironmentError as exc:
        print(f"[target-guard] ERRO: {exc}", file=sys.stderr)
        return 2

    if policy.is_shared:
        ref_var, token_var = policy.credential_vars()
        project_ref = os.environ.get(ref_var, "")
        try:
            validate_project_ref(project_ref, policy)
            # Barreira independente da allowlist: um secret trocado junto com a
            # allowlist não pode redirecionar o apply para outro projeto.
            validate_expected_destination(project_ref, policy)
        except TargetEnvironmentError as exc:
            print(f"[target-guard] ERRO: {exc}", file=sys.stderr)
            return 2
        if policy.is_production and not os.environ.get(ENV_BASELINE, "").strip():
            print(f"[target-guard] ERRO: {ENV_BASELINE} ausente", file=sys.stderr)
            return 2
        if not os.environ.get(token_var, "").strip():
            print(f"[target-guard] ERRO: {token_var} ausente", file=sys.stderr)
            return 2

        other_token_var = (
            ENV_ACCESS_TOKEN if policy.is_staging else ENV_STAGING_ACCESS_TOKEN
        )
        if os.environ.get(other_token_var, "").strip():
            print(
                f"[target-guard] ERRO: credencial cruzada detectada: {other_token_var} "
                f"não pode estar presente ao executar --target {policy.target}",
                file=sys.stderr,
            )
            return 2

    print(
        f"[target-guard] PASS target={policy.target} "
        f"allowlist_entries={len(policy.allowed_project_refs)} "
        f"expected_destination_verified={policy.is_shared} "
        f"project_ref_present={bool(os.environ.get(policy.project_ref_env_var, ''))} "
        f"token_present={bool(os.environ.get(policy.access_token_env_var, ''))}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
