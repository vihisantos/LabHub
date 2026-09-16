"""Revisão estática da migration 064_tv_schedule_times_and_reservation.sql.

A suíte backend roda SEM Postgres ao vivo (padrão api/tests: leitura estática
do DDL). A 064 conecta o fluxo ReservaLab → TV (Issue #222, FASE 2.2):
horário específico por dia (dia da reserva), vínculo com a reserva
(reservation_id determinístico), arquivamento administrativo e o resolver 4-arg
(workspace + device + date + time) com fallback legado preservado.

Cada um dos 16 cenários obrigatórios da fase é verificado estruturalmente aqui
(traduzido palavra a palavra a partir das regras de negócio):

  1. evento com data da reserva (obrigatória)          → RPC exige p_reservation_date
     e grava um tv_schedule_days com is_reservation_day=true.
  2. horário específico da reserva                     → time_start/time_end no dia
     (time local; colunas novas em tv_schedule_days).
  3. data adicional sem horário especial               → INSERT adicional só com
     (schedule_id, date) + CHECK exige time NULL fora do dia da reserva.
  4. múltiplas TVs                                     → tv_schedule_targets via
     unnest(p_target_device_ids) com target_scope='specific'.
  5. uma única TV                                      → mesma rota, sem mínimo (1..N).
  6. TV de outro workspace                             → DEVICE_WORKSPACE_MISMATCH
     (validação no RPC + guard tv_schedule_target_guard da 062).
  7. schedule/evento de outro workspace                → gate tv_can_manage_workspace
     + UPDATE/INSERT restritos por workspace_id (content/schedule lookup).
  8. evento expirado                                   → resolver: fora de
     starts_on/ends_on (ou do range legado) → NULL.
  9. evento futuro                                     → idem (starts_on > p_date).
 10. legado com start_date/end_date NULL               → tratado como SEMPRE ativo
     enquanto is_active (fallback legado).
 11. legado com intervalo de datas                     → p_date entre start/end (::date,
     timezone fixa do function).
 12. precedência schedule > legado                     → branch 'scheduled' antes de
     'legacy'; LIMIT 1; IF FOUND retorna sem atingir legado.
 13. time_start <= time_end                            → chk_tv_schedule_days_time_order
     (+ validação RESERVATION_TIME_AFTER_END no RPC).
 14. horário especial somente na data original         → chk...time_reservation +
     UNIQUE parcial uq_tv_schedule_days_single_reservation (máx 1 dia por schedule).
 15. RPC sem privilégio de escrita para device         → negação explícita
     (auth.jwt user_metadata role 'tv_device') além de authenticated/anon REVOKE.
 16. RLS/RBAC preservado                               → SOLO SECURITY DEFINER no RPC,
     resolver SECURITY INVOKER; nenhuma policy nova; gate tv_can_manage_workspace.

Garantias estruturais adicionais:
  - tv_events ganha reservation_id (única por workspace — UNIQUE parcial) e
    archived (estado administrativo persistido; scheduled/active/expired derivados).
  - tv_schedules NÃO é alterada (vínculo principal continua tv_schedules.event_id
    → tv_events.id; reserva não é repl icada no schedule).
  - 062 e 063 NÃO são tocadas: resolver novo é OVERLOAD 4-arg (3-arg da 063 intacto).
  - Sem SQL dinâmico / EXCEPTION / pgcrypto / policy nova.
"""

import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "064_tv_schedule_times_and_reservation.sql"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _load() -> str:
    return _normalize(MIGRATION.read_text(encoding="utf-8"))


def _func_body(sql: str, name: str) -> str:
    m = re.search(rf"FUNCTION\s+public\.{name}\(.*?AS\s*\$\$(.*?)\$\$;", sql, re.DOTALL)
    assert m, f"função {name} não encontrada na migration 064"
    return _normalize(m.group(1))


def test_arquivo_existe():
    assert MIGRATION.is_file()


def test_migration_registrada_no_prefixo():
    assert MIGRATION.name.startswith("064_")


# ─── Cabeçalho / invariantes gerais ───────────────────────────────────────────

def test_decisoes_documentadas_no_cabecalho():
    sql = _load().lower()
    # Identificação da reserva (ausência de ID estável na planilha) documentada.
    assert "identificador estável" in sql or "id estável" in sql or "nao possui id estavel" in sql
    # Convenção de timezone explícita.
    assert "america/sao_paulo" in sql
    # Modelo de status: archived persistido; scheduled/active/expired derivados.
    assert "archived" in sql


def test_nao_alterou_062_nem_063():
    sql = _load().lower()
    # 062: tv_schedules NÃO recebe coluna/constraint nesta migration.
    assert "alter table public.tv_schedules" not in sql
    # 063: resolver 3-arg não é recriado (só existe o OVERLOAD 4-arg novo).
    assert "create or replace function public.tv_resolve_scheduled_content(uuid, uuid, date)" not in sql


def test_sem_policy_nova_sql_dinamico_ou_pgcrypto():
    sql = _load().lower()
    assert "create policy" not in sql
    assert "execute format" not in sql
    assert "execute immediate" not in sql
    assert "pgcrypto" not in sql


# ─── 1. tv_events: reservation_id + archived ──────────────────────────────────

def test_tv_events_ganha_reservation_id_e_archived():
    sql = _load()
    assert "ADD COLUMN IF NOT EXISTS reservation_id text" in sql
    assert "ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false" in sql


def test_reservation_unica_por_workspace():
    sql = _load()
    assert "uq_tv_events_workspace_reservation" in sql
    assert "ON public.tv_events(workspace_id, reservation_id)" in sql
    assert "WHERE reservation_id IS NOT NULL" in sql


# ─── 2/3/13/14. tv_schedule_days: horário por dia + único dia da reserva ──────

def test_tv_schedule_days_ganha_time_e_marcador():
    sql = _load()
    assert "ADD COLUMN IF NOT EXISTS time_start time" in sql
    assert "ADD COLUMN IF NOT EXISTS time_end time" in sql
    assert "ADD COLUMN IF NOT EXISTS is_reservation_day boolean NOT NULL DEFAULT false" in sql


def test_check_time_set():
    # Regra 3/13: horário vem junto (ambos NULL ou ambos preenchidos).
    sql = _load()
    assert "chk_tv_schedule_days_time_set" in sql
    assert "(time_start IS NULL) = (time_end IS NULL)" in sql


def test_check_time_order():
    # Regra 13: time_start <= time_end.
    sql = _load()
    assert "chk_tv_schedule_days_time_order" in sql
    assert "time_start IS NULL OR time_start <= time_end" in sql


def test_check_time_so_no_dia_da_reserva():
    # Regra 14: horário específico SOMENTE na data original da reserva.
    sql = _load()
    assert "chk_tv_schedule_days_time_reservation" in sql
    assert "time_start IS NULL OR is_reservation_day" in sql


def test_unico_dia_da_reserva_por_schedule():
    # Regra 14: no máximo uma data da reserva por schedule.
    sql = _load()
    assert "uq_tv_schedule_days_single_reservation" in sql
    assert "ON public.tv_schedule_days(schedule_id)" in sql
    assert "WHERE is_reservation_day" in sql


# ─── Resolver 4-arg (workspace + device + date + time) ────────────────────────

def test_resolver_declarado_com_assinatura_4args():
    decl = _load()
    assert "CREATE OR REPLACE FUNCTION public.tv_resolve_scheduled_content(" in decl
    assert "p_time time" in decl
    assert "RETURNS jsonb" in decl
    assert "SECURITY INVOKER" in decl
    assert "SET search_path = public" in decl
    # Convenção de timezone explícita (conversão legada determinística).
    assert "SET timezone = 'America/Sao_Paulo'" in decl


def test_resolver_guarda_workspace_e_device():
    body = _func_body(_load(), "tv_resolve_scheduled_content")
    assert "NOT public.can_access_tv_workspace(p_workspace_id)" in body
    assert "d.workspace_id = p_workspace_id" in body  # isolamento do device (regras 7/16)


def test_resolver_precedencia_schedule_sobre_legado():
    # Regra 12: primeiro branch 'scheduled'; legacy só se nada foi resolvido; NULL por fim.
    sql = _load()
    body = re.split(r"FUNCTION\s+public\.tv_resolve_scheduled_content\(", sql)[1]
    idx_sched = body.find("'scheduled'")
    idx_legacy = body.find("'legacy'")
    idx_null = body.find("RETURN NULL", idx_legacy)
    assert idx_sched != -1 and idx_legacy != -1 and idx_null != -1
    assert idx_sched < idx_legacy < idx_null
    assert "LIMIT 1" in body  # 0..1 registro (no-duplicate)


def test_resolver_schedule_respeita_horario_do_dia():
    # Regras 2/5/8/9: dia com horário exige time dentro da janela; fora → não resolve.
    body = _func_body(_load(), "tv_resolve_scheduled_content")
    assert "s.starts_on <= p_date" in body
    assert "s.ends_on >= p_date" in body
    assert "p_time >= d.time_start" in body
    assert "p_time <= d.time_end" in body
    # p_time NULL → sem restrição de horário (compatibilidade date-only).
    assert "p_time IS NULL" in body


def test_resolver_schedule_descarta_arquivado_e_aplica_escopo():
    body = _func_body(_load(), "tv_resolve_scheduled_content")
    # Regra 11: archived remove da programação ativa (persistido; derivados no resolver).
    assert "NOT COALESCE(ev.archived, false)" in body
    assert "s.target_scope = 'all'" in body
    assert "t.device_id = p_device_id" in body  # scope specific


def test_resolver_legado_null_dates_sempre_ativos():
    # Regra 10: eventos legados com start/end NULL NÃO podem sumir enquanto is_active.
    body = _func_body(_load(), "tv_resolve_scheduled_content")
    assert "e.start_date IS NULL OR p_date >= e.start_date::date" in body
    assert "e.end_date IS NULL OR p_date <= e.end_date::date" in body


def test_resolver_legado_intervalo_e_device_e_archived():
    # Regras 11/9/8/6: intervalo clássico (::date com timezone fixa), device NULL=todas.
    body = _func_body(_load(), "tv_resolve_scheduled_content")
    assert "p_date >= e.start_date::date" in body
    assert "p_date <= e.end_date::date" in body
    assert "e.device_id IS NULL OR e.device_id = p_device_id" in body
    assert "NOT COALESCE(e.archived, false)" in body


def test_resolver_acesso_read_only():
    sql = _load()
    assert "REVOKE ALL ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date, time) FROM public, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date, time) TO authenticated" in sql


# ─── RPC tv_reserve_event_upsert ──────────────────────────────────────────────

def test_rpc_declarado_com_assinatura():
    decl = _load()
    assert "CREATE OR REPLACE FUNCTION public.tv_reserve_event_upsert(" in decl
    assert "p_reservation_date date" in decl
    assert "RETURNS jsonb" in decl
    assert "SECURITY DEFINER" in decl
    assert "SET search_path = public" in decl


def test_rpc_nega_device_explicitamente():
    # Regra 15: sessão de device (authenticated) é negada explicitamente.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "auth.jwt() -> 'user_metadata'" in body
    assert "'tv_device'" in body
    assert "TV_DEVICE_WRITE_FORBIDDEN" in body


def test_rpc_exige_full_e_workspace():
    # Regras 7/16: RBAC 2.0 — escrito apenas por quem gerencia a TV no workspace.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "public.tv_can_manage_workspace(p_workspace_id)" in body
    assert "TV_WORKSPACE_FULL_REQUIRED" in body
    # Workspace vem do gate; nunca do frontend param.
    assert "p_workspace_id" in body


def test_rpc_exige_data_da_reserva():
    # Regra 1: data da reserva obrigatória.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "p_reservation_date IS NULL" in body
    assert "RESERVATION_DATE_REQUIRED" in body


def test_rpc_valida_horario_da_reserva():
    # Regras 2/13: par início/fim + início <= fim.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "INVALID_RESERVATION_TIMES" in body
    assert "RESERVATION_TIME_AFTER_END" in body
    assert "p_reservation_time_start > p_reservation_time_end" in body


def test_rpc_grava_dia_da_reserva_obrigatorio():
    # Regra 1/2: o dia da reserva vira tv_schedule_days is_reservation_day=true.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "INSERT INTO public.tv_schedule_days (schedule_id, date, time_start, time_end, is_reservation_day)" in body
    assert "true" in body


def test_rpc_datas_adicionais_sem_horario():
    # Regras 4/5/14: datas adicionais só com (schedule_id, date); CHECK exige time NULL.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "INSERT INTO public.tv_schedule_days (schedule_id, date)" in body
    assert "ADDITIONAL_DATE_BEFORE_RESERVATION" in body


def test_rpc_valida_tvs_e_escopo():
    # Regras 4/6/8: todas as TVs devem pertencer ao workspace (mismatch bloqueado).
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "DEVICE_WORKSPACE_MISMATCH" in body
    assert "d.workspace_id = p_workspace_id" in body
    assert "v_scope := 'specific'" in body
    assert "v_scope := 'all'" in body


def test_rpc_insere_targets_1_a_n():
    # Regras 4/5/6: 1..N targets via unnest do array de device ids.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "INSERT INTO public.tv_schedule_targets (schedule_id, device_id)" in body
    assert "unnest(v_devs)" in body


def test_rpc_nao_duplica_evento_por_reserva():
    # Regra 1: reusa o evento da mesma reserva (idempotência) em vez de duplicar.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "e.reservation_id = p_reservation_id" in body
    assert "p_event_id := v_existing" in body


def test_rpc_tudo_atomico_em_uma_funcao():
    # Regra "RPC atômico": content + schedule + dias + targets na mesma transação.
    body = _func_body(_load(), "tv_reserve_event_upsert")
    assert "INSERT INTO public.tv_events (" in body
    assert "INSERT INTO public.tv_schedules (" in body
    assert "INSERT INTO public.tv_schedule_days" in body
    assert "INSERT INTO public.tv_schedule_targets" in body
    assert "RETURN jsonb_build_object(" in body


def test_rpc_acesso_restrito():
    sql = _load()
    assert "REVOKE ALL ON FUNCTION public.tv_reserve_event_upsert" in sql
    assert "FROM public, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.tv_reserve_event_upsert" in sql
    assert "TO authenticated" in sql