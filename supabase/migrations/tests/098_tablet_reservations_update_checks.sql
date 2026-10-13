-- =============================================================================
-- tests/098_tablet_reservations_update_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS para a migration 098 (Issue #388): a policy
-- `tablet_reservations_update` passa a exigir que `horario_fim` ainda não
-- tenha passado, SEM enfraquecer a autorização vigente (050 + 078):
--   · bypass explícito de super admin (`is_super_admin()`);
--   · isolamento por workspace (`user_belongs_to_workspace`);
--   · checagem RBAC 2.0 (`user_can_cancel_tablet_reservation`).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 098 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 098 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_qual  text;
  v_check text;
  v_roles name[];
  v_cmd   text;
BEGIN

-- ── 1. A policy existe exatamente uma vez e é FOR UPDATE ────────────────────
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: esperado 1 policy tablet_reservations_update; encontrado %', v_count;
END IF;

SELECT qual, with_check, roles, cmd
  INTO v_qual, v_check, v_roles, v_cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update';

IF v_cmd <> 'UPDATE' THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update deve ser FOR UPDATE (cmd=%)', v_cmd;
END IF;

-- Papel preservado (050/078): a policy é destinada a `authenticated`.
IF NOT ('authenticated' = ANY (v_roles)) THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update deve ser TO authenticated (roles=%)', v_roles;
END IF;

-- ── 2. Regra temporal presente em USING (OLD) e WITH CHECK (NEW) ────────────
IF v_qual IS NULL OR v_qual NOT ILIKE '%horario_fim%' OR v_qual NOT ILIKE '%now()%' THEN
  RAISE EXCEPTION 'FAIL: USING sem a regra temporal (horario_fim > now()): %', v_qual;
END IF;

IF v_check IS NULL OR v_check NOT ILIKE '%horario_fim%' OR v_check NOT ILIKE '%now()%' THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK sem a regra temporal (horario_fim > now()): %', v_check;
END IF;

-- ── 3. Os três pilares de autorização continuam na policy ───────────────────
IF v_qual NOT ILIKE '%is_super_admin%' OR v_check NOT ILIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: bypass de super admin (is_super_admin) removido da policy';
END IF;

IF v_qual NOT ILIKE '%user_belongs_to_workspace%' OR v_check NOT ILIKE '%user_belongs_to_workspace%' THEN
  RAISE EXCEPTION 'FAIL: isolamento por workspace (user_belongs_to_workspace) removido da policy';
END IF;

IF v_qual NOT ILIKE '%user_can_cancel_tablet_reservation%'
   OR v_check NOT ILIKE '%user_can_cancel_tablet_reservation%' THEN
  RAISE EXCEPTION 'FAIL: checagem RBAC 2.0 (user_can_cancel_tablet_reservation) removida da policy';
END IF;

-- ── 4. A policy não pode conter um ramo temporal solto/permissivo ────────────
--    A única forma prevista é a conjunção dentro do ramo autorizado; um
--    `OR horario_fim > now()` global (sem workspace/RBAC) seria fail-open.
IF v_qual ~* 'or\s+\(?\s*horario_fim\s*>' THEN
  RAISE EXCEPTION 'FAIL: USING com ramo temporal permissivo fora da autorização: %', v_qual;
END IF;
IF v_check ~* 'or\s+\(?\s*horario_fim\s*>' THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK com ramo temporal permissivo fora da autorização: %', v_check;
END IF;

RAISE NOTICE 'OK: 098 checks passed';

END $$;
