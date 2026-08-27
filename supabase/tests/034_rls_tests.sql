-- =============================================================================
-- 034_RLS_TESTS: Testes de isolamento por workspace
--
-- COMO RODAR:
--   Copiar bloco por bloco no SQL Editor do Supabase Dashboard
--   OU via Management API (database/query endpoint)
--
-- PRÉ-REQUISITOS:
--   - Migration 034 aplicada
--   - Pelo menos 2 workspaces existem
--   - Pelo menos 2 usuários autenticados (um em cada workspace)
--
-- NOTA: Estes testes usam auth.uid() que depende do contexto de sessão.
--       Para testes automatizados, usar a migration de teste ou testes Python.
-- =============================================================================

-- =============================================================================
-- TESTE 0: Verificar que nenhuma policy USING(true) permanece
-- =============================================================================
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'stock')
  AND tablename NOT IN ('profiles', 'workspaces', 'workspace_backups', 'workspace_audit_logs')
  AND (
    qual = 'true'
    OR qual LIKE '%auth.role()%'
    OR with_check = 'true'
  )
ORDER BY schemaname, tablename;

-- ESPERADO: 0 resultados (nenhuma policy legada restante)

-- =============================================================================
-- TESTE 1: tablet_reservations — isolamento
-- =============================================================================

-- 1a. User A consegue SELECT em reservations do WS-A
-- (Esperado: SUCESSO — dados do próprio workspace visíveis)
SELECT count(*) FROM public.tablet_reservations
WHERE workspace_id = 'WS_A_UUID'::uuid;

-- 1b. User A NÃO consegue SELECT em reservations do WS-B
-- (Esperado: 0 rows — RLS bloqueia)
SELECT count(*) FROM public.tablet_reservations
WHERE workspace_id = 'WS_B_UUID'::uuid;

-- 1c. User A NÃO consegue INSERT com workspace_id = WS-B
-- (Esperado: 403 / policy violation)
INSERT INTO public.tablet_reservations (workspace_id, status, horario_inicio, horario_fim)
VALUES ('WS_B_UUID'::uuid, 'ativa', NOW(), NOW() + INTERVAL '1 hour');

-- 1d. User A NÃO consegue UPDATE trocando workspace_id de A → B
-- (Esperado: 0 rows afetadas)
UPDATE public.tablet_reservations
SET workspace_id = 'WS_B_UUID'::uuid
WHERE workspace_id = 'WS_A_UUID'::uuid AND id = 'SOME_ID'::uuid;

-- 1e. User A NÃO consegue DELETE em reservations do WS-B
-- (Esperado: 0 rows afetadas)
DELETE FROM public.tablet_reservations
WHERE workspace_id = 'WS_B_UUID'::uuid;

-- =============================================================================
-- TESTE 2: tv_devices — isolamento
-- =============================================================================

-- 2a. User A consegue SELECT em devices do WS-A
SELECT count(*) FROM public.tv_devices
WHERE workspace_id = 'WS_A_UUID'::uuid;

-- 2b. User A NÃO consegue SELECT em devices do WS-B
SELECT count(*) FROM public.tv_devices
WHERE workspace_id = 'WS_B_UUID'::uuid;

-- 2c. User A NÃO consegue INSERT com workspace_id = WS-B
INSERT INTO public.tv_devices (workspace_id, name, device_type)
VALUES ('WS_B_UUID'::uuid, 'test', 'tv');

-- 2d. User A NÃO consegue UPDATE device do WS-B
UPDATE public.tv_devices SET name = 'hacked'
WHERE workspace_id = 'WS_B_UUID'::uuid;

-- 2e. User A NÃO consegue DELETE device do WS-B
DELETE FROM public.tv_devices WHERE workspace_id = 'WS_B_UUID'::uuid;

-- =============================================================================
-- TESTE 3: stock.notifications — isolamento
-- =============================================================================

-- 3a. User A consegue SELECT notificações do WS-A
SELECT count(*) FROM stock.notifications
WHERE workspace_id = 'WS_A_UUID'::text;

-- 3b. User A NÃO consegue SELECT notificações do WS-B
SELECT count(*) FROM stock.notifications
WHERE workspace_id = 'WS_B_UUID'::text;

-- 3c. Global notifications (workspace_id = NULL) — acessíveis via is_super_admin()
-- NOTA: user_belongs_to_workspace(NULL) = false, então ONLY super admins veem NULLs
SELECT count(*) FROM stock.notifications
WHERE workspace_id IS NULL;

-- =============================================================================
-- TESTE 4: public.notifications — isolamento
-- =============================================================================

-- 4a. User A consegue SELECT notificações do WS-A
SELECT count(*) FROM public.notifications
WHERE workspace_id = 'WS_A_UUID'::text;

-- 4b. User A NÃO consegue SELECT notificações do WS-B
SELECT count(*) FROM public.notifications
WHERE workspace_id = 'WS_B_UUID'::text;

-- =============================================================================
-- TESTE 5: public.assets — isolamento
-- =============================================================================

-- 5a. User A consegue SELECT assets do WS-A
SELECT count(*) FROM public.assets
WHERE workspace_id = 'WS_A_UUID'::uuid;

-- 5b. User A NÃO consegue SELECT assets do WS-B
SELECT count(*) FROM public.assets
WHERE workspace_id = 'WS_B_UUID'::uuid;

-- 5c. User A NÃO consegue DELETE asset do WS-B
-- (DELETE agora é super_admin only)
DELETE FROM public.assets WHERE workspace_id = 'WS_B_UUID'::uuid;

-- 5d. User A NÃO consegue DELETE asset do WS-A (não é super_admin)
-- (Esperado: 0 rows — DELETE é super_admin only)
DELETE FROM public.assets WHERE workspace_id = 'WS_A_UUID'::uuid;

-- =============================================================================
-- TESTE 6: Verificar policy count por tabela
-- =============================================================================
SELECT schemaname, tablename, count(*) as policy_count
FROM pg_policies
WHERE schemaname IN ('public', 'stock')
  AND tablename NOT IN ('profiles', 'workspaces', 'workspace_backups', 'workspace_audit_logs')
GROUP BY schemaname, tablename
ORDER BY schemaname, tablename;

-- ESPERADO: Todas as tabelas workspace-scoped têm 4 policies
-- (SELECT, INSERT, UPDATE, DELETE)
