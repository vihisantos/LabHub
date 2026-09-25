-- =============================================================================
-- tests/071_coordinator_members.sql
-- =============================================================================
-- Asserções da Fase 11 (migration 071): membros ATIVOS na área do coordenador.
--  1. Função existe: coordinator_get_members(uuid).
--  2. Leitura fail-closed: SECURITY DEFINER + search_path público + autorização
--     por is_coordinator_of (047, auth.uid()); filtra `status = 'active'` e
--     NÃO filtra `managed_by IS NOT NULL` (membros sem responsável devem voltar).
--  3. Linha vermelha: exclui adm/coordinator pelo slug do cargo.
--  4. Projeção de perfil embutida (RLS 044): todos os campos da 066 presentes.
--  5. ACL: somente authenticated; anon/PUBLIC revogado.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 071 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 071 coordinator members checks passed".
--
-- Behavior checks (o que retorna por sessão/escopo) dependem de sessão
-- autenticada — execute adicionalmente como usuário autenticado em staging via
-- scripts/validate_rbac2_coordinator_071_dev.py; aqui os checks são
-- estruturais/catálogo.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
  v_t     record;
BEGIN

-- ── 1. A função da Fase 11 existe ────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_members';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members function drifted (expected 1, found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_get_members';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members function is missing';
END IF;

-- ── 2. Fail-closed: SECURITY DEFINER + search_path público + autorização ─────
IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must be SECURITY DEFINER';
END IF;
IF v_def NOT LIKE '%search_path%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must pin search_path (public)';
END IF;
IF v_def NOT LIKE '%public.is_coordinator_of(%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members does not authorize by is_coordinator_of (047)';
END IF;
IF v_def NOT LIKE '%m.status = ''active''%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must read only active memberships';
END IF;

-- Membros sem responsável (managed_by = NULL) DEVEM voltar: o RPC não pode
-- filtrar por managed_by IS NOT NULL (é exatamente o furo que a Fase 11 fecha).
IF v_def LIKE '%managed_by IS NOT NULL%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must NOT filter out managed_by = NULL members';
END IF;
-- Deve selecionar a coluna managed_by na projeção (resolução de responsável).
IF v_def NOT LIKE '%m.managed_by%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must project managed_by';
END IF;

-- ── 3. Linha vermelha: adm/coordinator excluídos pelo slug ───────────────────
IF v_def NOT LIKE '%NOT IN (''adm'', ''coordinator'')%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_get_members must exclude adm/coordinator memberships (red line)';
END IF;

-- ── 4. Projeção de perfil (RLS 044): mesmos campos da 066 ────────────────────
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

-- ── 5. ACL: somente authenticated; anon/PUBLIC revogado ──────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public'
  AND p.proname = 'coordinator_get_members'
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC can execute coordinator_get_members — must be revoked (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 071 coordinator members checks passed';

END $$;