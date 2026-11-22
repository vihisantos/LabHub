#!/usr/bin/env python3
"""Entrypoint do migration runner.

Exemplo (produção, após configurar os segredos no GitHub / .env):

    python scripts/migrate.py --migrations-dir supabase/migrations

Aplica migrations pendentes (versões > baseline) via Supabase Management API.
Idempotente: migrations já registradas em ``schema_migrations`` são ignoradas.

NOVO: para o PostgreSQL EFÊMERO do CI, passe ``--database-url`` (ou
``DATABASE_URL``) e o runner usa ``PostgresExecutor`` (psycopg) no lugar da
Management API. ``--dry-run`` é agora REALMENTE read-only: apenas descobre,
consulta (SELECT) e calcula baseline/pendentes — sem CREATE TABLE, sem INSERT
de baseline e sem aplicar migration alguma. ``--from-scratch`` aplica TODAS
as migrations (000 em diante) num banco NOVO/efêmero, em vez do baseline
implícito "maior versão" (pensado para produção legada).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from dotenv import dotenv_values, load_dotenv
except Exception:  # pragma: no cover - dotenv é opcional
    load_dotenv = None
    dotenv_values = None

from migrate import MigrationError
from migrate.api import ApiError, ManagementAPI
from migrate.environment import (
    ENV_ACCESS_TOKEN,
    ENV_STAGING_ACCESS_TOKEN,
    ENV_STAGING_ALLOWED_REFS,
    ENV_STAGING_PROJECT_REF,
    LOCAL,
    PRODUCTION,
    STAGING,
    TargetEnvironmentError,
    TargetPolicy,
    resolve_policy,
    validate_expected_destination,
    validate_project_ref,
    warn_unenforced_allowlist,
)
from migrate.runner import run

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


_TARGET_ONLY_VARS = frozenset(
    {
        "SUPABASE_PROJECT_REF",
        ENV_ACCESS_TOKEN,
        "SUPABASE_ALLOWED_PROJECT_REFS",
        ENV_STAGING_PROJECT_REF,
        ENV_STAGING_ACCESS_TOKEN,
        ENV_STAGING_ALLOWED_REFS,
        "BASELINE_VERSION",
    }
)


def _load_env(target: str | None = None) -> None:
    """Carrega .env/.env.local sem deixar um ambiente herdar a identidade do outro.

    Arquivos de desenvolvimento (``.env``/``.env.local``) podem fornecer apenas
    variáveis que NÃO identificam um alvo compartilhado. Refs, allowlists e
    baseline só vêm de ``.env.<target>`` ou do ambiente do processo (GitHub
    Secrets/Variables, export explícito). Assim, ``--target staging`` não herda
    a identidade de produção, e ``--target production`` não herda a de staging.
    """
    if load_dotenv is None or dotenv_values is None:
        return
    effective = (target or os.environ.get("MIGRATE_TARGET", "") or LOCAL).strip().lower()
    shared = effective in (STAGING, PRODUCTION)
    target_file = f".env.{effective}" if shared else None
    names = (target_file, ".env", ".env.local") if shared else (".env", ".env.local")
    for name in names:
        path = PROJECT_ROOT / name
        if not path.is_file():
            continue
        if not shared or name == target_file:
            load_dotenv(path, override=False)
            continue
        for key, value in dotenv_values(path).items():
            if key in _TARGET_ONLY_VARS or key in os.environ or value is None:
                continue
            os.environ[key] = value


def policy_target(args: argparse.Namespace) -> str:
    """Target efetivo (CLI > MIGRATE_TARGET > local), sem validação."""
    return (args.target or os.environ.get("MIGRATE_TARGET", "") or LOCAL).strip().lower()


def _write_json_output(path: str | None, payload: dict) -> None:
    """Escreve observabilidade estruturada SEM credenciais.

    O arquivo é consumido pelo release-gate do CI. Contém apenas identificadores
    de execução, baseline e versões de migrations — nunca token, DSN ou segredos.
    """
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _build_executor(args: argparse.Namespace, policy: TargetPolicy):
    """Engenaria de execução: Management API (padrão) ou Postgres efêmero.

    O DSN tem precedência sobre a Management API porque o CI de migrations usa
    um PostgreSQL descartável e nunca deve exigir token de produção. A política de
    ambiente (#285) só é aplicada no caminho da Management API.
    """
    dsn = args.database_url or os.environ.get("DATABASE_URL", "").strip()
    if (dsn or args.database_url is not None) and policy.is_shared:
        # Um DSN em staging/produção bypassaria allowlist, token isolado e
        # confirmação de identidade do projeto. Fail-closed.
        print(
            f"[migrate] ERRO: --database-url/DATABASE_URL é proibido com "
            f"--target {policy.target}; use a credencial isolada da Management API.",
            file=sys.stderr,
        )
        sys.exit(2)
    if dsn or args.database_url is not None:
        from migrate.pg import PostgresExecutor, SqlExecutionError

        try:
            return PostgresExecutor(dsn=dsn or None)
        except SqlExecutionError as exc:
            print(f"[migrate] ERRO: {exc}", file=sys.stderr)
            sys.exit(2)

    # Management API: valida o DESTINO antes de existir qualquer cliente HTTP.
    # Uma configuração errada (secret trocado, .env apontando para outro
    # projeto) aborta aqui, sem uma única requisição ao Supabase.
    # As variáveis de ref e token são escolhidas pela política do target:
    # staging nunca lê SUPABASE_ACCESS_TOKEN e produção nunca lê
    # SUPABASE_STAGING_ACCESS_TOKEN.
    project_ref_env_var, access_token_env_var = policy.credential_vars()
    project_ref = os.environ.get(project_ref_env_var, "")
    access_token = os.environ.get(access_token_env_var, "")
    try:
        validate_project_ref(project_ref, policy)
        # Defesa em profundidade: o target_guard do CI faz o mesmo, mas uma
        # execução direta do runner também não pode mirar outro projeto só
        # porque secret e allowlist foram alterados juntos.
        validate_expected_destination(project_ref, policy)
    except TargetEnvironmentError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        sys.exit(2)

    warning = warn_unenforced_allowlist(policy)
    if warning:
        print(f"[migrate] AVISO: {warning}", file=sys.stderr)

    api = ManagementAPI(
        access_token=access_token,
        project_ref=project_ref,
        access_token_env_var=access_token_env_var,
        project_ref_env_var=project_ref_env_var,
    )
    # Valida configuração antes de qualquer chamada (falha cedo e clara).
    try:
        _ = api._headers()
    except ApiError:
        print(
            f"[migrate] Configure {access_token_env_var} e {project_ref_env_var} "
            "(GitHub Secrets ou .env.<target>), ou passe --database-url para "
            "executar num PostgreSQL efêmero.",
            file=sys.stderr,
        )
        sys.exit(2)
    return api


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="migrate.py",
        description=(
            "Aplica migrations SQL do LabHub via Supabase Management API "
            "ou PostgreSQL efêmero (CI)."
        ),
    )
    parser.add_argument(
        "--migrations-dir",
        default=str(DEFAULT_MIGRATIONS_DIR),
        help="Diretório com as migrations (default: supabase/migrations do repo).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Apenas valida/descobre/consulta e lista pendentes — NÃO escreve "
            "nada no banco (sem CREATE TABLE, INSERT de baseline ou migrations)."
        ),
    )
    parser.add_argument(
        "--from-scratch",
        action="store_true",
        help=(
            "Banco novo/efêmero: tabela vazia aplica TODAS as migrations "
            "(000 em diante) em vez do baseline implícito de produção."
        ),
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="DSN do PostgreSQL efêmero (CI). Alternativa à Management API.",
    )
    parser.add_argument(
        "--target",
        choices=[LOCAL, STAGING, PRODUCTION],
        default=None,
        help=(
            "Ambiente de destino. 'staging' exige allowlist e credenciais "
            "proprias; 'production' exige allowlist, credenciais proprias e "
            "BASELINE_VERSION. Default: MIGRATE_TARGET, ou 'local'."
        ),
    )
    parser.add_argument(
        "--allowed-project-refs",
        default=None,
        help=(
            "Allowlist de SUPABASE_PROJECT_REF separada por virgula. Default: "
            "variavel SUPABASE_ALLOWED_PROJECT_REFS."
        ),
    )
    parser.add_argument(
        "--allowed-project-refs-staging",
        default=None,
        help=(
            f"Allowlist de {ENV_STAGING_PROJECT_REF} separada por virgula. "
            f"Default: variavel {ENV_STAGING_ALLOWED_REFS}."
        ),
    )
    parser.add_argument(
        "--require-baseline",
        dest="require_baseline",
        action="store_true",
        default=None,
        help=(
            "Falha se BASELINE_VERSION nao resolver, em vez de cair no baseline "
            "implicito (que seria um no-op reportando sucesso). Implicito em "
            "staging e production."
        ),
    )
    parser.add_argument(
        "--json-output",
        default=None,
        help=(
            "Arquivo JSON de observabilidade (sem segredos) com baseline, "
            "pendentes e aplicadas; usado pelo release-gate do CI."
        ),
    )
    args = parser.parse_args(argv)

    _load_env(args.target)

    try:
        policy = resolve_policy(
            target=args.target,
            allowed_refs=(
                args.allowed_project_refs_staging
                if policy_target(args) == STAGING
                else args.allowed_project_refs
            ),
            require_baseline=args.require_baseline,
        )
    except TargetEnvironmentError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        return 2

    from_scratch = args.from_scratch or os.environ.get("MIGRATE_FROM_SCRATCH", "") == "1"
    if from_scratch and policy.is_shared:
        print(
            "[migrate] ERRO: --from-scratch e proibido em staging/producao "
            "(banco persistente). Use apenas em PostgreSQL efemero/local.",
            file=sys.stderr,
        )
        return 2

    migrations_dir = Path(args.migrations_dir)
    api = _build_executor(args, policy)
    try:
        result = run(
            migrations_dir,
            api,
            dry_run=args.dry_run,
            from_scratch=from_scratch,
            require_baseline=policy.require_baseline,
            policy=policy,
        )
    except ApiError as exc:
        print(f"[migrate] ERRO na Management API: {exc}", file=sys.stderr)
        return 1
    except MigrationError as exc:
        print(f"[migrate] ERRO de migration: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - fronteira do CLI
        message = str(exc)
        if hasattr(exc, "__module__") and str(exc.__module__).endswith(
            ("migrate.pg", "migrate.api")
        ):
            message = str(exc)
        print(
            f"[migrate] ERRO inesperado: {type(exc).__name__}: {message}",
            file=sys.stderr,
        )
        return 1

    payload = {
        "status": "success",
        "target": policy.target,
        "dry_run": bool(args.dry_run),
        "from_scratch": bool(from_scratch),
        "baseline": result.baseline,
        "baseline_source": result.baseline_source,
        "db_baseline": result.db_baseline,
        "env_baseline": result.env_baseline,
        "schema_migrations_exists": result.schema_migrations_exists,
        "pending": result.pending,
        "applied": result.applied,
        "already_applied_count": len(result.already_applied),
        "api_call_count": result.api_call_count,
    }
    _write_json_output(args.json_output, payload)

    # Observabilidade textual (#476): origem do baseline e histórico ficam
    # explícitos no log. Nenhum token/DSN/ref de credencial é impresso.
    print(f"[migrate] alvo: {policy.describe()}")
    print(f"[migrate] baseline configurada (secret): {result.env_baseline or '(nenhuma)'}")
    print(f"[migrate] baseline registrada no banco: {result.db_baseline or '(nenhuma)'}")
    print(
        "[migrate] tabela schema_migrations existe: "
        f"{'sim' if result.schema_migrations_exists else 'nao'}"
    )
    print(f"[migrate] origem do baseline utilizado: {result.baseline_source}")
    print(f"[migrate] baseline efetivo: {result.baseline or '(nenhum)'}")
    print(f"[migrate] pendentes: {result.pending or 'nenhuma'}")
    if args.dry_run:
        print(f"[migrate] (dry-run) já aplicadas/atrasadas: {len(result.already_applied)}")
        return 0

    if result.applied:
        print(f"[migrate] migrations aplicadas: {result.applied}")
    else:
        print("[migrate] nenhuma migration pendente. Nada a fazer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
