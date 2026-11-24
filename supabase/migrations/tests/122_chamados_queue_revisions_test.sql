-- Executed against disposable PostgreSQL by ci_migration_suite.py.
BEGIN;
DO $test$
DECLARE
  ws_a uuid;
  ws_b uuid;
  ticket uuid;
  rev_a uuid;
  rev_b uuid;
  rev_next uuid;
BEGIN
  IF has_table_privilege('anon', 'public.chamados_queue_revisions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chamados_queue_revisions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.chamados_queue_revisions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.chamados_queue_revisions', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.chamados_queue_revisions', 'SELECT')
  THEN
    RAISE EXCEPTION 'queue revision grants are unsafe';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chamados_queue_revisions'::regclass) THEN
    RAISE EXCEPTION 'queue revision RLS disabled';
  END IF;
  IF has_function_privilege('authenticated', 'public.chamados_bump_queue_revision()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute revision trigger directly';
  END IF;

  INSERT INTO public.workspaces(name, slug)
    VALUES ('CI revision A', 'ci-revision-a-' || gen_random_uuid()) RETURNING id INTO ws_a;
  INSERT INTO public.workspaces(name, slug)
    VALUES ('CI revision B', 'ci-revision-b-' || gen_random_uuid()) RETURNING id INTO ws_b;
  INSERT INTO public.chamados_queue_revisions(workspace_id) VALUES (ws_a), (ws_b)
    ON CONFLICT (workspace_id) DO NOTHING;
  SELECT revision INTO rev_a FROM public.chamados_queue_revisions WHERE workspace_id = ws_a;
  SELECT revision INTO rev_b FROM public.chamados_queue_revisions WHERE workspace_id = ws_b;

  INSERT INTO public.chamados_tickets(workspace_id, status, "ticketNumber", "roomName")
    VALUES (ws_a, 'resolvido', 987654, 'CI revision') RETURNING id INTO ticket;
  SELECT revision INTO rev_next FROM public.chamados_queue_revisions WHERE workspace_id = ws_a;
  IF rev_next IS NULL OR rev_next IS NOT DISTINCT FROM rev_a THEN
    RAISE EXCEPTION 'INSERT did not change revision';
  END IF;
  rev_a := rev_next;

  UPDATE public.chamados_tickets SET "roomName" = 'CI revision updated' WHERE id = ticket;
  SELECT revision INTO rev_next FROM public.chamados_queue_revisions WHERE workspace_id = ws_a;
  IF rev_next IS NOT DISTINCT FROM rev_a THEN
    RAISE EXCEPTION 'UPDATE did not change revision';
  END IF;
  rev_a := rev_next;

  DELETE FROM public.chamados_tickets WHERE id = ticket;
  SELECT revision INTO rev_next FROM public.chamados_queue_revisions WHERE workspace_id = ws_a;
  IF rev_next IS NOT DISTINCT FROM rev_a THEN
    RAISE EXCEPTION 'DELETE did not change revision';
  END IF;
  IF (SELECT revision FROM public.chamados_queue_revisions WHERE workspace_id = ws_b) IS DISTINCT FROM rev_b THEN
    RAISE EXCEPTION 'unrelated workspace revision changed';
  END IF;
END
$test$;
ROLLBACK;
