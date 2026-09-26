"""Suite de migrations contra PostgreSQL EFÊMERO (CI de PR).

Fluxo (tudo em um banco descartável do GitHub Actions `services: postgres`):

   STEP 1  bootstrap Supabase-like (roles anon/authenticated/service_role,
           schema auth + auth.uid()/auth.jwt()/auth.role(), auth.users);
   STEP 2  dry-run real: prova que `--dry-run` é read-only — nem a tabela
           schema_migrations é criada; SÓ SELECT/to_regclass;
   STEP 3  aplica TODAS as migrations 000→072 via runner (from-scratch);
   STEP 4  rerun: idempotente, nada é reaplicado/duplicado;
   STEP 5  schema_migrations consistente (1 linha por migration, na ordem canônica,
           sem baseline — from-scratch não grava linha de baseline);
   STEP 6  roda TODO arquivo de testes estruturais/comportamentais
           supabase/migrations/tests/*.sql (falha -> FALHA do CI);
   STEP 7  behavioral da migration 072 (13 pontos da PR #284) em fixtures
           isoladas no próprio banco efêmero.

SAÍDA: resumo por passo + código de saída != 0 se qualquer validação falhar.
NUNCA conecta em DEV/PROD — usa apenas DATABASE_URL (secreto/endpoint do
banco descartável, criado no mesmo worktree do job).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
# garante que `import behavioral_072` (módulo irmão deste diretório) funciona
_CI_DIR = str(Path(__file__).resolve().parent)
if _CI_DIR not in sys.path:
    sys.path.insert(0, _CI_DIR)

from migrate.pg import PostgresExecutor, SqlExecutionError

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"
TESTS_DIR = MIGRATIONS_DIR / "tests"
BOOTSTRAP = Path(__file__).parent / "supabase_stub_bootstrap.sql"

_REPORT: list[tuple[str, bool, str]] = []


def report(name: str, ok: bool, detail: str = "") -> None:
    _REPORT.append((name, ok, detail))
    print(f"[suite] {'PASS' if ok else 'FAIL'} - {name}" + (f" :: {detail}" if detail else ""))


def _fail(name: str, exc: Exception) -> None:
    report(name, False, str(exc)[:400])


def step_bootstrap(executor) -> None:
    try:
        executor.query(BOOTSTRAP.read_text(encoding="utf-8"))
        report("STEP 1 - bootstrap Supabase-like", True)
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 1 - bootstrap Supabase-like", exc)


def step_dry_run_proof(executor) -> None:
    from migrate.runner import run

    # tabela de histórico não deve existir antes do from-scratch
    before = executor.query("SELECT to_regclass('public.schema_migrations') AS t")[0]["t"]
    try:
        result = run(MIGRATIONS_DIR, executor, dry_run=True, from_scratch=True)
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 2 - dry-run (planejamento sem mutacao)", exc)
        return
    after = executor.query("SELECT to_regclass('public.schema_migrations') AS t")[0]["t"]
    ok = before is None and after is None
    report(
        "STEP 2 - dry-run (planejamento sem mutacao)",
        ok,
        f"before={before!r} after={after!r} pendentes={len(result.pending)}",
    )


def step_apply_from_scratch(executor) -> None:
    from migrate.runner import run

    try:
        result = run(MIGRATIONS_DIR, executor, from_scratch=True)
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 3 - aplicar 000..072 (from-scratch)", exc)
        return
    ok = len(result.applied) == len(result.pending) and result.applied
    report(
        "STEP 3 - aplicar 000..072 (from-scratch)",
        ok,
        f"aplicadas={len(result.applied)}: {result.applied[:3]}..{result.applied[-1:]}",
    )
    if not ok:
        report("STEP 3 - detalhe", False, f"pending={result.pending}")


def step_rerun_idempotent(executor) -> None:
    from migrate.runner import run

    try:
        result = run(MIGRATIONS_DIR, executor)
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 4 - rerun idempotente", exc)
        return
    report(
        "STEP 4 - rerun idempotente",
        result.applied == [] and result.pending == [],
        f"reaplicadas={result.applied}, pendentes={result.pending}",
    )


def step_schema_migrations_consistent(executor, migrations_dir) -> None:
    from migrate.core import discover_migrations

    try:
        rows = executor.query(
            "SELECT version, filename FROM public.schema_migrations "
            "ORDER BY version::int"
        ) or []
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 5 - schema_migrations consistente", exc)
        return
    expected = discover_migrations(migrations_dir)
    problem = None
    if len(rows) != len(expected):
        problem = f"contagem {len(rows)} != {len(expected)} migrations"
    else:
        for row, mig in zip(rows, expected):
            if row["version"] != mig.version or row["filename"] != mig.filename:
                problem = f"ordem/filename divergente: {row} vs {mig.filename}"
                break
        for row in rows:
            if row["filename"] == "__baseline__":
                problem = "from-scratch nao pode gravar linha de baseline"
                break
    report(
        "STEP 5 - schema_migrations consistente",
        problem is None,
        problem or f"{len(rows)} linhas na ordem canonica (sem baseline)",
    )


def step_run_static_tests(executor) -> None:
    tests = sorted(TESTS_DIR.glob("*.sql"))
    failures: list[str] = []
    for path in tests:
        try:
            executor.query(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{path.name}: {str(exc)[:200]}")
    report(
        "STEP 6 - testes estruturais/comportamentais (*.sql)",
        not failures,
        (f"{len(tests) - len(failures)}/{len(tests)} OK"
         + (f"; FALHAS: {failures}" if failures else "")),
    )


def step_behavioral_072(executor) -> None:
    try:
        from behavioral_072 import Behavioral072

        behavioral = Behavioral072(executor)
        ok = behavioral.run()
    except Exception as exc:  # noqa: BLE001 - import de módulo irmão
        _fail("STEP 7 - behavioral 072 (13 pontos)", exc)
        return
    report(
        "STEP 7 - behavioral 072 (13 pontos)",
        ok,
        f"{len([r for r in behavioral.results if r[1]])}/{len(behavioral.results)} checks",
    )


def main() -> int:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("[suite] ERRO: DATABASE_URL não configurada.", file=sys.stderr)
        return 2
    executor = PostgresExecutor(dsn=dsn)

    step_bootstrap(executor)
    step_dry_run_proof(executor)
    step_apply_from_scratch(executor)
    step_rerun_idempotent(executor)
    step_schema_migrations_consistent(executor, MIGRATIONS_DIR)
    step_run_static_tests(executor)
    step_behavioral_072(executor)

    failed = [n for n, ok, _ in _REPORT if not ok]
    print(f"[suite] RESULTADO: {len(_REPORT) - len(failed)}/{len(_REPORT)} PASS")
    if failed:
        print(f"[suite] FALHAS: {failed}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())