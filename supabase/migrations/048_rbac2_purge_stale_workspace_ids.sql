-- =============================================================================
-- 048_rbac2_purge_stale_workspace_ids.sql
-- =============================================================================
-- RBAC 2.0 — FASE 9.1-A: PURGE DE UUIDs FANTASMAS em profiles.workspace_ids.
--
-- Contexto (auditoria 9.0, classe de drift 5.1; design 9.1 §2 aprovado):
--   profiles.workspace_ids é UUID[] SEM FK para workspaces(id). Ao excluir um
--   workspace, memberships e demais tabelas workspace-scoped são removidas por
--   CASCADE, mas o ARRAY do profile NÃO é limpo — o UUID morto permanece e
--   continua alimentando user_belongs_to_workspace() e as ~40 policies que dela
--   dependem (resultado: RLS abre, RBAC engine nega — divergência de autoridade
--   e workspace morto na UI).
--
-- Solução aprovada (design §2.4, alternativa A):
--   Trigger AFTER DELETE em public.workspaces que remove os UUIDs excluídos de
--   profiles.workspace_ids.
--
--   - FOR EACH STATEMENT + REFERENCING OLD TABLE (transition table):
--     A proposta textual do design (§2.5) usava "OLD.id" num trigger de
--     STATEMENT, o que NÃO é válido no PostgreSQL (OLD só existe em FOR EACH
--     ROW). Correção aqui: transition table cobrindo TODOS os workspaces
--     excluídos no mesmo statement (inclui DELETE ... WHERE id IN (...)), sem
--     erro de "row update multiply".
--   - SECURITY DEFINER + search_path = public (owner = dono da migration) para
--     os UPDATEs em profiles rodarem ignorando RLS (mesmo padrão 033/041/045).
--   - EXECUTE concedido a authenticated (o DELETE de workspace pelo admin via
--     frontend roda sob o JWT) E a service_role (backend/isso cobre a lição
--     039/040: trigger não dispara sem EXECUTE para o usuário do DML).
--
-- LIMITES EXPLÍCITOS (aprovado na revisão do design):
--   - NÃO altera memberships (CASCADE + trigger 038/041 já cuidam).
--   - NÃO altera managed_by (045: ON DELETE SET NULL + guarda 046 preservados).
--   - NÃO modifica o trigger 041/045 existente.
--   - Sem backfill de stale PRÉ-EXISTENTE (dados anteriores à 048 ficam para
--     decisão separada; esta migration impede NOVOS drifts).
--
-- Interação 048 × 041 (garantida e validada no DEV):
--   A limpeza faz UPDATE em profiles.workspace_ids → dispara
--   trg_profiles_sync_memberships (041), que recalcula memberships sob o owner
--   (DEFINER). O UUID exterminado NÃO gera membership nova (041 filtra com
--   WHERE EXISTS (public.workspaces) e as linhas já foram CASCADE). Sem
--   recursão: nada em 041 volta a escrever em workspaces.
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE / DROP IF EXISTS / REVOKE/GRANT — replay
-- seguro pelo runner.
-- Rollback: DROP TRIGGER trg_workspaces_purge_workspace_ids ON public.workspaces;
--           DROP FUNCTION public.trg_purge_workspace_ids();
-- =============================================================================

-- =============================================================================
-- 1. Função de purga (statement-level, transition table)
-- =============================================================================
-- A transição antiga (_deleted) contém todos os workspaces removidos no
-- statement. Para cada profile cujo array contenha algum deles, reconstruímos
-- o array na ordem original excluindo os UUIDs mortos (array_remove em loop
-- falharia por "UPDATE same row twice" quando um profile referencia mais de um
-- workspace excluído no MESMO statement — ex.: workspace_ids = [A, C]).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_purge_workspace_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
     SET workspace_ids = COALESCE(
           (
             SELECT array_agg(t.ws ORDER BY t.ord)
               FROM unnest(p.workspace_ids) WITH ORDINALITY AS t(ws, ord)
              WHERE NOT EXISTS (
                SELECT 1 FROM deleted_workspaces d WHERE d.id = t.ws
              )
           ),
           ARRAY[]::uuid[]
         ),
         updated_at = now()
   WHERE EXISTS (
     SELECT 1 FROM deleted_workspaces d
      WHERE d.id = ANY (COALESCE(p.workspace_ids, ARRAY[]::uuid[]))
   );
  RETURN NULL;
END;
$$;

-- =============================================================================
-- 2. Trigger — AFTER DELETE FOR EACH STATEMENT com transition table
-- =============================================================================

DROP TRIGGER IF EXISTS trg_workspaces_purge_workspace_ids ON public.workspaces;
CREATE TRIGGER trg_workspaces_purge_workspace_ids
  AFTER DELETE ON public.workspaces
  REFERENCING OLD TABLE AS deleted_workspaces
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_purge_workspace_ids();

-- =============================================================================
-- 3. Permissões — o trigger roda no contexto do usuário que executou o DELETE
--    (lição 039/040). anon/PUBLIC não podem invocar.
-- =============================================================================

REVOKE ALL ON FUNCTION public.trg_purge_workspace_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_purge_workspace_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.trg_purge_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_purge_workspace_ids() TO service_role;

COMMENT ON FUNCTION public.trg_purge_workspace_ids() IS
  'RBAC 2.0 (048): purge de UUIDs fantasma em profiles.workspace_ids quando um workspace é excluído. '
  'AFTER DELETE FOR EACH STATEMENT com transition table (cobre DELETE de múltiplos workspaces no mesmo statement). '
  'SECURITY DEFINER (dono da migration); não mexe em memberships nem em managed_by; dispara o 041 de forma idempotente.';