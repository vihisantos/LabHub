"""Smoke do CLI: `scripts/migrate.py --dry-run` é REALMENTE read-only.

Evidência no nível da linha de comando (além dos testes unitários do runner):
num banco efêmero fresíssimo, `--dry-run --from-scratch` deve:
  - sair com código 0 e imprimir o plano (baseline, pendentes);
  - NÃO criar `public.schema_migrations` (nem bootstrap, nem baseline, nem
    migrations) — provado por to_regclass antes/depois.

Uso: ``python ci/ci_dry_run_smoke.py`` (usa DATABASE_URL do ambiente do job).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = PROJECT_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
MIGRATE_CLI = _SCRIPTS_DIR / "migrate.py"
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


def _to_regclass(executor):
    return executor.query("SELECT to_regclass('public.schema_migrations') AS t")[0]["t"]


def main() -> int:
    from migrate.pg import PostgresExecutor

    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("[dry-run] ERRO: DATABASE_URL não configurada.", file=sys.stderr)
        return 2
    executor = PostgresExecutor(dsn=dsn)

    before = _to_regclass(executor)
    proc = subprocess.run(
        [
            sys.executable,
            str(MIGRATE_CLI),
            "--migrations-dir", str(MIGRATIONS_DIR),
            "--dry-run",
            "--from-scratch",
            "--database-url", dsn,
        ],
        capture_output=True,
        text=True,
    )
    stdout = proc.stdout
    if proc.returncode != 0:
        print(f"[dry-run] FAIL - processo retornou {proc.returncode}; stderr: {proc.stderr}")
        return 1
    if "(dry-run)" not in stdout:
        print("[dry-run] FAIL - saida sem marcação (dry-run):\n" + stdout)
        return 1

    after = _to_regclass(executor)
    ok = before is None and after is None
    print(
        f"[dry-run] {'PASS' if ok else 'FAIL'} - to_regclass antes={before!r} depois={after!r} "
        f"(sem tabela criada = sem mutação)"
    )
    print(stdout)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())