-- =============================================================================
-- 049_rbac2_user_belongs_to_workspace_memberships.sql
-- =============================================================================
-- RBAC 2.0 — Fase 9.1-B: unificar `user_belongs_to_workspace()` para ler
-- `memberships` (status = 'active') como fonte de verdade, em vez de
-- `profiles.workspace_ids` (legado).
--
-- Por que:
--   - Audit 9.0: a autoridade do helper (workspace_ids) divergia do RBAC 2.0
--     (memberships). O trigger 041 mantém os dois sincronizados no caminho
--     legado, então o fluxo normal não muda; apenas os casos de drift que eram
--     o problema (UUID morto, membership suspensa/removida/pendente) passam a
--     ser capturados.
--   - Propagação automática: SECURITY DEFINER → dezenas de policies
--     workspace-scoped (027/028/033/036/044) passam a decidir por memberships
--     sem re-criação.
--
-- Semântica preservada:
--   - Super admin continua sendo tratado PELAS policies
--     (`is_super_admin() OR user_belongs_to_workspace(...)`); a função em si
--     NÃO concede bypass (Invariante 3).
--   - status = 'active' → true. pending/suspended/removed ou sem membership →
--     false (fail-closed; Invariante 2). NULL/'' → false.
--   - SECURITY DEFINER com dono que tem BYPASSRLS (postgres no DEV/PROD):
--     a leitura interna de public.memberships NÃO re-dispara as policies de
--     memberships. A ausência de recursão é PROVA DE TESTE REAL no DEV
--     (scripts/validate_rbac2_ubtw_049_dev.py), não afirmação teórica.
--
-- ACL (drift encontrado no DEV):
--   O desenho (rascunho v2 §3.5) supunha "ACL inalterada — já REVOKE
--   anon/PUBLIC + GRANT authenticated no 033". Na prática o DEV tinha
--   `=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres`,
--   ou seja, PUBLIC (=) e anon COM EXECUTE. A 049 corrige para o padrão do
--   repo (044): REVOKE anon/PUBLIC, GRANT authenticated + service_role.
-- =============================================================================

-- ─── Sobrecarga uuid (colunas uuid: workspaces, assets, memberships, ...) ───
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.profile_id = auth.uid()
         AND m.workspace_id = ws_id
         AND m.status = 'active'
     )
$$;

-- ─── Sobrecarga text (colunas legadas text: stock.notifications, ...) ───────
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND ws_id <> ''
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.profile_id = auth.uid()
         AND m.workspace_id::text = ws_id
         AND m.status = 'active'
     )
$$;

-- ─── ACL: sem anon/PUBLIC; authenticated + service_role (lição 028; 044) ─────
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) TO service_role;

COMMENT ON FUNCTION public.user_belongs_to_workspace(uuid) IS
  'RBAC 2.0 (049): true somente se auth.uid() tem membership ACTIVE no workspace (overload uuid). SECURITY DEFINER; dono tem BYPASSRLS, então a leitura interna de memberships não re-dispara as policies (sem recursão RLS). Super admin é tratado pelas policies (is_super_admin() OR helper).';

COMMENT ON FUNCTION public.user_belongs_to_workspace(text) IS
  'RBAC 2.0 (049): idem overload text (colunas legadas text, ex. stock.notifications.workspace_id).';