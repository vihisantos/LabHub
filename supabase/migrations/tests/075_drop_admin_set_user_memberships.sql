-- =============================================================================
-- tests/075_drop_admin_set_user_memberships.sql
-- =============================================================================
-- #296 (PR-3) — asserções da migration 075: o caminho runtime da 052 sai do
-- estado final do banco, e o caminho vigente (072) permanece intacto.
--
--  1. `admin_set_user_memberships` NÃO existe (nenhuma sobrecarga).
--  2. A assinatura exata (uuid, uuid[], text) NÃO existe.
--  3. As três RPCs 072 continuam existindo (o sucessor não pode sumir junto).
--  4. As 072 continuam restritas a service_role (anon/PUBLIC/authenticated
--     sem EXECUTE) — a remoção da 052 não pode ter-afrouxado a ACL.
--  5. `profiles.workspace_ids` continua existindo (espelho de compatibilidade
--     preservado: este PR remove a dependência da 052, não a coluna).
--  6. A tabela memberships segue intacta (a 075 não mexe em dados).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 075 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 075 drop admin set user memberships checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN

-- ── 1. A 052 não existe (por nome, sem depender de assinatura) ────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: admin_set_user_memberships must be gone (found %)', v_count;
END IF;

-- ── 2. A assinatura explícita da 052 não existe ──────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_ids uuid[], p_role_slug text';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: 052 signature still present (found %)', v_count;
END IF;

-- ── 3. Sucessores 072 intactos ───────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager');

IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: 072 RPCs must all exist (expected 3, found %)', v_count;
END IF;

-- ── 4. ACL das 072: só service_role executa ──────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager')
  AND g.grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND g.privilege_type = 'EXECUTE';

IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC/authenticated must not execute the 072 RPCs (found %)', v_count;
END IF;

-- ── 5. profiles.workspace_ids preservado (espelho legado de compatibilidade) ──
SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'workspace_ids';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: profiles.workspace_ids must be preserved (expected 1, found %)', v_count;
END IF;

-- ── 6. memberships intacta ───────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'memberships';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: public.memberships must be preserved (expected 1, found %)', v_count;
END IF;

RAISE NOTICE 'OK: 075 drop admin set user memberships checks passed';
END $$;
