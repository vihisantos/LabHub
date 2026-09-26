-- =============================================================================
-- 073_profiles_delete_hardening.sql
-- =============================================================================
-- #286 (PR-2) — FECHAMENTO DO SELF-DELETE EM `public.profiles`.
--
-- Contexto (audit read-only da Fase 1 do #286):
--   `profiles_delete` (028_authorization_consolidation.sql) permite
--     USING (auth.uid() = id OR public.is_super_admin())
--   Ou seja, um usuário autenticado — inclusive `pending` — pode apagar a
--   PRÓPRIA linha de `profiles`. Isso é herança direta de 006/007
--   ("user can delete their own profile"), que a consolidação 028 mantendo.
--
-- Por que é hardening (não há fluxo a preservar):
--   - Nenhuma UI de "Excluir conta" em toda a aplicação;
--   - Nenhum endpoint de autoexclusão no backend;
--   - Nenhuma chamada no frontend usa o caminho. O ÚNICO `.delete()` sobre
--     `profiles` no frontend é `adminService.rejectUser()` — ato do Super Admin
--     na fila de aprovação (#283), coberto por `is_super_admin()`.
--   - A permissão era residuo sem lastro de produto.
--
-- Efeito colateral que esta migration elimina:
--   O self-delete produzia uma identidade `auth.users` ORFA (o profile saía, a
--   identidade Auth permanecia) sem nenhum registro em `app_audit_logs` — o
--   trigger `trg_app_audit_profiles` (054) cobre apenas `AFTER UPDATE`. O
--   tratamento da rejeição real (desabilitar/remover a identidade + auditoria
--   de DELETE) é escopo do PR-1 e NÃO é feito aqui.
--
-- Decisão:
--   1. `profiles_delete` passa a exigir `public.is_super_admin()`.
--   2. As DEMAIS policies de `profiles` NÃO são tocadas: SELECT (044),
--      UPDATE (067), INSERT (028).
--   3. `admin_abs_delete_profiles` (022) permanece INTOCADA e continua
--      `USING (public.is_super_admin())` — é a segunda policy de DELETE, já
--      restrita ao Super Admin, e base do fluxo administrativo de rejeição.
--   4. Policies permissivas são combinadas por OU: a união passa a ser
--      `is_super_admin() OR is_super_admin()` = `is_super_admin()`.
--   5. Nenhum GRANT é alterado. A ausência de GRANT explícito em `profiles`
--      (o Supabase concede por default) fica como está — inalterar privilégio
--      é inalterar o escopo desta migration.
--
-- LINHAS VERMELHAS (esta migration NÃO altera):
--   `profiles.role`; `profiles.app_access`; `profiles.workspace_ids`;
--   `memberships`; `auth.users`; RPCs 052 e 072; fluxo de aprovação; fluxo de
--   rejeição; Coordinator; RBAC 2.0; `rbac_audit_logs`; `app_audit_logs`;
--   quaisquer triggers, funções ou tabelas.
--
-- IDEMPOTÊNCIA: `DROP POLICY IF EXISTS` + `CREATE POLICY` (mesmo padrão de
-- 028/044/067). Replay seguro pelo runner.
-- =============================================================================

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_super_admin());
