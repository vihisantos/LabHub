"""Revisão estática da migration 073 (fechamento do self-delete de `profiles`).

Escopo: #286 PR-2. A migration troca `profiles_delete` de
`USING (auth.uid() = id OR is_super_admin())` para `USING (is_super_admin())`.

A suíte backend roda sem Postgres ao vivo (padrão `api/tests`: leitura estática
do DDL). O que é verificável estaticamente E provado aqui:

  1. a policy de DELETE de `profiles` criada pela 073 exige `is_super_admin()`;
  2. a migration é idempotente (`DROP POLICY IF EXISTS` + `CREATE POLICY`);
  3. — o mais importante — NENHUMA policy de DELETE de `profiles` viva em
     qualquer migration permite self-delete. Isso é calculado reproduzindo as
     definições de policy na ordem canônica dos arquivos (o último `CREATE
     POLICY` de cada nome prevalece) e exige que toda predicate de DELETE seja
     super-admin-only. Como policies permissivas são combinadas por OU, uma
     única policy permissiva reabriria o furo — o teste fecha essa porta;
  4. `admin_abs_delete_profiles` (022) continua intocada e restrita;
  5. a 073 não toca nenhuma outra policy/tabela/coluna/RPC/trigger;
  6. o fluxo administrativo de rejeição (`adminService.rejectUser`) segue
     deletando `profiles` e continua sendo o ÚNICO `.delete()` sobre `profiles`
     no frontend (nenhum caminho de autoexclusão foi reintroduzido).

LIMITAÇÃO DOCUMENTADA (teste comportamental de RLS):
    Não é possível provar o comportamento por ator (`authenticated` comum /
    pending / coordenador / líder vs Super Admin) no PostgreSQL efêmero do CI.
    Motivo: o runner conecta como `postgres` (superuser, que ignora RLS) e o
    banco efêmero não reproduz os GRANTs default do Supabase — não existe
    `GRANT ... ON public.profiles TO authenticated` em nenhuma migration nem no
    stub. Um `SET ROLE authenticated` falharia por PRIVILÉGIO, não por RLS, e
    falharia inclusive para o Super Admin. `test_no_grant_on_profiles_in_repo`
    registra essa condição: quando alguém introduzir os GRANTs, o teste
    comportamental com `set_config('role', ...)` passa a ser possível e deve
    ser acrescentado.

Links:
  - Migration:      supabase/migrations/073_profiles_delete_hardening.sql
  - Policy exata:   supabase/migrations/028_authorization_consolidation.sql
  - Base do admin:  supabase/migrations/022_fix_admin_profiles.sql
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS_DIR / "073_profiles_delete_hardening.sql"
ADMIN_SERVICE = ROOT / "src" / "core" / "auth" / "adminService.ts"

# Colunas/objetos que a 073 NÃO pode tocar (linhas vermelhas do #286).
FORBIDDEN_IN_MIGRATION = [
    "workspace_ids",
    "app_access",
    "memberships",
    "auth.users",
    "admin_set_user_memberships",
    "admin_upsert_membership",
    "admin_remove_membership",
    "admin_set_manager",
    "coordinator_",
    "is_super_admin =",
    "INSERT INTO",
    "UPDATE public",
    "DELETE FROM",
    "CREATE TABLE",
    "CREATE TRIGGER",
    "CREATE OR REPLACE FUNCTION",
    "GRANT ",
    "REVOKE ",
]

# Nomes de policy de DELETE que já existiram em `profiles` (histórico).
KNOWN_DELETE_POLICIES = {"profiles_delete", "admin_abs_delete_profiles"}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", text)


def _delete_policies(sql: str) -> list[tuple[str, str]]:
    """`(nome, predicado USING)` de cada `CREATE POLICY ... FOR DELETE` em profiles.

    O predicado captura até o `;` que fecha o statement — o suficiente para
    detectar `auth.uid()` sem depender do aninhamento de parênteses.
    """
    found: list[tuple[str, str]] = []
    pattern = re.compile(
        r"CREATE\s+POLICY\s+\"?(\w+)\"?\s+ON\s+public\.profiles\s+FOR\s+DELETE\b(.*?);",
        re.IGNORECASE,
    )
    for match in pattern.finditer(_normalize(_strip_comments(sql))):
        name, tail = match.group(1), match.group(2)
        using = re.search(r"USING\s*\((.*)\)\s*$", tail, re.IGNORECASE | re.DOTALL)
        found.append((name, using.group(1) if using else tail))
    return found


@pytest.fixture(scope="module")
def migration() -> str:
    assert MIGRATION.exists(), f"migration 073 ausente: {MIGRATION}"
    return MIGRATION.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def migration_sql() -> str:
    return _normalize(_strip_comments(MIGRATION.read_text(encoding="utf-8")))


def test_profiles_delete_policy_requires_super_admin(migration_sql: str) -> None:
    """A policy de DELETE criada pela 073 é `is_super_admin()` e nada mais."""
    policies = _delete_policies(migration_sql)
    assert len(policies) == 1, f"esperado 1 policy de DELETE, encontrado {len(policies)}"
    name, predicate = policies[0]
    assert name == "profiles_delete"
    assert "is_super_admin" in predicate
    assert "auth.uid" not in predicate, (
        f"self-delete reaberto: {name} USING ({predicate})"
    )


def test_migration_is_idempotent(migration_sql: str) -> None:
    """`DROP POLICY IF EXISTS` + `CREATE POLICY` (padrão 028/044/067)."""
    assert re.search(
        r"DROP POLICY IF EXISTS \"profiles_delete\" ON public\.profiles",
        migration_sql,
        re.IGNORECASE,
    ), "DROP POLICY IF EXISTS ausente (replay não seria seguro)"
    assert re.search(r"CREATE POLICY", migration_sql, re.IGNORECASE)
    assert re.search(r"TO authenticated", migration_sql, re.IGNORECASE)


def test_no_live_delete_policy_allows_self_delete() -> None:
    """NENHUMA policy de DELETE de `profiles` permite `auth.uid() = id`.

    Reproduz as definições na ordem canônica (último `CREATE POLICY` de cada
    nome prevalece) e exige super-admin-only em todas. Policies permissivas
    são OU: uma só policy permissiva reabriria o furo.
    """
    effective: dict[str, str] = {}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        for name, predicate in _delete_policies(path.read_text(encoding="utf-8")):
            effective[name] = predicate

    assert effective, "nenhuma policy de DELETE de profiles encontrada (fixture?)"
    offenders = {
        name: predicate
        for name, predicate in effective.items()
        if "auth.uid" in predicate
    }
    assert not offenders, f"policy de DELETE de profiles permite self-delete: {offenders}"
    assert set(effective) <= KNOWN_DELETE_POLICIES, (
        f"policy de DELETE nova/não revisada em profiles: {set(effective) - KNOWN_DELETE_POLICIES}"
    )


def test_admin_abs_delete_policy_untouched(migration_sql: str) -> None:
    """`admin_abs_delete_profiles` (022) não é derrubada nem recriada aqui."""
    assert "admin_abs_delete_profiles" not in migration_sql, (
        "a 073 não deve tocar admin_abs_delete_profiles (já é super-admin-only)"
    )


def test_migration_does_not_touch_out_of_scope(migration_sql: str) -> None:
    """Nenhuma outra policy/coluna/tabela/RPC/trigger é alterada."""
    for token in FORBIDDEN_IN_MIGRATION:
        assert token.lower() not in migration_sql.lower(), (
            f"a 073 não deveria referenciar {token!r} (fora do escopo do PR-2)"
        )
    # `profiles.role` só pode aparecer como coluna preservada em comentário, e os
    # comentários já foram removidos acima: nenhuma coluna é tocada no DDL.
    assert re.search(
        r"CREATE POLICY\s+\"profiles_delete\"\s+ON public\.profiles\s+FOR DELETE\s+"
        r"TO authenticated\s+USING\s*\(\s*public\.is_super_admin\(\)\s*\)",
        migration_sql,
        re.IGNORECASE,
    ), "DDL final fora do formato esperado"


def test_reject_user_admin_flow_preserved() -> None:
    """`rejectUser()` continua deletando `profiles` (ato do Super Admin).

    Também garante que não existe outro `.delete()` sobre `profiles` no
    frontend — ou seja, nenhum caminho de autoexclusão foi (re)introduzido.
    """
    source = ADMIN_SERVICE.read_text(encoding="utf-8")
    assert re.search(
        r"rejectUser:[\s\S]*?\.from\('profiles'\)[\s\S]*?\.delete\(\)",
        source,
    ), "rejectUser deixou de deletar profiles (fluxo administrativo quebrado)"

    frontend = [
        path
        for pattern in ("src/**/*.ts", "src/**/*.tsx")
        for path in ROOT.glob(pattern)
        if "__tests__" not in path.parts
    ]
    offenders: list[tuple[str, int]] = []
    for path in frontend:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in re.finditer(r"\.from\('profiles'\)", text):
            window = text[match.start(): match.start() + 200]
            if ".delete()" in window:
                line = text[: match.start()].count("\n") + 1
                offenders.append((path.name, line))

    assert len(offenders) == 1, (
        f"exclusão de profiles fora do rejectUser administrativo: {offenders}"
    )
    offender_file, offender_line = offenders[0]
    assert offender_file == "adminService.ts", (
        f"profiles deletado em {offender_file} — só o rejectUser administrativo pode"
    )
    lines = source.splitlines()
    start = next(i for i, line in enumerate(lines, 1) if "rejectUser:" in line)
    end = next(
        (i for i, line in enumerate(lines, 1) if i > start and "updateUserAvatar:" in line),
        len(lines),
    )
    assert start < offender_line < end, (
        f"o .delete() em profiles (linha {offender_line}) saiu do corpo de rejectUser "
        f"(linhas {start}-{end})"
    )


def test_no_grant_on_profiles_in_repo() -> None:
    """Documenta por que não há teste comportamental de RLS no CI efêmero.

    O banco efêmero do runner não reproduz os GRANTs default do Supabase: sem
    `GRANT ... ON public.profiles TO authenticated`, um `SET ROLE authenticated`
    falharia por PRIVILÉGIO (não por RLS) — inclusive para o Super Admin.
    Quando este teste passar a falhar (GRANTs introduzidos), o teste comportamental
    por ator deve ser acrescentado.
    """
    grants = [
        path.name
        for path in sorted(MIGRATIONS_DIR.glob("*.sql"))
        if re.search(
            r"GRANT[^;]*\bON\s+(public\.)?profiles\b[^;]*TO\s+authenticated",
            _normalize(_strip_comments(path.read_text(encoding="utf-8"))),
            re.IGNORECASE,
        )
    ]
    stub_grants = re.search(
        r"GRANT[^;]*\bON\s+(public\.)?profiles\b",
        (ROOT / "scripts" / "ci" / "supabase_stub_bootstrap.sql").read_text(encoding="utf-8"),
        re.IGNORECASE,
    )
    assert not grants and not stub_grants, (
        f"GRANT em profiles apareceu ({grants}); agora o teste comportamental de RLS "
        "por ator é possível e deve ser escrito"
    )
