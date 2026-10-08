-- =============================================================================
-- tests/089_coordinator_profiles_avatar_banner.sql
-- =============================================================================
-- Asserções da migration 089: avatar/banner do perfil projetados nas RPCs de
-- listagem do coordenador (cards de perfil da aba Pessoal).
--  1. As 3 funções existem: coordinator_get_requests / _get_inactive_members /
--     _get_members (uuid).
--  2. Leitura fail-closed: SECURITY DEFINER + search_path público + autorização
--     por is_coordinator_of (047, auth.uid()); filtros de status preservados
--     (pending / suspended+removed / active) e linha vermelha adm/coordinator.
--  3. Projeção de perfil: TODOS os campos da 066/071 presentes + os NOVOS
--     `profile_avatar`/`profile_banner` (089).
--  4. ACL: somente authenticated; anon/PUBLIC revogado.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 089 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 089 coordinator profiles avatar/banner checks passed".
--
-- Behavior checks (o que retorna por sessão/escopo) dependem de sessão
-- autenticada — execute adicionalmente como usuário autenticado em staging;
-- aqui os checks são estruturais/catálogo.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN

-- ── 1. As 3 funções existem (uma definição cada) ─────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_requests';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests drifted (expected 1, found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_inactive_members';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_inactive_members drifted (expected 1, found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_members';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members drifted (expected 1, found %)', v_count;
END IF;

-- ── 2. coordinator_get_requests: fail-closed + status + projeção com 089 ─────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_requests';

IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests must be SECURITY DEFINER';
END IF;
IF v_def NOT LIKE '%search_path%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests must pin search_path (public)';
END IF;
IF v_def NOT LIKE '%public.is_coordinator_of(%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests does not authorize by is_coordinator_of (047)';
END IF;
IF v_def NOT LIKE '%m.status = ''pending''%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests must read only pending memberships';
END IF;
IF v_def NOT LIKE '%profile_avatar%' OR v_def NOT LIKE '%profile_banner%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_requests must project profile_avatar/profile_banner (089)';
END IF;

-- ── 3. coordinator_get_inactive_members: fail-closed + status + projeção ─────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_inactive_members';

IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_inactive_members must be SECURITY DEFINER';
END IF;
IF v_def NOT LIKE '%public.is_coordinator_of(%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_inactive_members does not authorize by is_coordinator_of (047)';
END IF;
IF v_def NOT LIKE '%m.status IN (''suspended'', ''removed'')%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_inactive_members must read only suspended/removed memberships';
END IF;
IF v_def NOT LIKE '%profile_avatar%' OR v_def NOT LIKE '%profile_banner%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_inactive_members must project profile_avatar/profile_banner (089)';
END IF;

-- ── 4. coordinator_get_members: fail-closed + linha vermelha + projeção ──────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_members';

IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must be SECURITY DEFINER';
END IF;
IF v_def NOT LIKE '%public.is_coordinator_of(%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members does not authorize by is_coordinator_of (047)';
END IF;
IF v_def NOT LIKE '%m.status = ''active''%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must read only active memberships';
END IF;
IF v_def LIKE '%managed_by IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must NOT filter out managed_by = NULL members';
END IF;
IF v_def NOT LIKE '%NOT IN (''adm'', ''coordinator'')%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must exclude adm/coordinator memberships (red line)';
END IF;
IF NOT (
  v_def LIKE '%membership_id%' AND v_def LIKE '%profile_id%'
  AND v_def LIKE '%workspace_id%' AND v_def LIKE '%role_id%'
  AND v_def LIKE '%status%' AND v_def LIKE '%created_at%'
  AND v_def LIKE '%updated_at%' AND v_def LIKE '%profile_name%'
  AND v_def LIKE '%profile_email%' AND v_def LIKE '%profile_status%'
  AND v_def LIKE '%profile_role%'
) THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must project the profile fields needed by the UI (RLS 044)';
END IF;
IF v_def NOT LIKE '%profile_avatar%' OR v_def NOT LIKE '%profile_banner%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must project profile_avatar/profile_banner (089)';
END IF;

-- ── 5. ACL: anon/PUBLIC não pode executar nenhuma das 3 ──────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public'
  AND p.proname IN ('coordinator_get_requests', 'coordinator_get_inactive_members', 'coordinator_get_members')
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC can execute coordinator projections — must be revoked (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 089 coordinator profiles avatar/banner checks passed';

END $$;
