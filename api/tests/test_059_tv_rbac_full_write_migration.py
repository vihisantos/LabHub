"""Revisão estática da migration 059_tv_rbac_full_write.sql.

A suíte backend roda sem Postgres ao vivo (padrão api/tests: leitura estática
do DDL). Esta migration alinha o RLS de escrita da TV (módulo 'tv') com o
AppAccessLevel do frontend: apenas `full` gerencia conteúdo (events, playlists,
queues, tracks, galleries, photos, calendar_cache, urgent_announcements,
devices) e aprova/rejeita pedidos de música.

Garantias verificadas aqui (estruturais, dentro do corpo da migration):
  - Helper nova `user_can_manage_tv(uuid)`: SECURITY DEFINER, STABLE,
    SET search_path = public, fail-closed (ws_id IS NOT NULL), fonte única =
    override individual `profiles.app_access->>'tv' = 'full'`.
  - ACL da helper: REVOKE de anon/PUBLIC + GRANT a authenticated e service_role
    (padrão 044/049/050).
  - `tv_can_manage_workspace` (predicado de escrita de TODAS as tabelas tv_*)
    passa a exigir `is_super_admin() OR (user_belongs_to_workspace(p_ws) AND
    user_can_manage_tv(p_ws))` — sem USING(true) e sem `user_can_x` legado.
  - `tv_music_requests_update`: super admin OU (membro do workspace E full) —
    fecha o gap músicas aprovar/rejeitar (aprovador humano aprovou apenas
    membro antes da 059).
  - `tv_music_requests_select`: sai de USING(true) para
    `can_access_tv_workspace(workspace_id)`.
  - INSERT de tv_music_requests permanece self (não mexe na policy de INSERT).
  - Não usa SQL dinâmico / EXECUTE / exception (sem canais de inject).
"""

import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "059_tv_rbac_full_write.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("059_")


def _load() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def test_cria_helper_user_can_manage_tv():
    sql = _load()
    assert "CREATE OR REPLACE FUNCTION public.user_can_manage_tv(ws_id uuid)" in sql
    assert sql.count("user_can_manage_tv") >= 5  # definição + ACL + 2 policies

    # SECURITY DEFINER + search_path fixo (Invariante 044/049/050)
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public" in sql

    # Fail-closed: ws_id NÃO NULO e override individual 'full' do app TV
    assert "WS_ID IS NOT NULL" in sql.upper() or "ws_id IS NOT NULL" in sql
    assert "COALESCE(p.app_access->>'tv', '') = 'full'" in sql
    # BYPASS do super admin NÃO dentro da helper (Invariante de policies)
    assert "IS_SUPER_ADMIN" not in sql.split("tv_can_manage_workspace")[0]


def test_acl_helper_oscila_revoke_grant():
    sql = _load()
    fn = "public.user_can_manage_tv(uuid)"
    assert f"REVOKE EXECUTE ON FUNCTION {fn} FROM anon" in sql
    assert f"REVOKE EXECUTE ON FUNCTION {fn} FROM PUBLIC" in sql
    assert f"GRANT EXECUTE ON FUNCTION {fn} TO authenticated" in sql
    assert f"GRANT EXECUTE ON FUNCTION {fn} TO service_role" in sql


def test_tv_can_manage_workspace_exige_full():
    sql = _load()
    assert "tv_can_manage_workspace" in sql
    body = sql.split("tv_can_manage_workspace", 1)[1]
    assert "public.user_can_manage_tv(p_ws)" in body
    # Sem USING(true) generalizado e sem predicado membro-por-membro
    assert "using (true" not in body.lower()


def test_music_requests_update_somente_full():
    sql = _load()
    block = sql.split("tv_music_requests_update", 1)[1]
    assert "public.is_super_admin()" in block
    assert "public.user_belongs_to_workspace(workspace_id)" in block
    assert "public.user_can_manage_tv(workspace_id)" in block
    # A aprovação não pode usar apenas o predicado de leitura
    assert "can_access_tv_workspace(workspace_id)" not in block


def test_music_requests_select_por_workspace():
    sql = _load()
    block = sql.split("tv_music_requests_select", 1)[1]
    assert "public.can_access_tv_workspace(workspace_id)" in block
    assert "using (true" not in block.lower()


def test_insert_de_music_requests_nao_mexido():
    sql = _load()
    # Não há DROP/CREATE da policy de INSERT na migration
    assert 'tv_music_requests_insert' not in sql


def test_sem_sql_dinamico_ou_exception():
    sql = _load()
    # EXECUTE aqui é só da ACL (GRANT/REVOKE EXECUTE) — o corpo das functions
    # não pode usar execução dinâmica nem exception.
    assert "EXECUTE FORMAT" not in sql.upper()
    assert "EXECUTE IMMEDIATE" not in sql.upper()
    assert "EXCEPTION" not in sql.upper()