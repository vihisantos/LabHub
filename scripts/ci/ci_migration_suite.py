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
           isoladas no próprio banco efêmero;
   STEP 8  behavioral do Patrimônio (091–095, matriz de acesso da issue #289).

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
    passed = len([r for r in behavioral.results if r[1]])
    detail = f"{passed}/{len(behavioral.results)} checks"
    failed = [r[0] for r in behavioral.results if not r[1]]
    if failed:
        detail += f"; FALHAS: {failed}"
    report(
        "STEP 7 - behavioral 072 (13 pontos)",
        ok,
        detail,
    )


def step_behavioral_patrimonio(executor) -> None:
    try:
        from behavioral_patrimonio import BehavioralPatrimonio

        behavioral = BehavioralPatrimonio(executor)
        ok = behavioral.run()
    except Exception as exc:  # noqa: BLE001 - import de módulo irmão
        _fail("STEP 8 - behavioral patrimonio (matriz de acesso)", exc)
        return
    passed = len([r for r in behavioral.results if r[1]])
    detail = f"{passed}/{len(behavioral.results)} checks"
    failed = [r[0] for r in behavioral.results if not r[1]]
    if failed:
        detail += f"; FALHAS: {failed}"
    report(
        "STEP 8 - behavioral patrimonio (matriz de acesso)",
        ok,
        detail,
    )


def step_behavioral_108_concurrency(dsn: str) -> None:
    """Prova FOR UPDATE SKIP LOCKED com duas conexões PostgreSQL independentes.

    A conexão A mantém o lock da linha; a conexão B chama a RPC e precisa
    retornar sem processar essa linha. Depois do COMMIT de A, uma nova chamada
    deve arquivar exatamente um ticket e gravar um único evento/auditoria.
    """
    import uuid
    import psycopg
    from psycopg.rows import dict_row

    workspace_id = None
    ticket_id = None
    try:
        with psycopg.connect(dsn, row_factory=dict_row) as setup:
            row = setup.execute(
                "INSERT INTO public.workspaces (name, slug) VALUES (%s, %s) RETURNING id",
                ("CI auto archive concurrency", f"ci-auto-archive-concurrency-{uuid.uuid4()}"),
            ).fetchone()
            workspace_id = row["id"]
            row = setup.execute(
                '''INSERT INTO public.chamados_tickets
                   (workspace_id, status, "resolvedAt", "ticketNumber", "roomName")
                   VALUES (%s, 'resolvido', clock_timestamp() - interval '45 minutes', %s, %s)
                   RETURNING id''',
                (workspace_id, uuid.uuid4().int % 1000000, "CI concorrência"),
            ).fetchone()
            ticket_id = row["id"]

        # Sessão A adquire e mantém o lock da linha elegível.
        with psycopg.connect(dsn, row_factory=dict_row) as locker:
            locker.execute(
                "SELECT id FROM public.chamados_tickets WHERE id = %s FOR UPDATE",
                (ticket_id,),
            ).fetchone()

            # Sessão B executa a RPC enquanto A ainda mantém o lock.
            with psycopg.connect(dsn, row_factory=dict_row) as contender:
                contender.execute("SET LOCAL statement_timeout = '5s'")
                skipped = contender.execute(
                    "SELECT * FROM public.auto_archive_resolved_tickets(%s::uuid[])",
                    ([workspace_id],),
                ).fetchall()
                if skipped:
                    raise AssertionError(
                        f"RPC processou ticket bloqueado por outra sessão: {skipped}"
                    )

            # Libera o lock; agora a RPC deve processar exatamente esse ticket.
            locker.commit()

        with psycopg.connect(dsn, row_factory=dict_row) as verifier:
            archived = verifier.execute(
                "SELECT * FROM public.auto_archive_resolved_tickets(%s::uuid[])",
                ([workspace_id],),
            ).fetchall()
            if len(archived) != 1 or archived[0]["id"] != ticket_id:
                raise AssertionError(
                    f"Após liberar o lock, esperava arquivar exatamente {ticket_id}; retornou {archived}"
                )
            again = verifier.execute(
                "SELECT * FROM public.auto_archive_resolved_tickets(%s::uuid[])",
                ([workspace_id],),
            ).fetchall()
            if again:
                raise AssertionError(f"RPC duplicou arquivamento na repetição: {again}")

            counts = verifier.execute(
                '''SELECT
                     (SELECT count(*) FROM public.ticket_events
                      WHERE "ticket_id" = %s AND content = 'Arquivado pelo sistema') AS events,
                     (SELECT count(*) FROM public.app_audit_logs
                      WHERE entity_id = %s::text AND action = 'auto_archived') AS audits''',
                (ticket_id, ticket_id),
            ).fetchone()
            if counts["events"] != 1 or counts["audits"] != 1:
                raise AssertionError(
                    f"Esperava 1 evento e 1 auditoria após concorrência; recebido {counts}"
                )
        report(
            "STEP 9 - migration 108 concorrência real (2 sessões PostgreSQL)",
            True,
            "sessão B ignorou linha bloqueada; após COMMIT de A, uma execução arquivou; sem duplicatas",
        )
    except Exception as exc:  # noqa: BLE001
        _fail("STEP 9 - migration 108 concorrência real (2 sessões PostgreSQL)", exc)
    finally:
        # O banco é efêmero, mas removemos os fixtures mesmo em caso de falha.
        if workspace_id is not None:
            try:
                with psycopg.connect(dsn) as cleanup:
                    if ticket_id is not None:
                        cleanup.execute("DELETE FROM public.ticket_events WHERE ticket_id = %s", (ticket_id,))
                        cleanup.execute("DELETE FROM public.app_audit_logs WHERE entity_id = %s::text", (ticket_id,))
                        cleanup.execute("DELETE FROM public.chamados_tickets WHERE id = %s", (ticket_id,))
                    cleanup.execute("DELETE FROM public.workspaces WHERE id = %s", (workspace_id,))
            except Exception as cleanup_exc:  # noqa: BLE001
                report("STEP 9 cleanup", False, str(cleanup_exc)[:300])

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
    step_behavioral_patrimonio(executor)
    step_behavioral_108_concurrency(dsn)

    from acceptance_285_300 import check_runner, check_workspace_acl

    for name, check in (
        ("STEP 10 - real runner rollback, recovery, advisory lock and idempotence (#285)", check_runner),
        ("STEP 11 - authenticated workspace app helper ACL and RLS (#300)", check_workspace_acl),
    ):
        try:
            check(dsn)
            report(name, True)
        except Exception as exc:
            _fail(name, exc)

    failed = [n for n, ok, _ in _REPORT if not ok]
    print(f"[suite] RESULTADO: {len(_REPORT) - len(failed)}/{len(_REPORT)} PASS")
    if failed:
        print(f"[suite] FALHAS: {failed}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())