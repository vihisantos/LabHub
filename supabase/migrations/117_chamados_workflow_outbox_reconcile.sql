-- 117_chamados_workflow_outbox_reconcile.sql
-- Recuperação DURÁVEL e limitada de pedidos de agendamento perdidos.
--
-- A criação do chamado não pode depender de uma segunda gravação remota: se a
-- RPC da outbox 115 falhar por indisponibilidade temporária, o chamado existe
-- mas não tem pedido de agendamento. Este par de RPCs permite que o dispatcher
-- recupere essa situação depois, com:
--   * tick atômico (uma varredura a cada 15 minutos no máximo);
--   * janela configurável e limite pequeno (índice em updatedAt);
--   * dedup por chamado+ciclo já garantido pela 115 -- repetir é idempotente.
--
-- Nenhuma linha é apagada e nenhum objeto da 115/116 é recriado.

CREATE TABLE IF NOT EXISTS public.chamados_workflow_reconcile_state (
  singleton   boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_run_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz
);

INSERT INTO public.chamados_workflow_reconcile_state (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.chamados_workflow_reconcile_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados_workflow_reconcile_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_workflow_reconcile_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.chamados_workflow_reconcile_state TO service_role;

-- tick atômico: somente um dispatcher vence por janela, sem relógio local.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_reconcile_tick(
  p_interval_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ticked boolean;
BEGIN
  UPDATE public.chamados_workflow_reconcile_state
  SET last_run_at = clock_timestamp()
  WHERE singleton
    AND last_run_at <= clock_timestamp()
        - make_interval(secs => least(greatest(coalesce(p_interval_seconds, 900), 60), 86400))
  RETURNING true INTO v_ticked;

  RETURN coalesce(v_ticked, false);
END;
$$;

-- Candidatos elegíveis recentes, ordenados pelo índice e limitados no banco.
-- O hash do ciclo é calculado na aplicação, com a mesma normalização da
-- criação do chamado, e gravado pela RPC dedup da migration 115.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_reconcile_candidates(
  p_lookback_minutes integer DEFAULT 1440,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  ticket_id uuid,
  workspace_id uuid,
  status text,
  assigned_to_user_id text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.id,
         t."workspace_id",
         t.status,
         coalesce(t."assignedToUserId", ''),
         t."updatedAt"
  FROM public.chamados_tickets AS t
  WHERE t.status = 'aberto'
    AND coalesce(t."assignedToUserId", '') = ''
    AND t."updatedAt" >= clock_timestamp()
        - make_interval(mins => least(greatest(coalesce(p_lookback_minutes, 1440), 1), 10080))
  ORDER BY t."updatedAt" DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_reconcile_tick(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_reconcile_candidates(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_reconcile_tick(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_reconcile_candidates(integer, integer)
  TO service_role;
