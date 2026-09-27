-- =============================================================================
-- tests/076_rbac2_can_manage_workspace_apps.sql
-- =============================================================================
-- #296 (PR-4A) — asserções da migration 076: a helper
-- `can_manage_workspace_apps(uuid)` deixou de ter `profiles.role` como
-- autoridade e passou a resolver a Action `admin.app.purge` via
-- memberships + role_permissions, preservando `is_super_admin()`.
--
--  1. a helper existe, com a MESMA assinatura `uuid`;
--  2. continua `SECURITY DEFINER` com `search_path` fixo (exigido pela 031);
--  3. `is_super_admin()` continua presente (bypass global preservado);
--  4. a Action `admin.app.purge` está na lógica, com escopo `workspace`;
--  5. a estrutura RBAC 2.0 está presente (memberships + role_permissions);
--  6. a membership é amarrada à unidade (`m.workspace_id = p_ws`) e exigida
--     como ativa (`m.status = 'active'`);
--  7. `profiles.role` NÃO é mais consultado pela helper;
--  8. as 4 policies consumidoras continuam apontando para a helper;
--  9. a Action `admin.app.purge` está de fato semeada para alguma role
--     (a 036 semeou para `adm`) — a helper não aponta para Action órfã.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 076 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 076 can_manage_workspace_apps RBAC 2.0 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN

-- ── 1. Helper existe com a assinatura uuid ────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'can_manage_workspace_apps'
  AND pg_get_function_identity_arguments(p.oid) = 'p_ws uuid';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: can_manage_workspace_apps(uuid) must exist exactly once (found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_manage_workspace_apps';

-- ── 2. SECURITY DEFINER + search_path travado (contrato da 031) ───────────────
IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: can_manage_workspace_apps must be SECURITY DEFINER';
END IF;
-- pg_get_functiondef normaliza o SET conforme a versão do PG
IF v_def NOT LIKE '%SET search_path = public%'
   AND v_def NOT LIKE '%SET search_path TO %public%' THEN
  RAISE EXCEPTION 'FAIL: can_manage_workspace_apps must pin search_path=public';
END IF;

-- ── 3. Bypass de Super Admin preservado ───────────────────────────────────────
IF v_def NOT LIKE '%is_super_admin()%' THEN
  RAISE EXCEPTION 'FAIL: is_super_admin() bypass must be preserved';
END IF;

-- ── 4. Action `admin.app.purge` no escopo workspace ───────────────────────────
IF v_def NOT LIKE '%admin.app.purge%' THEN
  RAISE EXCEPTION 'FAIL: helper must resolve the Action admin.app.purge';
END IF;
IF v_def NOT LIKE '%scope = ''workspace''%' AND v_def NOT LIKE '%scope=''workspace''%' THEN
  RAISE EXCEPTION 'FAIL: Action must be resolved at scope workspace';
END IF;

-- ── 5. Estrutura RBAC 2.0 (memberships + role_permissions) ───────────────────
IF v_def NOT LIKE '%public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: helper must read public.memberships';
END IF;
IF v_def NOT LIKE '%public.role_permissions%' THEN
  RAISE EXCEPTION 'FAIL: helper must read public.role_permissions';
END IF;
IF v_def NOT LIKE '%rp.role_id = m.role_id%' THEN
  RAISE EXCEPTION 'FAIL: role_permissions must be joined through memberships.role_id';
END IF;
IF v_def NOT LIKE '%m.profile_id = auth.uid()%' THEN
  RAISE EXCEPTION 'FAIL: membership must be resolved for the caller (auth.uid())';
END IF;

-- ── 6. Vínculo com a unidade + membership ativa ───────────────────────────────
IF v_def NOT LIKE '%m.workspace_id = p_ws%' THEN
  RAISE EXCEPTION 'FAIL: membership must be bound to the evaluated workspace (p_ws)';
END IF;
IF v_def NOT LIKE '%m.status = ''active''%' AND v_def NOT LIKE '%m.status=''active''%' THEN
  RAISE EXCEPTION 'FAIL: only an ACTIVE membership may grant access';
END IF;

-- ── 7. profiles.role NÃO é mais autoridade ───────────────────────────────────
--     Regex com fronteira: um LIKE '%p.role%' casaria por engano com
--     `rp.role_id` (o JOIN do próprio RBAC 2.0). O alias precisa vir
--     precedido por um caractere que NÃO seja letra/dígito/underscore.
IF v_def LIKE '%profiles.role%'
   OR v_def ~ '(^|[^a-zA-Z0-9_])(p|pr)\.role([^a-zA-Z0-9_]|$)'
   OR v_def LIKE '%role = ''admin''%' THEN
  RAISE EXCEPTION 'FAIL: helper must not authorize via profiles.role';
END IF;
-- Sanidade do regex acima: `rp.role_id` NÃO pode ser considerado profiles.role.
IF v_def LIKE '%rp.role_id%' AND v_def ~ '(^|[^a-zA-Z0-9_])p\.role([^a-zA-Z0-9_]|$)' THEN
  RAISE EXCEPTION 'FAIL: boundary regex is matching rp.role_id (false positive)';
END IF;

-- ── 8. As 4 policies continuam consumindo a helper ───────────────────────────
SELECT count(*) INTO v_count
FROM pg_policies pol
JOIN pg_class c ON c.relname = pol.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE pol.schemaname = 'public'
  AND pol.tablename IN ('workspace_app_settings', 'app_data_backups')
  AND (pol.qual LIKE '%can_manage_workspace_apps%'
       OR pol.with_check LIKE '%can_manage_workspace_apps%');

IF v_count < 4 THEN
  RAISE EXCEPTION 'FAIL: expected 4 policies routed through can_manage_workspace_apps (found %)', v_count;
END IF;

-- ── 9. A Action não pode ser órfã (a 036 semeou `admin.app.purge` p/ `adm`) ──
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'admin.app.purge'
  AND rp.scope = 'workspace';

IF v_count < 1 THEN
  RAISE EXCEPTION 'FAIL: no role grants admin.app.purge@workspace (helper would never allow non-super-admins)';
END IF;

RAISE NOTICE 'OK: 076 can_manage_workspace_apps RBAC 2.0 checks passed';
END $$;
