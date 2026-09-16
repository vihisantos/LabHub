-- ===============================================================================
-- 063 — RESOLVER DE CONTEUDO NA TV
-- ===============================================================================
-- Autoridade: o SERVIDOR decide QUEM ve o QUE e QUANDO. O Desktop NUNCA mais
-- escolhe "qual conteudo exibir" — ele apenas pergunta:
--   SELECT public.tv_resolve_scheduled_content(workspace, device, date);
--
-- Contrato (aprovado):
--   (workspace_id, device_id, date)  ->  0 ou 1 registro (jsonb) | NULL
--
-- Precedencia (deterministica, EXAUSTIVA nesta ordem):
--   [1] PROGRAMACAO NOVA (tv_schedules) aplicavel  -> vence, origin='scheduled'
--   [2] se nenhuma nova aplicavel -> FALLBACK LEGADO (tv_events), origin='legacy'
--   [3] nenhum conteudo -> NULL (0 linhas, SEM erro)
--
-- Regras de resolucao (12 cenarios do briefing; read-only por construcao):
--   * workspace_id, device_id e date: sempre os de entrada (contexto isolado).
--   * Nova: usa starts_on/ends_on (intervalo) + schedule_mode (every_day OU
--     specific_days via tv_schedule_days.date) + target_scope (all OU specific
--     via tv_schedule_targets.device_id).
--   * Precedencia entre varias novas: sort_order DESC, starts_on ASC, id ASC
--     (decidido: MAIOR sort_order primeiro; desempate deterministico).
--   * Fallback legado: workspace_id igual + is_active + range de data
--     (start_date..end_date) + (device_id IS NULL [=TODAS as TVs do workspace]
--     OU device_id = p_device_id). Precedencia legado: sort_order DESC,
--     start_date ASC, id ASC.
--   * Nunca: legado de outro workspace/device atravessa isolamento.
--   * Nunca: repete o MESMO event (0..1 registro resolve o no-duplicate).
--
-- Seguranca:
--   * SECURITY INVOKER + SET search_path = public (NAO definer):
--       - e LEITURA pura de tabelas com RLS (tv_schedules, tv_schedule_days,
--         tv_schedule_targets, tv_events, tv_devices), todas com policy SELECT
--         gated por can_access_tv_workspace(workspace_id).
--       - portanto as policies executam com a role do CHAMADOR -> isolamento
--         natural, SEM elevacao de privilegio, SEM risco de search_path.
--       - o gate can_access_tv_workspace(p_workspace_id) + pertenca do device
--         sao aplicados EXPLICITAMENTE (defesa em profundidade, mesmo o RLS
--         ja filtrando).
--   * NOTA DE CONSISTENCIA: as RPCs de MUTACAO (tv_schedule_upsert/delete, 062)
--     sao SECURITY DEFINER porque precisam BURLAR o RLS-de-escritas (policy
--     write ausente por design). O resolver NAO referencia/station/roles de
--     escrita — nada de definer aqui.
-- ===============================================================================

-- ===============================================================================
-- 1) tv_resolve_scheduled_content
-- ===============================================================================
CREATE OR REPLACE FUNCTION public.tv_resolve_scheduled_content(
  p_workspace_id uuid,
  p_device_id    uuid,
  p_date         date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event_id  uuid;
  v_schedule  uuid;
  v_origin    text;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Guarda 0: entradas obrigatorias (sem NULL -> 0 linhas, sem erro indevido)
  -- ---------------------------------------------------------------------------
  IF p_workspace_id IS NULL OR p_device_id IS NULL OR p_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Guarda 1: gate de LEITURA do workspace (canonico; callable p/ authenticated)
  --   Sem acesso -> NULL. Nunca estoura vazamento (a role do chamador nao
  --   enxerga linhas de outro workspace por RLS de qualquer forma).
  -- ---------------------------------------------------------------------------
  IF NOT public.can_access_tv_workspace(p_workspace_id) THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Guarda 2: isolamento do device — o device DEVE pertencer ao workspace de
  --   entrada e ser visivel ao chamador. (RLS em tv_devices ja filtra; o
  --   predicado workspace_id aqui garante nao-atravessamento de isolamento.)
  -- ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.tv_devices d
     WHERE d.id = p_device_id
       AND d.workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- [1] PROGRAMACAO NOVA (precedencia absoluta)
  -- ---------------------------------------------------------------------------
  SELECT s.event_id, s.id
    INTO v_event_id, v_schedule
    FROM public.tv_schedules s
   WHERE s.workspace_id = p_workspace_id
     AND s.is_active
     AND s.starts_on <= p_date
     AND s.ends_on   >= p_date
     AND (
          s.schedule_mode = 'every_day'
          OR EXISTS (
              SELECT 1 FROM public.tv_schedule_days d
               WHERE d.schedule_id = s.id
                 AND d.date = p_date
          )
     )
     AND (
          s.target_scope = 'all'
          OR EXISTS (
              SELECT 1 FROM public.tv_schedule_targets t
               WHERE t.schedule_id = s.id
                 AND t.device_id = p_device_id
          )
     )
   ORDER BY s.sort_order DESC, s.starts_on ASC, s.id ASC
   LIMIT 1;

  IF FOUND THEN
    v_origin := 'scheduled';
    RETURN jsonb_build_object(
      'event_id',     v_event_id,
      'schedule_id',  v_schedule,
      'workspace_id', p_workspace_id,
      'device_id',    p_device_id,
      'date',         p_date,
      'origin',       v_origin
    );
  END IF;

  -- ---------------------------------------------------------------------------
  -- [2] FALLBACK LEGADO (somente quando NENHUMA nova schedule se aplica)
  --   * device_id IS NULL  = TODAS as TVs do workspace (decidido)
  --   * device_id = p_device_id = a TV especifica
  --   * preenchido APENAS por tv_events do MESMO workspace (isolation)
  -- ---------------------------------------------------------------------------
  SELECT e.id
    INTO v_event_id
    FROM public.tv_events e
   WHERE e.workspace_id = p_workspace_id
     AND e.is_active
     AND p_date BETWEEN e.start_date::date AND e.end_date::date
     AND ( e.device_id IS NULL OR e.device_id = p_device_id )
   ORDER BY e.sort_order DESC, e.start_date ASC, e.id ASC
   LIMIT 1;

  IF FOUND THEN
    v_origin := 'legacy';
    RETURN jsonb_build_object(
      'event_id',     v_event_id,
      'schedule_id',  NULL,
      'workspace_id', p_workspace_id,
      'device_id',    p_device_id,
      'date',         p_date,
      'origin',       v_origin
    );
  END IF;

  -- ---------------------------------------------------------------------------
  -- [3] Nenhum conteudo aplicavel -> 0 linhas, SEM erro.
  -- ---------------------------------------------------------------------------
  RETURN NULL;
END;
$$;

-- ===============================================================================
-- 2) Exposicao (somente READ path: EXECUTE p/ authenticated; public = nada)
-- ===============================================================================
REVOKE ALL ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date) TO authenticated;

-- ===============================================================================
-- VERIFICACAO POS-MIGRATION (documentacao; tambem em auditoria read-only):
--   SELECT public.tv_resolve_scheduled_content(:ws, :device, '2026-09-15');
--   12 cenarios validados na fase F — resolucao deterministica, 0..1 row.
-- ===============================================================================
