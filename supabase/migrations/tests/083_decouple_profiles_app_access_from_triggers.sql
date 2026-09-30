-- =============================================================================
-- tests/083_decouple_profiles_app_access_from_triggers.sql
-- =============================================================================
-- F2-D-I — os 2 triggers vivos de `public.profiles` deixa de depender de
-- `profiles.app_access`, SEM perder nenhum comportamento restante.
--
-- Harness comportamental (mesmo padrão dos harnesses 049/065-071/076/077/078/079
-- e do stub do Migrations CI, scripts/ci/supabase_stub_bootstrap.sql:81):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   · escritas privilegiadas em `profiles` são feitas com `auth.uid()` NULL —
--     contexto confiável, que a guarda da 067 aceita explicitamente (067:70-72);
--   · `is_super_admin` é ligado/desligado só em contexto confiável.
--
--  PARTE 1 — ESTRUTURAL
--   1. `audit_profiles_change()` existe e NÃO referencia `app_access`
--      (nem `NEW.app_access`, nem `OLD.app_access`);
--   2. a trigger `trg_app_audit_profiles` existe, é AFTER UPDATE, FOR EACH ROW,
--      e o `WHEN` cobre role/status/is_super_admin SEM `app_access`;
--   3. `guard_profile_privileged_columns()` existe e NÃO referencia `app_access`;
--   4. a trigger `trg_profiles_guard_privileged` existe, é BEFORE UPDATE,
--      FOR EACH ROW;
--   5. as duas funções preservam `SECURITY DEFINER` + `search_path = public`
--      (invariante das migrations do repo);
--   6. a auditoria preserva os 3 eventos restantes com seus `meta`;
--   7. a guarda preserva: contexto confiável, `id` imutável,
--      `workspace_ids` imutável, atalho de Super Admin e o bloqueio de
--      `is_super_admin`/`role`/`status`.
--
--  PARTE 2 — COMPORTAMENTAL
--   8. mudança de `role`     => linha em app_audit_logs com `role_changed` + meta;
--   9. mudança de `status`   => `status_changed` + meta;
--  10. mudança de superadmin => `super_admin_toggled` + meta;
--  11. UPDATE sem campo sensível => NENHUMA linha de auditoria (RETURN NULL);
--  12. usuário comum autoelevando `role`      => NEGADO (42501);
--  13. usuário comum autoelevando `status`    => NEGADO (42501);
--  14. usuário comum autoelevando super admin => NEGADO (42501);
--  15. usuário comum trocando `id`            => NEGADO (imutável);
--  16. usuário comum trocando `workspace_ids` => NEGADO (imutável);
--  17. usuário comum alterando campo neutro (name) => PERMITIDO;
--  18. super admin alterando `role`/`status`   => PERMITIDO;
--  19. escrita que muda SÓ `app_access` => passa sem erro de runtime e não
--      gera auditoria (comportamento documentado no F2-D-I).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 083 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 083 decouple profiles.app_access from triggers checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count  integer;
  v_def    text;
  v_audit  text;
  v_guard  text;
  v_uid    uuid;
  v_uid2   uuid;
  v_ws     uuid;
  v_role   uuid;
  v_name   text;
BEGIN

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — ESTRUTURAL
-- ─────────────────────────────────────────────────────────────────────────────

-- 1/2. audit_profiles_change + sua trigger
SELECT count(*) INTO v_count
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'audit_profiles_change';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: audit_profiles_change() must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_audit
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'audit_profiles_change';

IF v_audit LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: audit_profiles_change() ainda referencia app_access (F2-D-I)';
END IF;
IF v_audit LIKE '%NEW.app_access%' OR v_audit LIKE '%OLD.app_access%' THEN
  RAISE EXCEPTION 'FAIL: audit_profiles_change() ainda referencia NEW/OLD.app_access';
END IF;

IF v_audit NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: audit_profiles_change() deve manter SECURITY DEFINER';
END IF;
IF v_audit NOT LIKE '%SET search_path = public%' THEN
  RAISE EXCEPTION 'FAIL: audit_profiles_change() deve manter SET search_path = public';
END IF;

-- 6. os 3 eventos restantes + seus meta
IF v_audit NOT LIKE '%role_changed%' THEN
  RAISE EXCEPTION 'FAIL: auditoria de role (role_changed) foi perdida';
END IF;
IF v_audit NOT LIKE '%status_changed%' THEN
  RAISE EXCEPTION 'FAIL: auditoria de status (status_changed) foi perdida';
END IF;
IF v_audit NOT LIKE '%super_admin_toggled%' THEN
  RAISE EXCEPTION 'FAIL: auditoria de is_super_admin (super_admin_toggled) foi perdida';
END IF;
IF v_audit NOT LIKE '%prev_role%' OR v_audit NOT LIKE '%new_role%' THEN
  RAISE EXCEPTION 'FAIL: meta de role_changed foi perdido';
END IF;
IF v_audit NOT LIKE '%prev_status%' OR v_audit NOT LIKE '%new_status%' THEN
  RAISE EXCEPTION 'FAIL: meta de status_changed foi perdido';
END IF;
IF v_audit NOT LIKE '%public.app_audit_logs%' THEN
  RAISE EXCEPTION 'FAIL: INSERT em app_audit_logs foi perdido';
END IF;
IF v_audit NOT LIKE '%public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: resolucao do workspace por membership ativa foi perdida';
END IF;

-- Trigger: nome, timing e WHEN
SELECT count(*) INTO v_count
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'profiles'
  AND tg.tgname = 'trg_app_audit_profiles'
  AND NOT tg.tgisinternal;
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: trigger trg_app_audit_profiles must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_triggerdef(tg.oid) INTO v_def
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'profiles'
  AND tg.tgname = 'trg_app_audit_profiles' AND NOT tg.tgisinternal;

IF v_def NOT LIKE '%AFTER UPDATE ON public.profiles%' THEN
  RAISE EXCEPTION 'FAIL: trg_app_audit_profiles deve continuar AFTER UPDATE';
END IF;
IF v_def NOT LIKE '%FOR EACH ROW%' THEN
  RAISE EXCEPTION 'FAIL: trg_app_audit_profiles deve continuar FOR EACH ROW';
END IF;
IF v_def NOT LIKE '%audit_profiles_change%' THEN
  RAISE EXCEPTION 'FAIL: trg_app_audit_profiles deve continuar chamando audit_profiles_change';
END IF;
IF v_def LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: o WHEN de trg_app_audit_profiles ainda menciona app_access (F2-D-I)';
END IF;
IF v_def NOT LIKE '%role IS DISTINCT FROM OLD.role%'
   OR v_def NOT LIKE '%status IS DISTINCT FROM OLD.status%'
   OR v_def NOT LIKE '%is_super_admin IS DISTINCT FROM OLD.is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: o WHEN de trg_app_audit_profiles perdeu um dos 3 campos sensiveis';
END IF;

-- 3/4. guard_profile_privileged_columns + sua trigger
SELECT count(*) INTO v_count
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'guard_profile_privileged_columns';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: guard_profile_privileged_columns() must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'guard_profile_privileged_columns';

IF v_guard LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: guard_profile_privileged_columns() ainda referencia app_access (F2-D-I)';
END IF;
IF v_guard NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: guard_profile_privileged_columns() deve manter SECURITY DEFINER';
END IF;
IF v_guard NOT LIKE '%SET search_path = public%' THEN
  RAISE EXCEPTION 'FAIL: guard_profile_privileged_columns() deve manter SET search_path = public';
END IF;

-- 7. protecoes restantes
IF v_guard NOT LIKE '%auth.uid() IS NULL%' THEN
  RAISE EXCEPTION 'FAIL: o atalho de contexto confiavel (auth.uid() nulo) foi perdido';
END IF;
IF v_guard NOT LIKE '%profiles.id is immutable in normal UPDATE%' THEN
  RAISE EXCEPTION 'FAIL: a imutabilidade de profiles.id foi perdida';
END IF;
IF v_guard NOT LIKE '%profiles.workspace_ids is immutable in normal UPDATE%' THEN
  RAISE EXCEPTION 'FAIL: a imutabilidade de profiles.workspace_ids foi perdida';
END IF;
IF v_guard NOT LIKE '%42501%' THEN
  RAISE EXCEPTION 'FAIL: o ERRCODE 42501 das guardas foi perdido';
END IF;
IF v_guard NOT LIKE '%alteracao de campo privilegiado do proprio perfil nao e permitida%' THEN
  RAISE EXCEPTION 'FAIL: a mensagem de bloqueio de campo privilegiado mudou';
END IF;
IF v_guard NOT LIKE '%is_super_admin()%' THEN
  RAISE EXCEPTION 'FAIL: o atalho do Super Admin foi perdido';
END IF;
IF v_guard NOT LIKE '%NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin%'
   OR v_guard NOT LIKE '%NEW.role         IS DISTINCT FROM OLD.role%'
   OR v_guard NOT LIKE '%NEW.status       IS DISTINCT FROM OLD.status%' THEN
  RAISE EXCEPTION 'FAIL: a guarda perdeu a protecao de is_super_admin/role/status';
END IF;

SELECT pg_get_triggerdef(tg.oid) INTO v_def
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'profiles'
  AND tg.tgname = 'trg_profiles_guard_privileged' AND NOT tg.tgisinternal;

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: trigger trg_profiles_guard_privileged nao existe';
END IF;
IF v_def NOT LIKE '%BEFORE UPDATE ON public.profiles%' THEN
  RAISE EXCEPTION 'FAIL: trg_profiles_guard_privileged deve continuar BEFORE UPDATE';
END IF;
IF v_def NOT LIKE '%FOR EACH ROW%' THEN
  RAISE EXCEPTION 'FAIL: trg_profiles_guard_privileged deve continuar FOR EACH ROW';
END IF;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — COMPORTAMENTAL
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.workspaces (id, name, slug)
VALUES ('88080808-0808-4080-8080-808080808080', '080 WS', 'ws080')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_ws FROM public.workspaces WHERE slug = 'ws080';
IF v_ws IS NULL THEN
  RAISE EXCEPTION 'FAIL: nao foi possivel criar o workspace de teste';
END IF;

-- Cargo tecnico, para dar membership ativa ao alvo (a auditoria usa a
-- membership ativa para resolver o workspace do alvo).
SELECT id INTO v_role FROM public.roles WHERE slug = 'tec';
IF v_role IS NULL THEN
  RAISE EXCEPTION 'FAIL: role tec ausente (seeds da 036)';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('08080808-0808-4080-8080-808080808081',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '080-alvo@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"080 Alvo"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid FROM public.profiles WHERE email = '080-alvo@labhub.test';
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created nao criou o profile de 080-alvo@labhub.test';
END IF;

-- Conta ativa + membership ativa (contexto confiável: auth.uid() nulo, aceito
-- pela guarda da 067).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id = v_uid;
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
VALUES (v_uid, v_ws, v_role, 'active')
ON CONFLICT (profile_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

-- Limpa auditoria anterior deste alvo para medir só o que esta migration faz.
DELETE FROM public.app_audit_logs WHERE entity_id = v_uid::text;

-- 8. mudança de role => role_changed (+ meta) — escrita em contexto confiável.
UPDATE public.profiles SET role = 'viewer' WHERE id = v_uid;
SELECT count(*) INTO v_count FROM public.app_audit_logs
WHERE entity_id = v_uid::text AND action = 'role_changed'
  AND meta->>'prev_role' = 'technician' AND meta->>'new_role' = 'viewer';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL [8]: auditoria de role não foi gravada com o meta esperado (found %)', v_count;
END IF;

-- 9. mudança de status => status_changed (+ meta)
UPDATE public.profiles SET status = 'suspended' WHERE id = v_uid;
SELECT count(*) INTO v_count FROM public.app_audit_logs
WHERE entity_id = v_uid::text AND action = 'status_changed'
  AND meta->>'prev_status' = 'active' AND meta->>'new_status' = 'suspended';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL [9]: auditoria de status não foi gravada com o meta esperado (found %)', v_count;
END IF;
UPDATE public.profiles SET status = 'active' WHERE id = v_uid;

-- 10. mudança de is_super_admin => super_admin_toggled (+ meta)
UPDATE public.profiles SET is_super_admin = true WHERE id = v_uid;
SELECT count(*) INTO v_count FROM public.app_audit_logs
WHERE entity_id = v_uid::text AND action = 'super_admin_toggled'
  AND meta->>'prev' = 'false' AND meta->>'new_val' = 'true';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL [10]: auditoria de is_super_admin não foi gravada com o meta esperado (found %)', v_count;
END IF;
UPDATE public.profiles SET is_super_admin = false WHERE id = v_uid;
-- Remove as linhas do toggle para o passo 11 medir só o UPDATE neutro.
DELETE FROM public.app_audit_logs WHERE entity_id = v_uid::text;

-- 11. UPDATE sem campo sensível => nenhuma auditoria
UPDATE public.profiles SET name = '080 Alvo Renomeado' WHERE id = v_uid;
SELECT count(*) INTO v_count FROM public.app_audit_logs WHERE entity_id = v_uid::text;
IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL [11]: UPDATE neutro não deveria gerar auditoria (found % linhas)', v_count;
END IF;

-- 19. escrita que muda SÓ app_access: passa (sem erro de runtime) e não audita.
BEGIN
  UPDATE public.profiles SET app_access = '{"pc-care":"full"}'::jsonb WHERE id = v_uid;
EXCEPTION
  WHEN undefined_column THEN
    RAISE EXCEPTION 'FAIL [19]: UPDATE de app_access quebrou por dependencia de trigger — o DROP futuro seria inseguro';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL [19b]: UPDATE de app_access falhou: %', SQLERRM;
END;
SELECT count(*) INTO v_count FROM public.app_audit_logs WHERE entity_id = v_uid::text;
IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL [19c]: UPDATE de app_access nao deveria gerar auditoria (found % linhas)', v_count;
END IF;
UPDATE public.profiles SET app_access = '{}'::jsonb WHERE id = v_uid;

-- ── Autoridade: usuário comum ───────────────────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('08080808-0808-4080-8080-808080808082',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '080-comum@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"080 Comum"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid2 FROM public.profiles WHERE email = '080-comum@labhub.test';
IF v_uid2 IS NULL THEN
  RAISE EXCEPTION 'FAIL: profile de 080-comum@labhub.test nao foi criado';
END IF;

PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id = v_uid2;
-- Caller = o próprio usuário comum; o trigger da guarda passa a valer.
PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true);

-- 17. campo neutro => permitido
UPDATE public.profiles SET name = '080 Comum' WHERE id = v_uid2;

-- 12/13/14. autoelevação de privilégio => NEGADA (o que a 067 protegia e a 083 preserva)
BEGIN
  UPDATE public.profiles SET role = 'admin' WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [12]: usuario comum nao deveria trocar o proprio role';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

BEGIN
  UPDATE public.profiles SET status = 'rejected' WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [13]: usuario comum nao deveria trocar o proprio status';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

BEGIN
  UPDATE public.profiles SET is_super_admin = true WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [14]: usuario comum nao deveria se tornar super admin';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

-- 15/16. imutáveis => NEGADAS
BEGIN
  UPDATE public.profiles SET id = gen_random_uuid() WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [15]: profiles.id deve continuar imutavel em UPDATE normal';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

BEGIN
  UPDATE public.profiles SET workspace_ids = ARRAY['outro-ws']::uuid[] WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [16]: profiles.workspace_ids deve continuar imutavel em UPDATE normal';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

-- Confirma que nenhuma das tentativas acima foi gravada de fato.
SELECT role INTO v_name FROM public.profiles WHERE id = v_uid2;
IF v_name IS DISTINCT FROM 'viewer' THEN
  RAISE EXCEPTION 'FAIL: role do usuario comum foi alterado (guarda perdeu força)';
END IF;
IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid2 AND is_super_admin) THEN
  RAISE EXCEPTION 'FAIL: usuario comum virou super admin (guarda perdeu força)';
END IF;
IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid2 AND status <> 'active') THEN
  RAISE EXCEPTION 'FAIL: status do usuario comum foi alterado (guarda perdeu força)';
END IF;

-- Restaura o contexto do GUC para não vazar para os testes seguintes do STEP 6.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

-- Limpeza das linhas de auditoria criadas por este harness.
DELETE FROM public.app_audit_logs WHERE entity_id IN (v_uid::text, v_uid2::text);

RAISE NOTICE 'OK: 080 decouple profiles.app_access from triggers checks passed';
END $$;
