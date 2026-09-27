-- =============================================================================
-- tests/053_disable_legacy_sync.sql
-- =============================================================================
-- Asserções da Fase 9.3-C (migration 053): sincronização legada desligada.
--  1. Trigger trg_profiles_sync_memberships NÃO existe em public.profiles.
--  2. Função sync_user_memberships(uuid) REMOVIDA (estado final pós-067).
--  3. handle_new_user() NÃO referencia workspace_ids (DEFAULT cobre).
--  4. Trigger on_auth_user_created ainda existe (signup cria perfil pendente).
--  5. Espelho 052 REMOVIDO do estado final (admin_set_user_memberships não
--     existe mais; PR-3/#296 + migration 075). A 053 em si não foi reescrita.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 053 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 053 legacy sync disabled checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN

-- ── 1. Trigger legada removida ────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
WHERE nsp.nspname = 'public'
  AND c.relname = 'profiles'
  AND t.tgname = 'trg_profiles_sync_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: trg_profiles_sync_memberships still present (expected 0, found %)', v_count;
END IF;

-- ── 2. Função REMOVIDA (estado final pós-067 trust boundary) ─────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'sync_user_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: sync_user_memberships function must be REMOVED post-067 (found %)', v_count;
END IF;

-- ── 3. handle_new_user sem a coluna ───────────────────────────────────────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'handle_new_user';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: handle_new_user function is missing';
END IF;
IF v_def LIKE '%workspace_ids%' THEN
  RAISE EXCEPTION 'FAIL: handle_new_user must not reference workspace_ids';
END IF;

-- ── 4. Trigger de signup preservada ───────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
WHERE nsp.nspname = 'auth'
  AND c.relname = 'users'
  AND t.tgname = 'on_auth_user_created';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created must exist (expected 1, found %)', v_count;
END IF;

-- ── 5. Espelho 052: REMOVIDO do estado final (PR-3/#296, migration 075) ──────
--     Quando a 053 foi escrita, o espelho via 052 era o escritor legítimo de
--     workspace_ids. O RBAC 2.0 (072) assumiu a configuração de acesso e a 052
--     foi removida; a coluna segue existindo como espelho de compatibilidade,
--     agora recomputada pela 072.
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_set_user_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: admin_set_user_memberships (052) must be REMOVED post-075 (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 053 legacy sync disabled checks passed';
END $$;
