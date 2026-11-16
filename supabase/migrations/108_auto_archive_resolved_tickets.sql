-- Issue #472 — fechamento automático de chamados resolvidos após 30 minutos.
-- A transição e o evento de timeline são atômicos; chamadas concorrentes não
-- duplicam o fechamento nem o evento (FOR UPDATE SKIP LOCKED).

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_archive_resolved_tickets(
  p_workspace_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  "ticketNumber" integer,
  "roomName" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT t.id
    FROM public.chamados_tickets AS t
    WHERE t.status = 'resolvido'
      AND t."resolvedAt" IS NOT NULL
      AND t."resolvedAt" <= (clock_timestamp() - INTERVAL '30 minutes')
      AND t.archived IS DISTINCT FROM TRUE
      AND (p_workspace_ids IS NULL OR t.workspace_id = ANY(p_workspace_ids))
    ORDER BY t."resolvedAt", t.id
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.chamados_tickets AS t
    SET
      status = 'fechado',
      archived = TRUE,
      "closedAt" = clock_timestamp(),
      "closedBy" = 'Sistema',
      "statusNote" = '',
      "updatedAt" = clock_timestamp()
    FROM candidates AS c
    WHERE t.id = c.id
      AND t.status = 'resolvido'
      AND t.archived IS DISTINCT FROM TRUE
    RETURNING t.id, t.workspace_id, t."ticketNumber", t."roomName"
  ),
  events AS (
    INSERT INTO public.ticket_events (
      "ticket_id", "workspace_id", type, content, author, "newStatus"
    )
    SELECT
      u.id,
      u.workspace_id,
      'status',
      'Arquivado pelo sistema',
      'Sistema',
      'fechado'
    FROM updated AS u
    RETURNING "ticket_id"
  )
  SELECT u.id, u.workspace_id, u."ticketNumber", u."roomName"
  FROM updated AS u
  INNER JOIN events AS e ON e."ticket_id" = u.id;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_archive_resolved_tickets(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_archive_resolved_tickets(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_resolved_tickets(uuid[]) TO service_role;

COMMIT;
