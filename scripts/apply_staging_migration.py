"""Aplica a migration 111 de lembretes/Push no Supabase STAGING.

Este script existe porque `scripts/migrate.py` só conhece os targets
`local`/`production`. Ele NÃO altera o runner nem o workflow de produção.

Barreiras (todas ANTES de qualquer escrita):
  1. `SUPABASE_STAGING_PROJECT_REF` deve ser um ref válido e constar em
     `SUPABASE_STAGING_ALLOWED_PROJECT_REFS`;
  2. o allowlist DO workflow (fixo, revisado via PR) também deve conter o ref;
  3. nenhum secret de produção é lido ou referenciado;
  4. `--dry-run` só faz SELECT e não cria nem `schema_migrations`.

A aplicação reusa `migrate.runner.apply_migration`: uma única transação com
`pg_advisory_xact_lock`, o corpo da migration e o INSERT em `schema_migrations`.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from migrate.api import ManagementAPI
from migrate.core import Migration, discover_migrations
from migrate.environment import TargetEnvironmentError, TargetPolicy, validate_project_ref
from migrate.runner import apply_migration

MIGRATION_VERSION = "111"
MIGRATION_FILENAME = "111_chamado_reminder_postgres.sql"
_REF_RE = re.compile(r"^[a-z0-9]{20}$")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} não configurado; nenhuma requisição foi feita.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="valida destino e mostra o que seria aplicado, sem escrever")
    parser.add_argument("--allowed-ref", action="append", default=[],
                        help="ref permitido, fixado no workflow (repetível)")
    args = parser.parse_args()

    ref = _required("SUPABASE_STAGING_PROJECT_REF")
    token = _required("SUPABASE_STAGING_ACCESS_TOKEN")
    allowed_raw = _required("SUPABASE_STAGING_ALLOWED_PROJECT_REFS")

    allowed = tuple(p.strip() for p in allowed_raw.split(",") if p.strip())
    hard_coded = tuple(r.strip() for r in args.allowed_ref if r.strip())
    if not allowed:
        raise SystemExit("SUPABASE_STAGING_ALLOWED_PROJECT_REFS vazio; abortando.")
    if hard_coded and any(r not in allowed for r in hard_coded):
        raise SystemExit(
            "Allowlist do workflow diverge de SUPABASE_STAGING_ALLOWED_PROJECT_REFS; "
            "abortando antes de qualquer requisição."
        )
    if not _REF_RE.match(ref):
        raise SystemExit("SUPABASE_STAGING_PROJECT_REF em formato inválido; abortando.")
    if ref not in allowed or (hard_coded and ref not in hard_coded):
        raise SystemExit(
            "SUPABASE_STAGING_PROJECT_REF não autorizado como Staging; abortando."
        )

    policy = TargetPolicy(
        target="production",  # apenas para ativar o enforcement de allowlist
        require_baseline=False,
        allowed_project_refs=allowed,
        enforce_allowlist=True,
    )
    try:
        validate_project_ref(ref, policy)
    except TargetEnvironmentError as exc:
        raise SystemExit(f"Destino rejeitado: {exc}") from exc

    api = ManagementAPI(access_token=token, project_ref=ref)
    migrations_dir = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
    migration = next(
        (m for m in discover_migrations(migrations_dir)
         if m.version == MIGRATION_VERSION and m.filename == MIGRATION_FILENAME),
        None,
    )
    if migration is None:
        raise SystemExit(f"Migration {MIGRATION_FILENAME} não encontrada no repositório.")

    if args.dry_run:
        exists = api.query("SELECT to_regclass('public.schema_migrations') AS t")
        print(f"[staging] destino autorizado; migration pendente: {migration.filename}")
        print(f"[staging] schema_migrations presente: {bool(exists and exists[0].get('t'))}")
        print("[staging] dry-run: nenhuma escrita realizada.")
        return 0

    api.query("""
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version     text PRIMARY KEY,
            filename    text NOT NULL,
            applied_at  timestamptz NOT NULL DEFAULT now(),
            duration_ms integer NOT NULL DEFAULT 0
        );
    """)
    rows = api.query(
        "SELECT version, filename FROM public.schema_migrations "
        f"WHERE version = '{MIGRATION_VERSION}';"
    ) or []
    if rows:
        applied_filename = rows[0].get("filename")
        if applied_filename != MIGRATION_FILENAME:
            raise SystemExit(
                f"Versão {MIGRATION_VERSION} já registrada com outro filename; abortando."
            )
        print(f"[staging] {MIGRATION_FILENAME} já aplicada; nada a fazer.")
        return 0

    apply_migration(api, migration)
    print(f"[staging] {MIGRATION_FILENAME} aplicada e registrada com sucesso.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
