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
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - dotenv é opcional
    load_dotenv = None

from migrate import MigrationError
from migrate.api import ApiError, ManagementAPI
from migrate.runner import run

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


def _load_env() -> None:
    """Carrega .env/.env.local quando presentes (nunca sobrescreve vars existentes)."""
    if load_dotenv is None:
        return
    for name in (".env", ".env.local"):
        path = PROJECT_ROOT / name
        if path.is_file():
            load_dotenv(path, override=False)


def _build_executor(args: argparse.Namespace):
    """Engenharia de execução: Management API (padrão) ou Postgres efêmero."""
    dsn = args.database_url or os.environ.get("DATABASE_URL", "").strip()
    if dsn or args.database_url is not None:
        from migrate.pg import PostgresExecutor, SqlExecutionError

        try:
            return PostgresExecutor(dsn=dsn or None)
        except SqlExecutionError as exc:
            print(f"[migrate] ERRO: {exc}", file=sys.stderr)
            sys.exit(2)

    api = ManagementAPI(access_token=None, project_ref=None)
    # Valida configuração antes de qualquer chamada (falha cedo e clara).
    try:
        # acessa atributos para forçar a validação de variáveis ausentes
        _ = api._headers()
    except ApiError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        print(
            "[migrate] Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF "
            "(GitHub Secrets ou .env.local), ou passe --database-url para "
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
    args = parser.parse_args(argv)

    _load_env()
    migrations_dir = Path(args.migrations_dir)

    api = _build_executor(args)

    from_scratch = args.from_scratch or os.environ.get("MIGRATE_FROM_SCRATCH", "") == "1"
    try:
        result = run(
            migrations_dir,
            api,
            dry_run=args.dry_run,
            from_scratch=from_scratch,
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
