-- Per-workspace reconciliation marker; no ticket payload is exposed.
-- Updated in the same transaction as ticket writes, including direct SQL.
CREATE TABLE public.chamados_queue_revisions (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE public.chamados_queue_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_queue_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chamados_queue_revisions TO authenticated;

-- Same authorization predicate as private ticket invalidation (migration 121).
CREATE POLICY chamados_queue_revision_read
ON public.chamados_queue_revisions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.status = 'active'
      AND (
        p.is_super_admin OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.profile_id = p.id AND m.status = 'active'
            AND m.workspace_id = chamados_queue_revisions.workspace_id
            AND (
              EXISTS (SELECT 1 FROM public.role_permissions rp
                      WHERE rp.role_id = m.role_id AND rp.action = 'ticket.view')
              OR EXISTS (SELECT 1 FROM public.membership_overrides mo
                         WHERE mo.membership_id = m.id AND mo.action = 'ticket.view'
                           AND mo.effect = 'allow')
            )
            AND NOT EXISTS (SELECT 1 FROM public.membership_overrides mo
                            WHERE mo.membership_id = m.id AND mo.action = 'ticket.view'
                              AND mo.effect = 'deny')
        )
      )
  )
);

CREATE FUNCTION public.chamados_bump_queue_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $body$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.workspace_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.workspace_id; END IF;

  -- Both workspaces change on transfer. Order locks consistently.
  -- If the workspace itself is being deleted, skip its cascading deletes.
  INSERT INTO public.chamados_queue_revisions(workspace_id, revision)
  SELECT w.id, pg_catalog.gen_random_uuid()
  FROM public.workspaces w
  WHERE w.id IN (v_old, v_new)
  ORDER BY w.id
  ON CONFLICT (workspace_id) DO UPDATE SET revision = EXCLUDED.revision;
  RETURN NULL;
END;
$body$;
REVOKE ALL ON FUNCTION public.chamados_bump_queue_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER chamados_queue_revision_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.chamados_tickets
FOR EACH ROW EXECUTE FUNCTION public.chamados_bump_queue_revision();

INSERT INTO public.chamados_queue_revisions(workspace_id)
SELECT id FROM public.workspaces ON CONFLICT (workspace_id) DO NOTHING;
