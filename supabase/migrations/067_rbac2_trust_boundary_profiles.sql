-- =============================================================================
-- 067_rbac2_trust_boundary_profiles.sql
-- =============================================================================
-- RBAC 2.0 - FASE 5.1 (TRUST BOUNDARY): fecha as DUAS vulnerabilidades
-- criticas apontadas pela auditoria integrada, sem tocar em nenhuma outra
-- superficie (nao mexe em /admin, CoordinatorHome, managed_by, workspace_ids
-- como fonte, app_audit_logs, RPCs 065/066 nem workflows).
--
--   (1) AUTOELEVACAO via `profiles_update` (028:118-125)
--       A policy permitia `auth.uid() = id` sem WITH CHECK e sem protecao de
--       colunas. Um usuario autenticado comum podia gravar na propria linha
--       `is_super_admin = true`, `role = 'admin'/'coordinator'`, `status`
--       (autoaprovacao) e `app_access`, e ainda trocar o `id` da linha.
--       RLS "USING" decide a LINHA, nao compara coluna com a linha antiga;
--       por isso a autoridade passa a ser um TRIGGER BEFORE UPDATE que compara
--       OLD/NEW e e fail-closed. A policy UPDATE e recriada com WITH CHECK
--       (defesa em profundidade: `id` nao muda por uma sessao comum).
--
--   (2) `public.sync_user_memberships(uuid)` ainda executavel por authenticated
--       (041:60-162, redefinida pela 045). Mesmo com o trigger legado desligado
--       pela 053, a funcao SECURITY DEFINER continuava exposta e reescrevia /
--       APAGAVA memberships de QUALQUER perfil a partir do legado
--       (`profiles.role/status/workspace_ids/is_super_admin`). Nao ha consumidor
--       legitimo (frontend/backend/API/scripts). A funcao e o wrapper de trigger
--       sao REMOVIDOS; `memberships` segue fonte unica do RBAC 2.0 e nenhum
--       reconcile legado e recriado.
--
-- Invariantes apos esta migration:
--   - `id` e `workspace_ids` sao IMUTAVEIS em UPDATE normal para todos os
--     atores autenticados, INCLUSIVE Super Admin; so contexto confiavel
--     (auth.uid() IS NULL: service_role/backend) os altera. `memberships`
--     segue a unica fonte de autorizacao de workspace e `workspace_ids` fica
--     apenas como compatibilidade legado (escritor legitimo: RPC 052).
--   - Usuario autenticado comum NUNCA altera `is_super_admin`, `role`,
--     `status` nem `app_access`.
--   - Super Admin (`public.is_super_admin()`) PODE alterar `is_super_admin`,
--     `role`, `status` e `app_access` (fluxo /admin), mas NAO `id`/
--     `workspace_ids`.
--   - Campos de perfil legitimos (name/banner/avatar/accent/theme_variant/...)
--     seguem editaveis por `auth.uid()`.
--   - Contextos confiaveis (service_role/backend e signup handle_new_user, sem
--     `auth.uid()`) NAO sao afetados.
--
-- IDEMPOTENCIA: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE;
-- DROP TRIGGER IF EXISTS; DROP FUNCTION IF EXISTS. Replay seguro.
--
-- Requer 019, 028, 041, 042, 045 e 053 aplicadas.
-- =============================================================================

-- =============================================================================
-- 1. Guarda de colunas privilegiadas em profiles (autoridade real)
--
--    BEFORE UPDATE, SECURITY DEFINER, search_path fixo, fail-closed. Ordem:
--      a) `auth.uid() IS NULL` (service_role/backend, signup) => permitido;
--      b) `id` e `workspace_ids` imutaveis => negados para QUALQUER ator com
--         `auth.uid()` (inclusive Super Admin);
--      c) Super Admin => permitido para is_super_admin/role/status/app_access;
--      d) usuario comum => negado para is_super_admin/role/status/app_access.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contexto confiavel: service_role/backend ou signup (GoTrue) nao apresentam
  -- `auth.uid()`. Nao e alvo desta guarda (o RLS/service key ja e a autoridade).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Identidade imutavel: `id` nunca muda em UPDATE normal, para ninguem
  -- (nem usuario comum nem Super Admin) - apenas contexto confiavel (acima).
  -- FKs de profiles.id sao ON DELETE CASCADE/SET NULL (sem ON UPDATE CASCADE).
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable in normal UPDATE'
      USING ERRCODE = '42501';
  END IF;

  -- RBAC 2.0: `memberships` e a fonte de autorizacao; `workspace_ids` e apenas
  -- espelho/compatibilidade legado. Imutavel em UPDATE normal, inclusive para
  -- Super Admin; o unico escritor legitimo e a RPC 052 (service_role).
  IF NEW.workspace_ids IS DISTINCT FROM OLD.workspace_ids THEN
    RAISE EXCEPTION 'profiles.workspace_ids is immutable in normal UPDATE'
      USING ERRCODE = '42501';
  END IF;

  -- Super Admin mantem a edicao administrativa dos demais campos
  -- (is_super_admin/role/status/app_access) de qualquer perfil.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Usuario comum: proibido mexer em campos de privilegio global.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.role         IS DISTINCT FROM OLD.role
     OR NEW.status       IS DISTINCT FROM OLD.status
     OR NEW.app_access   IS DISTINCT FROM OLD.app_access THEN
    RAISE EXCEPTION
      'alteracao de campo privilegiado do proprio perfil nao e permitida'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_privileged_columns() IS
  'RBAC 2.0 Fase 5.1: `id` e `workspace_ids` imutaveis em UPDATE normal '
  '(inclusive Super Admin); Super Admin edita is_super_admin/role/status/'
  'app_access; usuario comum nao edita campos de privilegio; contexto '
  'confiavel (auth.uid() NULL: service_role/signup) preservado.';

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- =============================================================================
-- 2. profiles_update com WITH CHECK (defesa em profundidade no RLS)
--    O `USING` segue decidindo a linha visivel; o `WITH CHECK` garante que o
--    resultado do UPDATE continua sendo a propria linha (`auth.uid() = id`) ou
--    um alvo legitimo de super admin. Sem isso, o RLS nao impedia trocar `id`.
-- =============================================================================

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_super_admin()
  );

-- =============================================================================
-- 3. Remocao do primitivo legado de sync de memberships
--    Sem trigger ativo desde a 053 e sem consumidor em runtime. Removemos o
--    wrapper e a funcao parametrizada. Nao recriamos nenhum reconcile legado.
-- =============================================================================

DROP FUNCTION IF EXISTS public.trg_sync_user_memberships();
DROP FUNCTION IF EXISTS public.sync_user_memberships(uuid);
