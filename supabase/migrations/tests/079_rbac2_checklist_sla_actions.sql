-- =============================================================================
-- tests/079_rbac2_checklist_sla_actions.sql
-- =============================================================================
-- F2-D-G — `pcare.checklist.create|edit|delete` e `chamados.settings.manage`
-- (escopo `workspace`) são aplicadas pelo RLS das tabelas de checklist do PC
-- Care via `public.user_has_action(uuid, text)`.
--
-- Harness comportamental (mesmo dos harnesses 049/065-071/077 do repo e do stub
-- do Migrations CI, scripts/ci/supabase_stub_bootstrap.sql:81):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   · escritas privilegiadas em `profiles` são feitas com `auth.uid()` nulo —
--     contexto confiável, que a guarda da 067 aceita explicitamente;
--   · memberships são inseridas sem `managed_by` (a guarda da 045 retorna
--     imediatamente nesse caso).
--
--  PARTE 1 — ESTRUTURAL
--   1. helper existe com a assinatura (ws_id uuid, p_action text);
--   2. SECURITY DEFINER + search_path travado + STABLE;
--   3. super admin NÃO é tratado dentro da helper (invariante de policies);
--   4. cadeia RBAC 2.0 completa e fail-closed (memberships → role_permissions,
--      caller = auth.uid(), membership presa à unidade, status 'active',
--      scope 'workspace');
--   5. `profiles.app_access` / `profiles.role` NÃO são consultados;
--   6. `membership_overrides` NÃO é consultado;
--   7. ACL: anon/PUBLIC sem EXECUTE, authenticated + service_role com EXECUTE;
--   8. seeds: as 3 Actions de checklist só em `tec`;
--               `chamados.settings.manage` só em `tec`/`lider`/`coordinator`;
--               todas em scope `workspace`;
--   9. policies de escrita de checklist_templates/pc_checklists exigem a Action
--      da operação; as de SELECT continuam sendo as da 027 (membership).
--
--  PARTE 2 — COMPORTAMENTAL (o que o enunciado exige: chamada direta ao banco)
--  10. INSERT/UPDATE/DELETE DIRETO em pcare.checklist_templates por usuário
--      SEM a Action => NEGADO pelo banco (não só pela UI);
--  11. membership ATIVA com a Action => ALLOW nas 3 operações;
--  12. membership em OUTRA unidade => NEGADO (isolamento);
--  13. membership suspensa => NEGADO;
--  14. role SEM a Action (vis, que tem `pc-care: read` no legado) => NEGADO;
--  15. app_access legado `pc-care = full` SEM a Action => NEGADO (encerra a
--      dependência funcional de `Role.appAccess`/`profiles.app_access`);
--  16. super admin => ALLOW (bypass preservado).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 079 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 079 checklist/sla RBAC 2.0 checks passed".
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
  v_uid2    uuid;
  v_row     uuid;
  v_out     boolean;
BEGIN

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — ESTRUTURAL / CATÁLOGO
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Helper existe com a assinatura esperada
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_has_action'
  AND pg_get_function_identity_arguments(p.oid) = 'ws_id uuid, p_action text';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: user_has_action(uuid, text) must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_helper
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'user_has_action';

-- 2. SECURITY DEFINER + search_path travado (invariante 044/049/050/077)
IF v_helper NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: user_has_action must be SECURITY DEFINER';
END IF;
IF v_helper NOT LIKE '%SET search_path = public%'
   AND v_helper NOT LIKE '%SET search_path TO %public%' THEN
  RAISE EXCEPTION 'FAIL: user_has_action must pin search_path=public';
END IF;
IF v_helper NOT LIKE '%STABLE%' THEN
  RAISE EXCEPTION 'FAIL: user_has_action must be STABLE';
END IF;

-- 3. Super admin NÃO é tratado dentro da helper (bypass vive na policy)
IF v_helper LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: super admin bypass must stay in the policies, not inside user_has_action';
END IF;

-- 4. Estrutura RBAC 2.0 + fail-closed
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
  RAISE EXCEPTION 'FAIL: only an ACTIVE membership may grant a checklist Action';
END IF;
IF v_helper NOT LIKE '%rp.action = p_action%' THEN
  RAISE EXCEPTION 'FAIL: helper must resolve the Action passed as parameter';
END IF;
IF v_helper NOT LIKE '%scope = ''workspace''%' AND v_helper NOT LIKE '%scope=''workspace''%' THEN
  RAISE EXCEPTION 'FAIL: helper must require scope workspace';
END IF;
IF v_helper NOT LIKE '%ws_id IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: helper must be fail-closed on NULL workspace';
END IF;
IF v_helper NOT LIKE '%p_action IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: helper must be fail-closed on NULL action';
END IF;

-- Um ÚNICO EXISTS: sem ramo permissivo (fail-closed).
IF v_helper ~* 'OR\s+EXISTS' THEN
  RAISE EXCEPTION 'FAIL: helper must not have a second permissive EXISTS';
END IF;

-- 5. Legado não autoriza mais
IF v_helper LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: profiles.app_access must not grant checklist Actions';
END IF;
IF v_helper LIKE '%public.profiles%' THEN
  RAISE EXCEPTION 'FAIL: helper must not read public.profiles';
END IF;
-- Regex com fronteira: 'rp.role_id' contém a substring 'p.role' (falso positivo).
IF v_helper ~ '(^|[^A-Za-z0-9_])(p|pr)\.role([^A-Za-z0-9_]|$)' THEN
  RAISE EXCEPTION 'FAIL: helper must not read profiles.role';
END IF;
IF v_helper LIKE '%membership_overrides%' THEN
  RAISE EXCEPTION 'FAIL: helper must not consult membership_overrides';
END IF;

-- 7. ACL
IF EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  WHERE g.routine_name = 'user_has_action'
    AND g.grantee = 'anon' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: anon must NOT execute user_has_action';
END IF;
IF NOT EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  WHERE g.routine_name = 'user_has_action'
    AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: authenticated must hold EXECUTE on user_has_action';
END IF;

-- 8. Seeds: escopo, donos e anti-mass-grant
SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
SELECT id INTO v_vis FROM public.roles WHERE slug = 'vis';
IF v_tec IS NULL OR v_vis IS NULL THEN
  RAISE EXCEPTION 'FAIL: roles tec/vis ausentes (seeds da 036)';
END IF;

-- As 3 Actions de checklist existem em `tec`…
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_tec
  AND action IN ('pcare.checklist.create', 'pcare.checklist.edit', 'pcare.checklist.delete')
  AND scope = 'workspace';
IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: tec must hold the 3 pcare.checklist Actions@workspace (found %)', v_count;
END IF;

-- …e em NENHUMA outra role.
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action IN ('pcare.checklist.create', 'pcare.checklist.edit', 'pcare.checklist.delete')
  AND r.slug <> 'tec';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: pcare.checklist.* must exist ONLY on tec (found % in other roles)', v_count;
END IF;

-- `chamados.settings.manage` existe nos 3 cargos com `chamados = full`…
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'chamados.settings.manage'
  AND rp.scope = 'workspace'
  AND r.slug IN ('tec', 'lider', 'coordinator');
IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: chamados.settings.manage@workspace must be on tec/lider/coordinator (found %)', v_count;
END IF;

-- …e em nenhuma outra.
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'chamados.settings.manage'
  AND r.slug NOT IN ('tec', 'lider', 'coordinator');
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: chamados.settings.manage must not leak to other roles (found %)', v_count;
END IF;

-- Nenhuma Action da 079 fora do escopo `workspace`.
SELECT count(*) INTO v_count FROM public.role_permissions
WHERE action IN ('pcare.checklist.create', 'pcare.checklist.edit',
                 'pcare.checklist.delete', 'chamados.settings.manage')
  AND scope <> 'workspace';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: actions of 079 must only exist at scope workspace (found %)', v_count;
END IF;

-- 9. Policies de escrita exigem a Action DA OPERAÇÃO
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare' AND tablename = 'checklist_templates'
  AND policyname = 'checklist_templates_insert'
  AND qual LIKE '%user_has_action%'
  AND qual LIKE '%pcare.checklist.create%';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: checklist_templates_insert must require pcare.checklist.create';
END IF;

SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare' AND tablename = 'checklist_templates'
  AND policyname = 'checklist_templates_update'
  AND qual LIKE '%pcare.checklist.edit%'
  AND qual LIKE '%user_has_action%';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: checklist_templates_update must require pcare.checklist.edit';
END IF;

SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare' AND tablename = 'checklist_templates'
  AND policyname = 'checklist_templates_delete'
  AND qual LIKE '%pcare.checklist.delete%'
  AND qual LIKE '%user_has_action%';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: checklist_templates_delete must require pcare.checklist.delete';
END IF;

-- pc_checklists endurecida com as MESMAS Actions
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare' AND tablename = 'pc_checklists'
  AND policyname IN ('pc_checklists_insert', 'pc_checklists_update', 'pc_checklists_delete')
  AND qual LIKE '%user_has_action%';
IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: the 3 pc_checklists write policies must require a checklist Action (found %)', v_count;
END IF;

-- SELECT continua implícito pelo App Access (membership), sem Action de leitura
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare'
  AND tablename IN ('checklist_templates', 'pc_checklists')
  AND policyname LIKE '%_select';
IF v_count <> 2 THEN
  RAISE EXCEPTION 'FAIL: the 2 SELECT policies must be preserved (found %)', v_count;
END IF;
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'pcare'
  AND tablename IN ('checklist_templates', 'pc_checklists')
  AND policyname LIKE '%_select'
  AND (qual LIKE '%user_has_action%' OR qual LIKE '%pcare.checklist%');
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: SELECT must stay membership-based (no read Action)';
END IF;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — COMPORTAMENTAL: escrita DIRETA no banco, sem Action => NEGADO
-- ─────────────────────────────────────────────────────────────────────────────

-- Fixtures: duas unidades e um usuário real (auth.users → profile).
INSERT INTO public.workspaces (id, name, slug)
VALUES ('88888888-8888-8888-8888-888888888881', '079 WS A', 'ws079-a')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsa FROM public.workspaces WHERE slug = 'ws079-a';

INSERT INTO public.workspaces (id, name, slug)
VALUES ('88888888-8888-8888-8888-888888888882', '079 WS B', 'ws079-b')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsb FROM public.workspaces WHERE slug = 'ws079-b';

IF v_wsa IS NULL OR v_wsb IS NULL OR v_wsa = v_wsb THEN
  RAISE EXCEPTION 'FAIL: could not create two distinct workspaces for the isolation check';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('08888888-8888-8888-8888-888888888881',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '079-checklist@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"079 Checklist"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid FROM public.profiles WHERE email = '079-checklist@labhub.test';
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created did not create the profile for 079-checklist@labhub.test';
END IF;

-- Conta ativa (contexto confiável: a guarda da 067 aceita auth.uid() nulo).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id = v_uid;

-- ── 10. INSERT/UPDATE/DELETE DIRETO sem Action => o BANCO nega ─────────────
-- Linha semeada em contexto CONFIÁVEL (auth.uid() nulo), para que UPDATE e
-- DELETE tenham uma linha real sobre a qual provar a negação.
PERFORM set_config('request.jwt.claim.sub', NULL, true);
INSERT INTO pcare.checklist_templates (id, name, "labName", items, workspace_id)
VALUES ('99999999-0000-0000-0000-000000000001', 'original', 'LAB-X', '[]'::jsonb, v_wsa)
ON CONFLICT (id) DO NOTHING;
v_row := '99999999-0000-0000-0000-000000000001';

-- Caller autenticado SEM membership e SEM Action.
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

-- (a) INSERT direto é negado: a linha nova não pode existir.
BEGIN
  INSERT INTO pcare.checklist_templates (id, name, "labName", items, workspace_id)
  VALUES ('99999999-0000-0000-0000-000000000010', 'sem permissao', 'LAB-X', '[]'::jsonb, v_wsa);
EXCEPTION
  -- 42501 = new row violates row-level security policy.
  WHEN insufficient_privilege THEN NULL;
  WHEN check_violation THEN NULL;
END;
SELECT count(*) INTO v_count
FROM pcare.checklist_templates
WHERE id = '99999999-0000-0000-0000-000000000010';
IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL [10a]: INSERT direto sem Action gravou a linha (RLS nao bloqueou)';
END IF;

-- (b) UPDATE direto é negado: a linha existente fica intacta.
UPDATE pcare.checklist_templates SET name = 'HACK-UPDATE' WHERE id = v_row;
IF EXISTS (SELECT 1 FROM pcare.checklist_templates WHERE id = v_row AND name = 'HACK-UPDATE') THEN
  RAISE EXCEPTION 'FAIL [10b]: UPDATE direto sem Action foi aplicado (RLS nao bloqueou)';
END IF;

-- (c) DELETE direto é negado: a linha continua existindo.
DELETE FROM pcare.checklist_templates WHERE id = v_row;
IF NOT EXISTS (SELECT 1 FROM pcare.checklist_templates WHERE id = v_row) THEN
  RAISE EXCEPTION 'FAIL [10c]: DELETE direto sem Action foi aplicado (RLS nao bloqueou)';
END IF;

-- ── 11. membership ATIVA em `tec` (tem as 3 Actions) => ALLOW nas 3 ops ──────
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
VALUES (v_uid, v_wsa, v_tec, 'active')
ON CONFLICT (profile_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

SELECT public.user_has_action(v_wsa, 'pcare.checklist.create') INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [11a]: membership ativa com a Action deve permitir create';
END IF;
SELECT public.user_has_action(v_wsa, 'pcare.checklist.edit') INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [11b]: membership ativa com a Action deve permitir edit';
END IF;
SELECT public.user_has_action(v_wsa, 'pcare.checklist.delete') INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [11c]: membership ativa com a Action deve permitir delete';
END IF;

-- A escrita agora é aceita de fato (INSERT/UPDATE/DELETE diretos).
INSERT INTO pcare.checklist_templates (id, name, "labName", items, workspace_id)
VALUES ('99999999-0000-0000-0000-000000000002', 'com permissao', 'LAB-Y', '[]'::jsonb, v_wsa);
IF NOT FOUND THEN
  RAISE EXCEPTION 'FAIL [11d]: INSERT com a Action deve ser aceito pelo RLS';
END IF;

UPDATE pcare.checklist_templates SET name = 'editado' WHERE id = '99999999-0000-0000-0000-000000000002';
IF NOT FOUND THEN
  RAISE EXCEPTION 'FAIL [11e]: UPDATE com a Action deve ser aceito pelo RLS';
END IF;

-- ── 12. ISOLAMENTO — a MESMA membership não autoriza outra unidade ──────────
SELECT public.user_has_action(v_wsb, 'pcare.checklist.create') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [12]: membership na unidade A nao pode autorizar a unidade B';
END IF;

-- INSERT apontando para a OUTRA unidade também é negado.
BEGIN
  INSERT INTO pcare.checklist_templates (id, name, "labName", items, workspace_id)
  VALUES ('99999999-0000-0000-0000-000000000003', 'cross-ws', 'LAB-Z', '[]'::jsonb, v_wsb);
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN check_violation THEN NULL;
END;
SELECT count(*) INTO v_count
FROM pcare.checklist_templates
WHERE id = '99999999-0000-0000-0000-000000000003';
IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL [12b]: INSERT em outra unidade deve ser NEGADO pelo RLS';
END IF;

-- ── 13. membership suspensa => DENY (fail-closed) ──────────────────────────
UPDATE public.memberships SET status = 'suspended'
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_has_action(v_wsa, 'pcare.checklist.edit') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [13]: membership suspensa deve ser NEGADA';
END IF;
UPDATE public.memberships SET status = 'active'
WHERE profile_id = v_uid AND workspace_id = v_wsa;

-- ── 14. role SEM a Action (`vis`: `pc-care: read` no legado) => DENY ────────
UPDATE public.memberships SET role_id = v_vis
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_has_action(v_wsa, 'pcare.checklist.create') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [14]: role sem a Action deve ser NEGADA';
END IF;

-- O dado da outra unidade também não pode ser editado por quem não tem a Action.
UPDATE pcare.checklist_templates SET name = 'HACK-VIS' WHERE workspace_id = v_wsa;
IF EXISTS (SELECT 1 FROM pcare.checklist_templates WHERE name = 'HACK-VIS') THEN
  RAISE EXCEPTION 'FAIL [14b]: UPDATE sem a Action foi aplicado pelo role sem permissão';
END IF;

-- ── 15. app_access legado `pc-care = full` SEM a Action => DENY ─────────────
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles
   SET app_access = jsonb_build_object('pc-care', 'full')
 WHERE id = v_uid;
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

SELECT public.user_has_action(v_wsa, 'pcare.checklist.create') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [15]: app_access legado pc-care=full NAO pode autorizar checklist (F2-D-G)';
END IF;

-- Volta a `tec` e confirma que a Action decide (independentemente do app_access).
UPDATE public.memberships SET role_id = v_tec
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_has_action(v_wsa, 'pcare.checklist.create') INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [15b]: com a Action deve ser permitido mesmo com app_access legado presente';
END IF;

-- ── 16. outro caller, sem membership => DENY ────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('08888888-8888-8888-8888-888888888882',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '079-outro@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"079 Outro"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid2 FROM public.profiles WHERE email = '079-outro@labhub.test';
IF v_uid2 IS NULL THEN
  RAISE EXCEPTION 'FAIL: profile de 079-outro@labhub.test nao foi criado';
END IF;

PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true);
SELECT public.user_has_action(v_wsa, 'pcare.checklist.create') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [16]: usuario sem membership deve ser NEGADO';
END IF;

-- NULL workspace / NULL action => fail-closed
SELECT public.user_has_action(NULL, 'pcare.checklist.create') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [17]: NULL workspace deve ser NEGADO';
END IF;
SELECT public.user_has_action(v_wsa, NULL) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [18]: NULL action deve ser NEGADO';
END IF;
SELECT public.user_has_action(v_wsa, '   ') INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [19]: action em branco deve ser NEGADA';
END IF;

-- Limpeza das linhas de teste (contexto confiável: auth.uid() nulo).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
DELETE FROM pcare.checklist_templates
WHERE id IN ('99999999-0000-0000-0000-000000000001',
             '99999999-0000-0000-0000-000000000002',
             '99999999-0000-0000-0000-000000000010');

-- Restaura o contexto do GUC para não vazar para os testes seguintes do STEP 6.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

RAISE NOTICE 'OK: 079 checklist/sla RBAC 2.0 checks passed';
END $$;
