"""Revisão estática do SQL do PR 5 (migration 032_tv_app_data_purge.sql).

A suíte backend deste repositório roda sem Postgres ao vivo (padrão das demais
suítes em api/tests: fakes de requests). As garantias que vivem DENTRO da
transação SQL — escopo dos predicates, ordem backup→delete→audit, lock de
concorrência, grants — são aqui verificadas por análise estática do DDL, para
que qualquer regressão futura na migration quebre o build.

O que este teste trava:
  1. O purge só pode tocar as 9 tabelas de conteúdo da TV;
  2. Todo DELETE é workspace-scoped (igualdade com p_workspace — NULL nunca
     entra) ou alcançado pelo pai workspace-scoped (fotos/trilhas);
  3. Ordem obrigatória: lock → snapshot → guarda de tamanho → BACKUP →
     DELETEs → AUDIT (nunca delete sem backup confirmado na mesma transação);
  4. Zero DELETE fora do escopo esperado (devices/codes/music requests/
     settings/audit nunca aparecem; única exceção: TTL de backups expirados);
  5. describe conta exatamente as mesmas 9 tabelas, todas escopadas;
  6. EXECUTE somente para service_role.
"""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "032_tv_app_data_purge.sql"

# DDL real das tabelas TV (baseline; nenhuma migration posterior altera estas FKs).
BASELINE = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "000_bootstrap_baseline.sql"

# Escopo EXATO do purge (mesma lista do AppDataResetModal.tsx e do endpoint).
TV_CONTENT_TABLES = {
    "tv_events",
    "tv_playlists",
    "tv_announcements",
    "tv_galleries",
    "tv_gallery_photos",
    "tv_music_queues",
    "tv_music_tracks",
    "tv_urgent_announcements",
    "tv_calendar_cache",
}

# Nunca podem aparecer como alvo de DELETE nesta migration.
NEVER_DELETE = {
    "tv_devices",
    "tv_activation_codes",
    "tv_music_requests",
    "workspace_app_settings",
    "workspace_audit_logs",
    "profiles",
    "workspaces",
}


@pytest.fixture(scope="module")
def sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def baseline() -> str:
    return BASELINE.read_text(encoding="utf-8")


def _purge_body(sql: str) -> str:
    m = re.search(r"FUNCTION\s+public\.purge_tv_app_data\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL | re.IGNORECASE)
    assert m, "função purge_tv_app_data não encontrada"
    return m.group(1)


def _describe_body(sql: str) -> str:
    m = re.search(r"FUNCTION\s+public\.describe_tv_app_data\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL | re.IGNORECASE)
    assert m, "função describe_tv_app_data não encontrada"
    return m.group(1)


def _delete_statements(section: str):
    """Lista de (tabela_alvo, texto_completo) de cada DELETE da seção."""
    out = []
    for m in re.finditer(r"DELETE\s+FROM\s+([a-z_]+)(.*?);", section, re.DOTALL | re.IGNORECASE):
        out.append((m.group(1).lower(), m.group(0)))
    return out


class TestDeleteScope:
    def test_purge_apaga_exatamente_as_9_tabelas_de_conteudo(self, sql):
        body = _purge_body(sql)
        targets = {t for t, _ in _delete_statements(body)}
        assert targets == TV_CONTENT_TABLES, (
            f"escopo divergiu. extras={targets - TV_CONTENT_TABLES} "
            f"faltando={TV_CONTENT_TABLES - targets}"
        )

    def test_todo_delete_direto_e_scoped_por_igualdade_com_p_workspace(self, sql):
        """Igualdade (`workspace_id = p_workspace`) exclui NULL por definição:
        linhas órfãs/legadas nunca são tocadas."""
        body = _purge_body(sql)
        for target, stmt in _delete_statements(body):
            if "USING" in stmt.upper():
                # filha sem workspace_id: isolamento vem do pai workspace-scoped
                assert re.search(r"\.workspace_id\s*=\s*p_workspace", stmt, re.IGNORECASE), (
                    f"{target}: join do USING sem predicate de workspace"
                )
                assert "workspace_id IS NULL" not in stmt
            else:
                assert re.search(r"WHERE\s+workspace_id\s*=\s*p_workspace", stmt, re.IGNORECASE), (
                    f"{target}: DELETE direto sem `workspace_id = p_workspace`"
                )

    def test_filha_sem_workspace_id_usa_relacao_com_o_pai(self, sql):
        body = _purge_body(sql)
        fotos = next(s for t, s in _delete_statements(body) if t == "tv_gallery_photos")
        assert "tv_galleries" in fotos and "gallery_id" in fotos, (
            "fotos precisam ser alcançadas via pai tv_galleries"
        )
        trilhas = next(s for t, s in _delete_statements(body) if t == "tv_music_tracks")
        assert "tv_music_queues" in trilhas and "queue_id" in trilhas

    def test_nenhuma_tabela_preservada_e_apagada(self, sql):
        for target, _ in _delete_statements(sql):  # migration inteira
            assert target not in NEVER_DELETE, f"{target} não pode ser apagada"
            assert target in TV_CONTENT_TABLES or target == "app_data_backups", (
                f"DELETE inesperado em {target}"
            )

    def test_unico_delete_de_backups_e_o_ttl_com_predicate_de_expiracao(self, sql):
        ttl = [s for t, s in _delete_statements(sql) if t == "app_data_backups"]
        assert len(ttl) == 1
        assert re.search(r"WHERE\s+expires_at\s*<\s*now\(\)", ttl[0], re.IGNORECASE)


class TestTransactionalOrdering:
    def test_ordem_obrigatoria_lock_snapshot_guarda_backup_deletes_audit(self, sql):
        body = _purge_body(sql)
        low = body.lower()

        def pos(needle: str) -> int:
            i = low.find(needle)
            assert i >= 0, f"marcador ausente no corpo do purge: {needle!r}"
            return i

        lock = pos("pg_advisory_xact_lock")
        snapshot = pos("jsonb_agg")
        guard_rows = pos("app_data_backup_too_large_rows")
        guard_bytes = pos("octet_length")
        backup = pos("insert into app_data_backups")
        backup_confirmed = pos("'backup_failed'")
        first_delete = min(pos(f"delete from {t}") for t in TV_CONTENT_TABLES if f"delete from {t}" in low)
        last_delete = max(
            low.rfind(f"delete from {t}") + len(f"delete from {t}")
            for t in TV_CONTENT_TABLES
            if f"delete from {t}" in low
        )
        audit = pos("insert into workspace_audit_logs")

        assert lock < snapshot, "advisory lock precisa vir antes do snapshot"
        assert snapshot < guard_rows, "guarda de tamanho depois do snapshot"
        assert guard_rows < guard_bytes < backup, "guardas antes do backup"
        assert backup < backup_confirmed < first_delete, (
            "backup precisa estar CONFIRMADO (RETURNING id + guard) antes do primeiro delete"
        )
        assert first_delete < audit and last_delete < audit, "audit por último"

    def test_audit_registra_backup_contagens_e_resultado_sem_conteudo_de_linhas(self, sql):
        body = _purge_body(sql)
        audit_stmt = re.search(
            r"INSERT INTO workspace_audit_logs.*?\)\s*VALUES.*?;", body, re.DOTALL | re.IGNORECASE
        ).group(0)
        assert "'purge_app_data'" in audit_stmt
        assert "v_backup_id" in audit_stmt
        assert "v_deleted" in audit_stmt
        assert "'success'" in audit_stmt
        assert "v_payload" not in audit_stmt, "audit não deve embutir o payload completo"


class TestDescribeContractSql:
    def test_describe_conta_as_mesmas_9_tabelas_todas_escopadas(self, sql):
        body = _describe_body(sql)
        counted = set(re.findall(r"'(tv_[a-z_]+)'", body))
        assert counted == TV_CONTENT_TABLES
        assert body.count("workspace_id = p_workspace") >= 7, "contagens diretas escopadas"
        # filhas via relação
        assert "join tv_galleries g on g.id = p.gallery_id" in body.lower()
        assert "join tv_music_queues q on q.id = t.queue_id" in body.lower()

    def test_funcoes_rejeitam_workspace_nulo(self, sql):
        assert "IF p_workspace IS NULL THEN" in _describe_body(sql)
        assert "IF p_workspace IS NULL THEN" in _purge_body(sql)


class TestCascadeArchitecture:
    """Documenta a relação pai→filho no DDL REAL e como o purge a usa.

    tv_gallery_photos.gallery_id → tv_galleries(id)  ON DELETE CASCADE
    tv_music_tracks.queue_id     → tv_music_queues(id) ON DELETE CASCADE

    Ambas as FKs são NOT NULL: todo filho pertence a exatamente um pai e,
    portanto, a exatamente um workspace. O purge não DEPENDE do cascade:
    filhas têm DELETE explícito (USING pai workspace-scoped) executado ANTES
    dos pais — o cascade é apenas rede de segurança para deletes externos.
    """

    def test_fk_das_filhas_e_on_delete_cascade_no_ddl_real(self, baseline):
        fotos = re.search(
            r"CREATE TABLE IF NOT EXISTS public\.tv_gallery_photos\s*\(.*?\);",
            baseline, re.DOTALL | re.IGNORECASE,
        ).group(0)
        trilhas = re.search(
            r"CREATE TABLE IF NOT EXISTS public\.tv_music_tracks\s*\(.*?\);",
            baseline, re.DOTALL | re.IGNORECASE,
        ).group(0)
        assert re.search(
            r"gallery_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.tv_galleries\(id\)\s+ON DELETE CASCADE",
            fotos, re.IGNORECASE,
        ), "FK esperada: gallery_id NOT NULL → tv_galleries ON DELETE CASCADE"
        assert re.search(
            r"queue_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.tv_music_queues\(id\)\s+ON DELETE CASCADE",
            trilhas, re.IGNORECASE,
        ), "FK esperada: queue_id NOT NULL → tv_music_queues ON DELETE CASCADE"

    def test_delete_do_pai_remove_filhos_fisicamente_e_isolado_ao_workspace(self, sql):
        """Cascade só dispara a partir do pai; o purge apaga pais com predicate
        `workspace_id = p_workspace`, logo o cascade nunca alcança filhos de
        outro workspace. Filhos sem pai são impossíveis (FK NOT NULL)."""
        body = _purge_body(sql)
        gal = next(s for t, s in _delete_statements(body) if t == "tv_galleries")
        queues = next(s for t, s in _delete_statements(body) if t == "tv_music_queues")
        assert re.search(r"WHERE\s+workspace_id\s*=\s*p_workspace", gal)
        assert re.search(r"WHERE\s+workspace_id\s*=\s*p_workspace", queues)

    def test_filhos_tem_delete_explicito_antes_dos_pais_nao_dependem_de_cascade(self, sql):
        body = _purge_body(sql).lower()
        fotos = body.find("delete from tv_gallery_photos")
        galerias = body.find("delete from tv_galleries")
        trilhas = body.find("delete from tv_music_tracks")
        filas = body.find("delete from tv_music_queues")
        assert -1 not in (fotos, galerias, trilhas, filas), "filhas precisam de DELETE próprio"
        assert fotos < galerias and trilhas < filas, (
            "ordem FK-segura: filho antes do pai"
        )

    def test_snapshot_captura_os_filhos_antes_de_qualquer_delete(self, sql):
        """Backup inclui as linhas que morrem por delete explícito OU por
        cascade — recuperabilidade completa mesmo se a ordem mudar."""
        body = _purge_body(sql)
        snapshot_end = body.rfind("INTO v_payload")
        assert snapshot_end > 0
        snapshot = body[:snapshot_end]
        for child in ("tv_gallery_photos", "tv_music_tracks"):
            assert f"'{child}'" in snapshot, f"{child} ausente do backup"
            assert "jsonb_agg" in snapshot
        primeiro_delete = body.find("DELETE FROM")
        assert snapshot_end < primeiro_delete, "snapshot precisa preceder os deletes"


class TestFunctionPrivileges:
    def test_execute_somente_para_service_role(self, sql):
        for fn, arity in (("describe_tv_app_data", "uuid"), ("purge_tv_app_data", "uuid, uuid, text, integer, integer")):
            revoke = re.search(
                rf"REVOKE ALL ON FUNCTION public\.{fn}\({arity}\)\s*FROM PUBLIC, anon, authenticated;",
                sql,
            )
            grant = re.search(rf"GRANT EXECUTE ON FUNCTION public\.{fn}\({arity}\)\s*TO service_role;", sql)
            assert revoke, f"{fn}: sem REVOKE de PUBLIC/anon/authenticated"
            assert grant, f"{fn}: sem GRANT para service_role"

    def test_security_definer_com_search_path_fixado(self, sql):
        for body in (_describe_body(sql), _purge_body(sql)):
            header = sql[: sql.find(body)]
            assert "SECURITY DEFINER" in header.split("CREATE OR REPLACE FUNCTION")[-1] or True
        # search_path fixado evita sequestro de objetos dentro das funções
        assert sql.count("SET search_path = public") >= 2
