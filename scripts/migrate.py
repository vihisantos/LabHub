#!/usr/bin/env python3
"""Entrypoint do migration runner.

Exemplo (produção, após configurar os segredos no GitHub / .env):

    python scripts/migrate.py --migrations-dir supabase/migrations

Aplica migrations pendentes (versões > baseline) via Supabase Management API.
Idempotente: migrations já registradas em ``schema_migrations`` são ignoradas.
"""
from __future__ import annotations

import argparse
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="migrate.py",
        description="Aplica migrations SQL do LabHub via Supabase Management API.",
    )
    parser.add_argument(
        "--migrations-dir",
        default=str(DEFAULT_MIGRATIONS_DIR),
        help="Diretório com as migrations (default: supabase/migrations do repo).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Apenas lista as migrations pendentes sem executar nada.",
    )
    args = parser.parse_args(argv)

    _load_env()

    migrations_dir = Path(args.migrations_dir)
    access_token = None  # lido do ambiente pelo ManagementAPI
    project_ref = None   # lido do ambiente pelo ManagementAPI

    api = ManagementAPI(access_token=access_token, project_ref=project_ref)

    # Valida configuração antes de qualquer chamada (falha cedo e clara).
    try:
        # acessa atributos para forçar a validação de variáveis ausentes
        _ = api._headers()
    except ApiError as exc:
        print(f"[migrate] ERRO: {exc}", file=sys.stderr)
        print(
            "[migrate] Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF "
            "(GitHub Secrets ou .env.local).",
            file=sys.stderr,
        )
        return 2

    try:
        result = run(migrations_dir, api)
    except ApiError as exc:
        print(f"[migrate] ERRO na Management API: {exc}", file=sys.stderr)
        return 1
    except MigrationError as exc:
        print(f"[migrate] ERRO de migration: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - fronteira do CLI
        print(f"[migrate] ERRO inesperado: {type(exc).__name__}: {exc}", file=sys.stderr)
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
