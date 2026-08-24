-- ============================================================================
-- 029: RECONCILIAÇÃO DE POLICIES LEGADAS PERMISSIVAS
-- ============================================================================
-- PROBLEMA:
--   Policies de RLS são permissivas por natureza (OR entre elas). Basta UMA
--   policy USING(true) sobreviver numa tabela para que o isolamento por
--   workspace da 027 seja inócuo naquela tabela.
--
--   A 027 removeu apenas os nomes genéricos ("all", "all_authenticated",
--   "anon_no_access", "authenticated_read_insert_update"), mas os scripts
--   manuais aplicados em produção usavam nomes próprios que continuam
--   existindo se o banco foi montado por eles:
--
--     supa.sql ..................... "<tabela>_all" (USING(true))
--     supa_fix2.sql ................ "allow_all" (USING(true)) em 4 tabelas
--     026 (esta própria migration) . "notifications_all" (USING(true)) em
--                                    stock.notifications — OU SEJA, hoje
--                                    qualquer usuário autenticado lê/escreve/
--                                   apaga notificações de TODOS os workspaces.
--
-- ESCOPO (somente tabelas que JÁ possuem substituto restritivo da 027):
--   Todas as DROPs abaixo são seguras: cada tabela listada recebeu policies
--   restritivas (is_super_admin() OR user_belongs_to_workspace()) na 027.
--
-- FORA DO ESCOPO (dívida documentada, não tocar aqui):
--   * pcare.assets ....... 027 não criou substituto; remover "assets_all"
--                          sem substituto quebraria a leitura do app.
--                          Tratar em PR dedicado de autorização.
--   * tv_* ............... políticas abertas por design até o kiosk ter
--                          identidade própria (PR dedicado).
--   * public.tv_music_requests / public.assets / profiles / workspaces ...
--                          já versionadas com policies próprias (019/024/etc).
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS — pode rodar em qualquer estado.
-- ============================================================================

BEGIN;

-- ─── stock.notifications: fecha o buraco aberto pela própria 026 ────────────
DROP POLICY IF EXISTS "notifications_all" ON stock.notifications;

-- ─── stock.*: nomes legados dos scripts manuais (supa.sql / supa_fix*.sql) ──
DROP POLICY IF EXISTS "stock_items_all"           ON stock.stock_items;
DROP POLICY IF EXISTS "stock_movements_all"       ON stock.stock_movements;
DROP POLICY IF EXISTS "stock_kits_all"            ON stock.stock_kits;
DROP POLICY IF EXISTS "stock_inventory_cycles_all" ON stock.stock_inventory_cycles;
DROP POLICY IF EXISTS "allow_all"                 ON stock.stock_inventory_cycles;
DROP POLICY IF EXISTS "stock_inventory_counts_all" ON stock.stock_inventory_counts;
DROP POLICY IF EXISTS "allow_all"                 ON stock.stock_inventory_counts;
DROP POLICY IF EXISTS "stock_maintenance_all"     ON stock.stock_maintenance;
DROP POLICY IF EXISTS "allow_all"                 ON stock.stock_maintenance;
DROP POLICY IF EXISTS "stock_photos_all"          ON stock.stock_photos;
DROP POLICY IF EXISTS "allow_all"                 ON stock.stock_photos;

-- ─── pcare.*: nomes legados (supa.sql / supa_fix_pcare_missing_tables.sql) ──
DROP POLICY IF EXISTS "pcs_all"                   ON pcare.pcs;
DROP POLICY IF EXISTS "parts_all"                 ON pcare.parts;
DROP POLICY IF EXISTS "maintenance_all"           ON pcare.maintenance;
DROP POLICY IF EXISTS "part_usage_all"            ON pcare.part_usage;
DROP POLICY IF EXISTS "checklist_templates_all"   ON pcare.checklist_templates;
DROP POLICY IF EXISTS "pc_checklists_all"         ON pcare.pc_checklists;
DROP POLICY IF EXISTS "action_logs_all"           ON pcare.action_logs;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO (rodar no SQL Editor e conferir que NÃO sobra
-- nenhuma policy USING(true) fora das exceções documentadas acima):
--
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname IN ('stock', 'pcare', 'public')
--     AND (
--       qual LIKE '%USING (true)%'
--       OR qual = 'true'
--       OR with_check = 'true'
--     )
--   ORDER BY schemaname, tablename;
--
-- Exceções ESPERADAS após esta migration (não são erro):
--   * pcare.assets ("assets_all")        -> dívida, ver cabeçalho
--   * public.tv_* (kiosk)                -> dívida, PR de autorização da TV
--   * public.tv_music_requests_select    -> intencional (019), revisar no PR TV
-- ============================================================================
