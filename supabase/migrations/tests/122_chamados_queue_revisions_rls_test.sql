-- Real RLS queries under authenticated, never a superuser SELECT.
-- The disposable Supabase stub does not install managed default grants.
BEGIN;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON public.profiles, public.memberships, public.roles,
  public.role_permissions, public.membership_overrides TO authenticated;

DO $test$
DECLARE
  ws_a uuid;
  ws_b uuid;
  uid_a uuid := gen_random_uuid();
  uid_other uuid := gen_random_uuid();
  membership_a uuid;
  observed uuid[];
  email_a text := uid_a::text || '@labhub-ci.test';
  email_other text := uid_other::text || '@labhub-ci.test';
BEGIN
  INSERT INTO public.workspaces(name, slug)
    VALUES ('CI RLS A', 'ci-rls-a-' || gen_random_uuid()) RETURNING id INTO ws_a;
  INSERT INTO public.workspaces(name, slug)
    VALUES ('CI RLS B', 'ci-rls-b-' || gen_random_uuid()) RETURNING id INTO ws_b;
  INSERT INTO public.chamados_queue_revisions(workspace_id)
    VALUES (ws_a), (ws_b) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO auth.users(id, email, aud, role, raw_user_meta_data)
    VALUES (uid_a, email_a, 'authenticated', 'authenticated', '{"name":"CI revision"}'),
           (uid_other, email_other, 'authenticated', 'authenticated', '{"name":"CI revision"}');
  INSERT INTO public.profiles(id, email, name, status, is_super_admin)
    VALUES (uid_a, email_a, 'CI revision', 'active', false),
           (uid_other, email_other, 'CI revision', 'active', false)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, is_super_admin = false;
  SELECT id INTO membership_a FROM public.admin_upsert_membership(uid_a, ws_a, 'tec');

  PERFORM set_config('request.jwt.claim.sub', uid_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',uid_a,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(workspace_id ORDER BY workspace_id) INTO observed
    FROM public.chamados_queue_revisions WHERE workspace_id IN (ws_a, ws_b);
  RESET ROLE;
  IF observed IS DISTINCT FROM ARRAY[ws_a] THEN
    RAISE EXCEPTION 'technician must see only own workspace: %', observed;
  END IF;

  INSERT INTO public.membership_overrides(membership_id, action, effect)
    VALUES (membership_a, 'ticket.view', 'deny');
  SET LOCAL ROLE authenticated;
  SELECT array_agg(workspace_id) INTO observed
    FROM public.chamados_queue_revisions WHERE workspace_id IN (ws_a, ws_b);
  RESET ROLE;
  IF observed IS NOT NULL THEN
    RAISE EXCEPTION 'explicit deny must suppress queue revision';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', uid_other::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',uid_other,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(workspace_id) INTO observed
    FROM public.chamados_queue_revisions WHERE workspace_id IN (ws_a, ws_b);
  RESET ROLE;
  IF observed IS NOT NULL THEN
    RAISE EXCEPTION 'user without membership must see no revision';
  END IF;
END
$test$;
ROLLBACK;
