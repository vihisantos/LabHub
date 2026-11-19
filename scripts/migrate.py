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
    LOCAL,
    STAGING,
    PRODUCTION,
    TargetEnvironmentError,
    TargetPolicy,
    resolve_policy,
    validate_project_ref,
    warn_unenforced_allowlist,
    ENV_STAGING_PROJECT_REF,
    ENV_STAGING_ALLOWED_REFS,
)
from migrate.runner import run

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


_VARS_SOMENTE_TARGET = frozenset(
    {
        "SUPABASE_PROJECT_REF",
        "BASELINE_VERSION",
        "SUPABASE_ALLOWED_PROJECT_REFS",
        ENV_STAGING_PROJECT_REF,
        ENV_STAGING_ALLOWED_REFS,
    }
)


def _load_env(target: str | None = None) -> None:
    """Carrega .env/.env.local quando presentes (nunca sobrescreve vars existentes).

    O .env do repositório descreve STAGING (SUPABASE_STAGING_PROJECT_REF de staging e
    BASELINE_VERSION=000). Como load_dotenv roda com override=False, o primeiro
    arquivo a definir a variável vence — então, sem cuidado, uma execução local
    de --target staging herdaria a identidade de outro ambiente em silêncio.

    Por isso, em staging e produção, as variáveis específicas do target
    (SUPABASE_STAGING_PROJECT_REF, BASELINE_VERSION, SUPABASE_STAGING_ALLOWED_PROJECT_REFS,
    SUPABASE_PROJECT_REF, SUPABASE_ALLOWED_PROJECT_REFS) só podem vir do
    arquivo .env.<target> ou do ambiente do processo (secrets/variáveis do GitHub,
    export explícito no shell). De .env e .env.local são descartadas em staging
    e produção: são arquivos de desenvolvimento, e o único papel deles ali é
    fornecer credenciais (SUPABASE_ACCESS_TOKEN).
    """
    if load_dotenv is None or dotenv_values is None:
        return
    effective = (target or os.environ.get("MIGRATE_TARGET", "") or LOCAL).strip().lower()
    is_target = effective in (STAGING, PRODUCTION)
    if is_target:
        # Para staging e production, carrega primeiro o .env específico do target
        # antes de considerar .env e .env.local (cujas variáveis de target são
        # descartadas para evitar vazamento silencioso de identidade).
        names = (f".env.{effective}", ".env", ".env.local")
    else:
        names = (".env", ".env.local")
    for name in names:
        path = PROJECT_ROOT / name
        if not path.is_file():
            continue
        target_file = f".env.{effective}" if is_target else None
        if not is_target or name == target_file:
            load_dotenv(path, override=False)
            continue
        blocked = _VARS_SOMENTE_TARGET
        for key, value in dotenv_values(path).items():
            if key in blocked or key in os.environ or value is None:
                continue
            os.environ[key] = value


def _build_executor(args: argparse.Namespace, policy: TargetPolicy):
    """Engenaria de execução: Management API (padrão) ou Postgres efêmero.

    O DSN tem precedência sobre a Management API porque o CI de migrations usa
    um PostgreSQL descartável e nunca deve exigir token de produção. A política de
    ambiente (#285) só é aplicada no caminho da Management API.
    """
    dsn = args.database_url or os.environ.get("DATABASE_URL", "").strip()
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
    #
    # O project_ref vem da variável de ambiente apropriada ao target:
    #   - production: SUPABASE_PROJECT_REF
    #   - staging:    SUPABASE_STAGING_PROJECT_REF
    #   - local:      (não usado via Management API)
    project_ref_env_var = policy.project_ref_env_var or "SUPABASE_PROJECT_REF"
    project_ref = os.environ.get(project_ref_env_var, "")
    try:
        validate_project_ref(project_ref, policy)
    except TargetEnvironmentError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        sys.exit(2)

    warning = warn_unenforced_allowlist(policy)
    if warning:
        print(f"[migrate] AVISO: {warning}", file=sys.stderr)

    api = ManagementAPI(access_token=None, project_ref=project_ref)
    # Valida configuração antes de qualquer chamada (falha cedo e clara).
    try:
        # acessa atributos para forçar a validação de variáveis ausentes
        _ = api._headers()
    except ApiError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        print(
            f"[migrate] Configure {project_ref_env_var.replace('REF', '_ACCESS_TOKEN')} "
            f"e {project_ref_env_var} (GitHub Secrets ou .env.local), ou passe "
            "--database-url para executar num PostgreSQL efêmero.",
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
            "Ambiente de destino. 'production' e fail-closed: exige "
            "SUPABASE_ALLOWED_PROJECT_REFS e BASELINE_VERSION. 'staging' exige "
            "SUPABASE_STAGING_ALLOWED_PROJECT_REFS e SUPABASE_STAGING_PROJECT_REF. "
            "Default: variavel MIGRATE_TARGET, ou 'local'."
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
            "Allowlist de SUPABASE_STAGING_PROJECT_REF separada por virgula. "
            "Default: variavel SUPABASE_STAGING_ALLOWED_PROJECT_REFS."
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
            "--target production."
        ),
    )
    args = parser.parse_args(argv)

    _load_env(args.target)

    try:
        # Para staging, usa a allowlist específica do staging se fornecida via CLI.
        allowed_refs = (
            args.allowed_project_refs_staging
            if args.target == STAGING
            else args.allowed_project_refs
        )
        policy = resolve_policy(
            target=args.target,
            allowed_refs=allowed_refs,
            require_baseline=args.require_baseline,
        )
    except TargetEnvironmentError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        return 2

    migrations_dir = Path(args.migrations_dir)

    api = _build_executor(args, policy)

    from_scratch = args.from_scratch or os.environ.get("MIGRATE_FROM_SCRATCH", "") == "1"
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

    print(f"[migrate] alvo: {policy.describe()}")
    print(f"[migrate] baseline: {result.baseline or '(nenhum)'}")
    if args.dry_run:
        print(f"[migrate] (dry-run) pendentes: {result.pending or 'nenhuma'}")
        print(f"[migrate] (dry-run) já aplicadas/atrasadas: {len(result.already_applied)}")
        return 0

    if result.applied:
        print(f"[migrate] migrations aplicadas: {result.applied}")
    else:
        print("[migrate] nenhuma migration pendente. Nada a fazer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
