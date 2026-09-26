-- =============================================================================
-- 074_admin_rejection_state.sql
-- =============================================================================
-- #286 (PR-1) — REJEIÇÃO REAL DE CONTAS PENDENTES: estado terminal `rejected`.
--
-- Contexto (audit read-only + micro-audit de Auth no Supabase DEV):
--   A rejeição era um `DELETE` em `public.profiles` (adminService.rejectUser).
--   O micro-audit comprovou em runtime que remover o profile:
--     · NÃO remove nem desativa `auth.users`;
--     · o MESMO usuário volta a obter sessão no Supabase Auth (200);
--     · o profile NÃO é recriado (handle_new_user é AFTER INSERT em auth.users);
--     · sobra uma identidade Auth válida, SEM profile e INVISÍVEL para a fila
--       administrativa (a fila lê `profiles`), ou seja, irreversível na prática.
--   Consequência: "rejeitar" não revogava nada — apenas tornava a conta
--   inalcançável pelo LabHub sem que a identidade Auth deixasse de funcionar.
--
-- Mecanismo ATUAL de `profiles.status` (inspecionado, não assumido):
--   `012_add_status_avatar_to_profiles.sql:6` define a coluna como
--     status TEXT NOT NULL DEFAULT 'active'
--   ou seja, NÃO existe CHECK constraint, NÃO é enum, NÃO há domínio e NÃO há
--   trigger de domínio. O "conjunto permitido" é hoje apenas implícito, validado
--   em código (ex.: `require_auth` trata 'blocked'; a 072 exige 'active').
--   Esta migration passa a tornar o conjunto EXPLICITO no banco.
--
-- Decisões:
--   1. `rejected` entra como estado terminal de primeira classe. A rejeição
--      (endpoint POST /api/admin/users/<id>/reject) grava o status; a
--      `require_auth` passou a tratar `rejected` como não autorizado, de modo
--      que `rejected` NUNCA é operação Autenticado no LabHub.
--   2. Estados canônicos preservados: `pending`, `active`, `blocked` (não há
--      breaking change para o que já existia).
--   3. `suspended` entra no constraint como estado LEGADO/TRANSITÓRIO: os
--      scripts de validação em DEV gravam `profiles.status = 'suspended'`
--      (`scripts/e2e_db.py`, `scripts/validate_rbac2_trust_boundary_067_dev.py`)
--      para simular conta não ativa. Removê-lo do conjunto quebraria esses
--      scripts; ele NÃO é estado de produto. Deve ser removido do conjunto
--      (e dos scripts) em um PR futuro.
--   4. O constraint é criado `NOT VALID` de propósito: ele passa a valer para
--      toda ESCRITA nova/alterada, mas NÃO é validado contra as linhas já
--      existentes. Isso torna a migration IMPOSSÍVEL de falhar em qualquer
--      ambiente (ex.: PROD pode conter valores fora do conjunto) e ainda assim
--      impede estados novos inválidos. A validação histórica é opt-in:
--        SELECT DISTINCT status FROM public.profiles;         -- pré-check
--        -- quando a lista for exatamente o conjunto esperado:
--        ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_status_check;
--   5. A identidade Auth é DESATIVADA (ban) pelo endpoint, nunca apagada:
--      o profile é preservado (histórico, auditoria, FKs) e a desativação é
--      reversível. Remover `auth.users` abriria caminho para novo cadastro com o
--      mesmo e-mail, recriando a conta como `pending`.
--
-- Auditoria: o gatilho `trg_app_audit_profiles` (054/065) é AFTER UPDATE e
-- dispara na mudança de status (pending -> rejected) gerando `status_changed`
-- com prev/new status. O endpoint grava uma linha ADICIONAL e explicita
-- (`account_rejected`) COM o ator, que o gatilho não consegue capturar quando a
-- escrita é feita com `service_role` (o `auth.uid()` do gatilho é NULL). É o
-- mesmo `app_audit_logs` — nenhuma infraestrutura de log nova foi criada.
--
-- LINHAS VERMELHAS (esta migration NAO altera):
--   `profiles.role`, `profiles.app_access`, `profiles.workspace_ids`,
--   `memberships`, `auth.users`, policies/RLS, RPCs 052 e 072, Coordinator,
--   RBAC 2.0 / RBAC_2_ENABLED, gatilhos, `app_audit_logs` (schema), a policy
--   `admin_abs_delete_profiles` (redundante, fora de escopo), e a migration 073
--   (self-delete, PR-2).
--
-- IDEMPOTENCIA: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT ... NOT VALID`.
-- Replay seguro pelo runner.
-- =============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'active', 'blocked', 'rejected', 'suspended'))
  NOT VALID;

COMMENT ON CONSTRAINT profiles_status_check ON public.profiles IS
  'RBAC 2.0 (#286 PR-1): conjunto de estados de profiles.status. Canonicos: '
  'pending (aguardando aprovacao), active (aprovada), blocked (bloqueada), '
  'rejected (rejeitada — terminal; require_auth nega). suspended e legado de '
  'scripts de validacao DEV. Criado NOT VALID: vale para escritas novas, sem '
  'exigir limpeza de dados historicos.';
