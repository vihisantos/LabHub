-- =============================================================================
-- tests/078_rbac2_tablet_cancel.sql
-- =============================================================================
-- #296 (PR-4D-A) — `user_can_cancel_tablet_reservation(uuid)` autoriza por
-- RBAC 2.0 (membership ativa + role_permissions `reservelab.tablet.cancel`
-- @workspace) e NÃO mais por `profiles.app_access->>'reservalab' = 'full'`.
--
-- Harness comportamental (mesmo dos harnesses 049/065-071/077 e do stub do
-- Migrations CI, `scripts/ci/supabase_stub_bootstrap.sql:81`):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   · escritas de campo privilegiado em `profiles` (app_access) são feitas com
--     `auth.uid()` nulo — contexto confiável, que a guarda da 067 aceita
--     explicitamente (067:70-72);
--   · memberships são inseridas sem `managed_by` (a guarda da 045 retorna
--     imediatamente nesse caso).
--
--  1. helper existe com a assinatura `ws_id uuid`;
--  2. `SECURITY DEFINER` + `search_path` travado + `STABLE` preservados;
--  3. super admin NÃO é tratado dentro da helper (invariante de policies);
--  4. estrutura RBAC 2.0 completa e fail-closed;
--  5. `profiles.app_access` e `profiles.role` NÃO são consultados (e o profile
--     NÃO é lido);
--  6. Action `reservelab.tablet.cancel`@workspace semeada em `tec` e em
--     nenhuma outra role; `reservelab.tablet.reserve` segue com `tec`
--     (coerência do par opera reserva/cancela);
--  7. policy `tablet_reservations_update` continua delegando na helper,
--     mantendo `is_super_admin()` e `user_belongs_to_workspace` (não reescrita);
--  8. COMPORTAMENTAL: sem membership/DENY · membership ativa+Action/ALLOW ·
--     outra unidade/DENY (isolamento) · membership inativa/DENY · role sem a
--     Action/DENY · `app_access.reservalab='full'` sem Action/DENY ·
--     `app_access` 'full' com Action/ALLOW · workspace nulo/DENY ·
--     outro caller sem membership/DENY.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 078 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 078 can_cancel_tablet_reservation RBAC 2.0 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_helper  text;
  v_tec     uuid;
  v_vis     uuid;
  v_wsa     uuid;
  v_wsb     uuid;
  v_uid     uuid;
  v_out     boolean;
BEGIN

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 1 — ESTRUTURAL / CATÁLOGO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Helper existe com a assinatura preservada ─────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_can_cancel_tablet_reservation'
  AND pg_get_function_identity_arguments(p.oid) = 'ws_id uuid';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation(ws_id uuid) must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_helper
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'user_can_cancel_tablet_reservation';

-- ── 2. SECURITY DEFINER + search_path travado (invariante 044/049/050/059) ───
IF v_helper NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation must be SECURITY DEFINER';
END IF;
IF v_helper NOT LIKE '%SET search_path = public%'
   AND v_helper NOT LIKE '%SET search_path TO %public%' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation must pin search_path=public';
END IF;

-- ── 3. Super admin NÃO é tratado dentro da helper ────────────────────────────
IF v_helper LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: super admin bypass must stay in the policies, not inside user_can_cancel_tablet_reservation';
END IF;

-- ── 4. Estrutura RBAC 2.0 + fail-closed ─────────────────────────────────────
IF v_helper NOT LIKE '%public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: helper must read public.memberships';
END IF;
IF v_helper NOT LIKE '%public.role_permissions%' THEN
  RAISE EXCEPTION 'FAIL: helper must read public.role_permissions';
END IF;
IF v_helper NOT LIKE '%rp.role_id = m.role_id%' THEN
  RAISE EXCEPTION 'FAIL: role_permissions must be joined through memberships.role_id';
END IF;
IF v_helper NOT LIKE '%m.profile_id = auth.uid()%' THEN
  RAISE EXCEPTION 'FAIL: membership must be resolved for the caller (auth.uid())';
END IF;
IF v_helper NOT LIKE '%m.workspace_id = ws_id%' THEN
  RAISE EXCEPTION 'FAIL: membership must be bound to the evaluated workspace (ws_id)';
END IF;
IF v_helper NOT LIKE '%m.status = ''active''%' AND v_helper NOT LIKE '%m.status=''active''%' THEN
  RAISE EXCEPTION 'FAIL: only an ACTIVE membership may grant tablet cancellation';
END IF;
IF v_helper NOT LIKE '%reservelab.tablet.cancel%' THEN
  RAISE EXCEPTION 'FAIL: helper must resolve the Action reservelab.tablet.cancel';
END IF;
IF v_helper NOT LIKE '%scope = ''workspace''%' AND v_helper NOT LIKE '%scope=''workspace''%' THEN
  RAISE EXCEPTION 'FAIL: Action must be resolved at scope workspace';
END IF;
IF v_helper NOT LIKE '%ws_id IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: helper must be fail-closed for a NULL workspace';
END IF;
-- Fail-closed estrutural: a helper NÃO pode ter ramo permissivo além do EXISTS.
IF v_helper LIKE '%COALESCE(%app_access%' OR v_helper LIKE '%OR EXISTS%' THEN
  RAISE EXCEPTION 'FAIL: helper must be a single fail-closed EXISTS (no permissive OR branch)';
END IF;

-- ── 5. A autoridade legada NÃO é mais consultada ─────────────────────────────
IF v_helper LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: helper must not authorize via profiles.app_access';
END IF;
IF v_helper LIKE '%public.profiles%' THEN
  RAISE EXCEPTION 'FAIL: helper must not read public.profiles at all after PR-4D-A';
END IF;
IF v_helper LIKE '%profiles.role%'
   OR v_helper ~ '(^|[^a-zA-Z0-9_])(p|pr)\.role([^a-zA-Z0-9_]|$)'
   OR v_helper LIKE '%role = ''admin''%' THEN
  RAISE EXCEPTION 'FAIL: helper must not authorize via profiles.role';
END IF;
-- Guarda do próprio regex: `rp.role_id` NÃO pode ser lido como profiles.role.
IF v_helper LIKE '%rp.role_id%'
   AND v_helper ~ '(^|[^a-zA-Z0-9_])p\.role([^a-zA-Z0-9_]|$)' THEN
  RAISE EXCEPTION 'FAIL: boundary regex matches rp.role_id (false positive)';
END IF;

-- ── 6. Action semeada: tec, e apenas tec ─────────────────────────────────────
SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
SELECT id INTO v_vis FROM public.roles WHERE slug = 'vis';

IF v_tec IS NULL THEN
  RAISE EXCEPTION 'FAIL: role tec ausente (seeds da 036 não aplicados?)';
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_tec AND action = 'reservelab.tablet.cancel' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tec must hold exactly one reservelab.tablet.cancel@workspace (found %)', v_count;
END IF;

-- Coerência do par: tec mantém a Action de reserva (036) intacta.
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_tec AND action = 'reservelab.tablet.reserve' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tec must keep reservelab.tablet.reserve@workspace (found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'reservelab.tablet.cancel' AND r.slug <> 'tec';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: reservelab.tablet.cancel granted to roles outside tec (found %)', v_count;
END IF;

-- `reservelab.tablet.cancel` não pode colidir com scope diferente de workspace.
SELECT count(*) INTO v_count FROM public.role_permissions WHERE action = 'reservelab.tablet.cancel' AND scope <> 'workspace';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: reservelab.tablet.cancel must only exist at scope workspace (found %)', v_count;
END IF;

-- ── 7. Policy consumidora intocada ───────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update'
  AND (qual ILIKE '%user_can_cancel_tablet_reservation%' OR with_check ILIKE '%user_can_cancel_tablet_reservation%');
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update must keep delegating to user_can_cancel_tablet_reservation';
END IF;

SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update'
  AND (qual ILIKE '%is_super_admin%');
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update must keep the is_super_admin bypass';
END IF;

SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update'
  AND (qual ILIKE '%user_belongs_to_workspace%');
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update must keep the workspace membership check';
END IF;

-- ACL da helper preservada (050:86-90).
IF NOT EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_cancel_tablet_reservation'
    AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: authenticated must hold EXECUTE on user_can_cancel_tablet_reservation';
END IF;
IF EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_cancel_tablet_reservation'
    AND g.grantee = 'anon' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: anon must NOT execute user_can_cancel_tablet_reservation';
END IF;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 2 — COMPORTAMENTAL (caller simulado via request.jwt.claim.sub)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Fixtures: um usuário real (auth.users → profile pending) e duas unidades.
INSERT INTO public.workspaces (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777771', '078 Tablet WS A', 'ws078-a')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsa FROM public.workspaces WHERE slug = 'ws078-a';

INSERT INTO public.workspaces (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777772', '078 Tablet WS B', 'ws078-b')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsb FROM public.workspaces WHERE slug = 'ws078-b';

IF v_wsa IS NULL OR v_wsb IS NULL OR v_wsa = v_wsb THEN
  RAISE EXCEPTION 'FAIL: could not create two distinct workspaces for the isolation check';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('07777777-7777-7777-7777-777777777771',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '078-tablet@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"078 Tablet"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid FROM public.profiles WHERE email = '078-tablet@labhub.test';
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created did not create the profile for 078-tablet@labhub.test';
END IF;

-- Conta ativa (contexto confiável: a guarda da 067 aceita auth.uid() nulo).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id = v_uid;

-- Atalho para fixar o caller nos cenários abaixo.
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

-- (a) SEM membership => DENY
SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [a]: user without membership must be DENIED tablet cancellation';
END IF;

-- (b) membership ATIVA com a Action => ALLOW
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
VALUES (v_uid, v_wsa, v_tec, 'active')
ON CONFLICT (profile_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [b]: active membership with reservelab.tablet.cancel must be ALLOWED in its own workspace';
END IF;

-- (c) ISOLAMENTO — a MESMA membership não autoriza outra unidade
SELECT public.user_can_cancel_tablet_reservation(v_wsb) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [c]: membership in workspace A must NOT grant access to workspace B';
END IF;

-- (d) membership SUSPENSA => DENY (fail-closed)
UPDATE public.memberships SET status = 'suspended'
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [d]: suspended membership must be DENIED tablet cancellation';
END IF;
UPDATE public.memberships SET status = 'active'
WHERE profile_id = v_uid AND workspace_id = v_wsa;

-- (e) membership com role SEM a Action => DENY
IF v_vis IS NULL THEN
  RAISE EXCEPTION 'FAIL [e]: role vis ausente (seeds da 036)';
END IF;
UPDATE public.memberships SET role_id = v_vis
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [e]: membership whose role lacks reservelab.tablet.cancel must be DENIED';
END IF;

-- (f)/(g) app_access legado: validos ENQUANTO a coluna existir. A migration 084
-- remove a coluna (estado definitivo, coberto por tests/084), e o STEP 6 roda
-- todos os harnesses DEPOIS da cadeia completa - entao aqui a prova e omitida
-- em vez de estourar com 'column app_access does not exist'.
IF EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles'
    AND a.attname = 'app_access'
    AND a.attnum > 0
    AND NOT a.attisdropped
) THEN
  -- (f) app_access->>'reservalab' = 'full' SEM a Action => DENY (encerra a dependência)
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  UPDATE public.profiles
     SET app_access = jsonb_build_object('reservalab', 'full')
   WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
  IF v_out THEN
    RAISE EXCEPTION 'FAIL [f]: app_access->>''reservalab''=''full'' alone must NOT grant tablet cancellation (PR-4D-A)';
  END IF;

  -- (g) app_access 'full' COM a Action => ALLOW (é o RBAC 2.0 que decide)
  UPDATE public.memberships SET role_id = v_tec
  WHERE profile_id = v_uid AND workspace_id = v_wsa;
  SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
  IF NOT v_out THEN
    RAISE EXCEPTION 'FAIL [g]: active membership with reservelab.tablet.cancel must be ALLOWED even with app_access set';
  END IF;
ELSE
  RAISE NOTICE '078: public.profiles.app_access nao existe (084 aplicada) - casos (f)/(g) do override legado omitidos; a prova definitiva do estado final esta em tests/084';
END IF;

-- (h) NULL workspace => fail-closed
SELECT public.user_can_cancel_tablet_reservation(NULL) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [h]: NULL workspace must be DENIED';
END IF;

-- (i) outro caller (auth.uid() diferente) sem membership => DENY
INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('07777777-7777-7777-7777-777777777772',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '078-tablet-outro@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"078 Tablet outro"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

PERFORM set_config('request.jwt.claim.sub',
                   '07777777-7777-7777-7777-777777777772', true);
SELECT public.user_can_cancel_tablet_reservation(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [i]: an unrelated authenticated user must be DENIED';
END IF;

-- Restaura o contexto do GUC para não vazar para os testes seguintes do CI.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

RAISE NOTICE 'OK: 078 can_cancel_tablet_reservation RBAC 2.0 checks passed';
END $$;
