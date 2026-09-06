-- =============================================================================
-- 042_rbac2_profiles_role_check_coordinator.sql
-- =============================================================================
-- RBAC 2.0 — ALINHAMENTO DO CHECK `profiles_role_check` AO CARGO COORDENADOR.
--
-- Contexto:
--   A 040 introduziu o cargo 'coordinator' (roles.slug = 'coordinator') e o
--   app grava o valor canônico 'coordinator' em profiles.role tanto na
--   aprovação (adminService.approveUser, frontend + /api/push/action no
--   backend) quanto no mapeamento determinístico role→slug da 041. Porém o
--   CHECK legado da 001 — CHECK (role IN ('admin','technician','viewer')) —
--   continua ativo e REJEITA o novo valor: aprovar um Coordenador
--   Multiunidade falha com 23514 check_violation, travando o fluxo real de
--   entrada end-to-end (verificado no DEV: insert de profile com
--   role='coordinator' é recusado).
--
-- Ação:
--   Substitui o constraint por uma versão que aceita o conjunto
--   determinístico completo do mapeamento role→slug (mesmo da 036/040/041):
--     - canônicos:  'admin' | 'technician' | 'viewer' | 'coordinator'
--     - roleId:     'role-admin' | 'role-technician' | 'role-viewer' |
--                   'role-coordinator'  (formato gravado por versões antigas
--                   do app; manter evita rejeitar dados históricos)
--
-- TÉCNICA:
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT: idempotente (re-executar
--     não falha; o ADD com a mesma definição não é problema pois o DROP
--     anterior remove a versão antiga).
--   - Nenhuma linha de dados é alterada; nenhum seed, RLS ou tabela nova.
--   - Não valida dados existentes de forma destrutiva: qualquer valor hoje
--     presente nos bancos é subconjunto do novo conjunto (verificado: só
--     existem valores do conjunto legado).

-- =============================================================================
-- 1. Substituição do constraint
-- =============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin', 'technician', 'viewer', 'coordinator',
    'role-admin', 'role-technician', 'role-viewer', 'role-coordinator'
  ));

-- =============================================================================
-- 2. Documentação
-- =============================================================================

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'RBAC 2.0 (042): valores canônicos + formato roleId do mapeamento determinístico role→slug (036/040/041). Coordenador Multiunidade incluído.';
