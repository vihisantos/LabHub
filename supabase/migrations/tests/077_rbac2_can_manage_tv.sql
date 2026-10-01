-- =============================================================================
-- tests/077_rbac2_can_manage_tv.sql
-- =============================================================================
-- #296 (PR-4B) â€” `user_can_manage_tv(uuid)` autoriza por RBAC 2.0
-- (membership ativa + role_permissions `tv.manage`@workspace) e NÃƒO mais por
-- `profiles.app_access->>'tv' = 'full'`.
--
-- Harness comportamental (mesmo dos harnesses 049/065-071 do repo e do stub do
-- Migrations CI, `scripts/ci/supabase_stub_bootstrap.sql:81`):
--   Â· o caller Ã© simulado com `set_config('request.jwt.claim.sub', ...)`;
--   Â· `profiles.id` referencia `auth.users(id)`, entÃ£o o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   Â· escritas de campo privilegiado em `profiles` (app_access) sÃ£o feitas com
--     `auth.uid()` nulo â€” contexto confiÃ¡vel, que a guarda da 067 aceita
--     explicitamente (067:70-72);
--   Â· memberships sÃ£o inseridas sem `managed_by` (a guarda da 045 retorna
--     imediatamente nesse caso) e sem trigger que reescreva `workspace_ids`.
--
--  1. helper existe com a assinatura `ws_id uuid`;
--  2. `SECURITY DEFINER` + `search_path` travado preservados;
--  3. super admin NÃƒO Ã© tratado dentro da helper (invariante de policies);
--  4. estrutura RBAC 2.0 completa e fail-closed;
--  5. `profiles.app_access` e `profiles.role` NÃƒO sÃ£o consultados;
--  6. Action `tv.manage`@workspace semeada em `opv` + `adm`, NUNCA em `tec`,
--     e em nenhuma outra role;
--  7. `tv_can_manage_workspace` continua delegando na helper e mantendo o
--     bypass de super admin (nenhuma policy foi reescrita);
--  8. COMPORTAMENTAL: sem membership/DENY Â· membership ativa+Action/ALLOW Â·
--     outra unidade/DENY (isolamento) Â· membership inativa/DENY Â·
--     role sem a Action/DENY Â· `app_access.tv='full'` sem Action/DENY Â·
--     `app_access.tv='full'` com Action/ALLOW.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 077 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 077 can_manage_tv RBAC 2.0 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_helper  text;
  v_tec     uuid;
  v_opv     uuid;
  v_adm     uuid;
  v_vis     uuid;
  v_wsa     uuid;
  v_wsb     uuid;
  v_uid     uuid;
  v_out     boolean;
BEGIN

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- PARTE 1 â€” ESTRUTURAL / CATÃLOGO
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â”€â”€ 1. Helper existe com a assinatura preservada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_can_manage_tv'
  AND pg_get_function_identity_arguments(p.oid) = 'ws_id uuid';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv(ws_id uuid) must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_helper
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv';

-- â”€â”€ 2. SECURITY DEFINER + search_path travado (invariante 044/049/050/059) â”€â”€â”€
IF v_helper NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv must be SECURITY DEFINER';
END IF;
IF v_helper NOT LIKE '%SET search_path = public%'
   AND v_helper NOT LIKE '%SET search_path TO %public%' THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv must pin search_path=public';
END IF;

-- â”€â”€ 3. Super admin NÃƒO Ã© tratado dentro da helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
IF v_helper LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: super admin bypass must stay in the policies, not inside user_can_manage_tv';
END IF;

-- â”€â”€ 4. Estrutura RBAC 2.0 + fail-closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  RAISE EXCEPTION 'FAIL: only an ACTIVE membership may grant TV management';
END IF;
IF v_helper NOT LIKE '%tv.manage%' THEN
  RAISE EXCEPTION 'FAIL: helper must resolve the Action tv.manage';
END IF;
IF v_helper NOT LIKE '%scope = ''workspace''%' AND v_helper NOT LIKE '%scope=''workspace''%' THEN
  RAISE EXCEPTION 'FAIL: Action must be resolved at scope workspace';
END IF;
IF v_helper NOT LIKE '%ws_id IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: helper must be fail-closed for a NULL workspace';
END IF;
-- Fail-closed estrutural: a helper NÃƒO pode ter ramo permissivo alÃ©m do EXISTS.
IF v_helper LIKE '%COALESCE(%app_access%' OR v_helper LIKE '%OR EXISTS%' THEN
  RAISE EXCEPTION 'FAIL: helper must be a single fail-closed EXISTS (no permissive OR branch)';
END IF;

-- â”€â”€ 5. A autoridade legada NÃƒO Ã© mais consultada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
IF v_helper LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: helper must not authorize via profiles.app_access';
END IF;
IF v_helper LIKE '%public.profiles%' THEN
  RAISE EXCEPTION 'FAIL: helper must not read public.profiles at all after PR-4B';
END IF;
IF v_helper LIKE '%profiles.role%'
   OR v_helper ~ '(^|[^a-zA-Z0-9_])(p|pr)\.role([^a-zA-Z0-9_]|$)'
   OR v_helper LIKE '%role = ''admin''%' THEN
  RAISE EXCEPTION 'FAIL: helper must not authorize via profiles.role';
END IF;
-- Guarda do prÃ³prio regex: `rp.role_id` NÃƒO pode ser lido como profiles.role.
IF v_helper LIKE '%rp.role_id%'
   AND v_helper ~ '(^|[^a-zA-Z0-9_])p\.role([^a-zA-Z0-9_]|$)' THEN
  RAISE EXCEPTION 'FAIL: boundary regex matches rp.role_id (false positive)';
END IF;

-- â”€â”€ 6. Action semeada: opv + adm, nunca tec, nunca outra role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
SELECT id INTO v_opv FROM public.roles WHERE slug = 'opv';
SELECT id INTO v_adm FROM public.roles WHERE slug = 'adm';
SELECT id INTO v_vis FROM public.roles WHERE slug = 'vis';

IF v_opv IS NULL OR v_adm IS NULL THEN
  RAISE EXCEPTION 'FAIL: roles opv/adm ausentes (seeds da 036 nÃ£o aplicados?)';
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_opv AND action = 'tv.manage' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: opv must hold exactly one tv.manage@workspace (found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_adm AND action = 'tv.manage' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: adm must hold exactly one tv.manage@workspace (found %)', v_count;
END IF;

IF v_tec IS NOT NULL THEN
  SELECT count(*) INTO v_count
  FROM public.role_permissions
  WHERE role_id = v_tec AND action = 'tv.manage';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL: tec must NOT hold tv.manage (mass-grant de escrita de TV â€” decisÃ£o da 059:19-26)';
  END IF;
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'tv.manage' AND r.slug NOT IN ('opv', 'adm');
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: tv.manage granted to roles outside opv/adm (found %)', v_count;
END IF;

-- `tv.manage` nÃ£o pode colidir com nenhuma action granular jÃ¡ existente.
SELECT count(*) INTO v_count FROM public.role_permissions WHERE action = 'tv.manage' AND scope <> 'workspace';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: tv.manage must only exist at scope workspace (found %)', v_count;
END IF;

-- â”€â”€ 7. Policies/funÃ§Ãµes consumidoras intocadas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'tv_can_manage_workspace';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must exist';
END IF;
IF v_def NOT LIKE '%user_can_manage_tv%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep delegating to user_can_manage_tv';
END IF;
IF v_def NOT LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep the is_super_admin bypass';
END IF;
IF v_def NOT LIKE '%user_belongs_to_workspace%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep the workspace membership check';
END IF;

-- ACL da helper preservada (059:77-80 / 077).
IF NOT EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv'
    AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: authenticated must hold EXECUTE on user_can_manage_tv';
END IF;
IF EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv'
    AND g.grantee = 'anon' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: anon must NOT execute user_can_manage_tv';
END IF;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- PARTE 2 â€” COMPORTAMENTAL (caller simulado via request.jwt.claim.sub)
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Fixtures: um usuÃ¡rio real (auth.users â†’ profile pending) e duas unidades.
INSERT INTO public.workspaces (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777777', '077 TV WS A', 'ws077-a')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsa FROM public.workspaces WHERE slug = 'ws077-a';

INSERT INTO public.workspaces (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777778', '077 TV WS B', 'ws077-b')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsb FROM public.workspaces WHERE slug = 'ws077-b';

IF v_wsa IS NULL OR v_wsb IS NULL OR v_wsa = v_wsb THEN
  RAISE EXCEPTION 'FAIL: could not create two distinct workspaces for the isolation check';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('07777777-7777-7777-7777-777777777777',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '077-tv@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"077 TV"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid FROM public.profiles WHERE email = '077-tv@labhub.test';
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created did not create the profile for 077-tv@labhub.test';
END IF;

-- Conta ativa (contexto confiÃ¡vel: a guarda da 067 aceita auth.uid() nulo).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id = v_uid;

-- Atalho para fixar o caller nos cenÃ¡rios abaixo.
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

-- (a) SEM membership => DENY
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [a]: user without membership must be DENIED TV management';
END IF;

-- (b) membership ATIVA com tv.manage => ALLOW
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
VALUES (v_uid, v_wsa, v_opv, 'active')
ON CONFLICT (profile_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [b]: active membership with tv.manage must be ALLOWED in its own workspace';
END IF;

-- (c) ISOLAMENTO â€” a MESMA membership nÃ£o autoriza outra unidade
SELECT public.user_can_manage_tv(v_wsb) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [c]: membership in workspace A must NOT grant access to workspace B';
END IF;

-- (d) membership SUSPENSA => DENY (fail-closed)
UPDATE public.memberships SET status = 'suspended'
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [d]: suspended membership must be DENIED TV management';
END IF;
UPDATE public.memberships SET status = 'active'
WHERE profile_id = v_uid AND workspace_id = v_wsa;

-- (e) membership com role SEM tv.manage => DENY
IF v_vis IS NULL THEN
  RAISE EXCEPTION 'FAIL [e]: role vis ausente (seeds da 036)';
END IF;
UPDATE public.memberships SET role_id = v_vis
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [e]: membership whose role lacks tv.manage must be DENIED';
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
  -- (f) app_access->>'tv' = 'full' SEM tv.manage => DENY (encerra a dependÃªncia)
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  UPDATE public.profiles
     SET app_access = jsonb_build_object('tv', 'full')
   WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
  IF v_out THEN
    RAISE EXCEPTION 'FAIL [f]: app_access->>''tv''=''full'' alone must NOT grant TV management (PR-4B)';
  END IF;

  -- (g) app_access 'full' COM tv.manage => ALLOW (Ã© o RBAC 2.0 que decide)
  UPDATE public.memberships SET role_id = v_opv
  WHERE profile_id = v_uid AND workspace_id = v_wsa;
  SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
  IF NOT v_out THEN
    RAISE EXCEPTION 'FAIL [g]: active membership with tv.manage must be ALLOWED even with app_access set';
  END IF;
ELSE
  RAISE NOTICE '077: public.profiles.app_access nao existe (084 aplicada) - casos (f)/(g) do override legado omitidos; a prova definitiva do estado final esta em tests/084';
END IF;

-- (h) NULL workspace => fail-closed
SELECT public.user_can_manage_tv(NULL) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [h]: NULL workspace must be DENIED';
END IF;

-- (i) outro caller (auth.uid() diferente) sem membership => DENY
INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('07777777-7777-7777-7777-777777777778',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '077-tv-outro@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"077 TV outro"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

PERFORM set_config('request.jwt.claim.sub',
                   '07777777-7777-7777-7777-777777777778', true);
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [i]: an unrelated authenticated user must be DENIED';
END IF;

-- Restaura o contexto do GUC para nÃ£o vazar para os testes seguintes do STEP 6.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

RAISE NOTICE 'OK: 077 can_manage_tv RBAC 2.0 checks passed';
END $$;
