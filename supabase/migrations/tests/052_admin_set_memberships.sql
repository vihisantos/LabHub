-- =============================================================================
-- tests/052_admin_set_memberships.sql
-- =============================================================================
-- ESTADO FINAL PÓS-PR-3 (#296) — a 052 foi REMOVIDA do estado final do banco.
--
-- Histórico deste arquivo: validava a Fase 9.2-C (migration 052), affirming
-- que `admin_set_user_memberships(uuid, uuid[], text)` EXISTIA. O PR-3 removeu
-- o último consumidor interno e a migration 075 derrubou a função, então as
-- asserções foram INVERTIDAS: hoje este arquivo é a trava de regressão que
-- impede a 052 de voltar.
--
-- A migration 052 em si NÃO foi alterada: ela continua no histórico (e é
-- aplicada na sequência), apenas sua presença no estado final é proibida.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 075 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 052 removida do estado final (checks passed)".
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN

-- ── 1. A função NÃO existe mais (qualquer sobrecarga) ────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: admin_set_user_memberships must be REMOVED post-075 (found % overload(s))', v_count;
END IF;

-- ── 2. A assinatura exata também não existe ──────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_ids uuid[], p_role_slug text';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: 052 signature (uuid, uuid[], text) still present (found %)', v_count;
END IF;

-- ── 3. Nenhum resto de ACL/dependência ativa da 052 ──────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships';

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: stale grants on admin_set_user_memberships (found %)', v_count;
END IF;

-- ── 4. O caminho vigente (072) está de pé — a remoção não pode vir sem sucessor
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager');

IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: the 072 successors must exist (expected 3, found %)', v_count;
END IF;

RAISE NOTICE 'OK: 052 removida do estado final (checks passed)';
END $$;
