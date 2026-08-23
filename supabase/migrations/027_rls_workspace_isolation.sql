-- =============================================================================
-- 027: RLS Workspace Isolation
-- Substitui políticas permissivas (USING(true)) por isolamento por workspace.
-- Notas:
--   - service_role bypassa RLS automaticamente no PostgreSQL.
--   - is_super_admin() retorna true/false (DEFINED FUNCTION).
--   - Registros legados (workspace_id IS NULL) continuam visíveis.
--   - stock.notifications usa TEXT para workspace_id (legado).
-- =============================================================================

-- ─── Função auxiliar para membership check ────────────────────────────────────
-- Verifica se o usuário autenticado pertence ao workspace_id informado.
-- Duas sobrecargas: text (stock_items, notifications) e uuid (demais tabelas).
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NULL
      OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles
        WHERE id = auth.uid()
      )
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NULL
      OR ws_id::text IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles
        WHERE id = auth.uid()
      )
$$;

-- =============================================================================
-- STOCK schema
-- =============================================================================

-- ─── stock.stock_items ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_items;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_items;
DROP POLICY IF EXISTS "anon_no_access" ON stock.stock_items;
DROP POLICY IF EXISTS "authenticated_read_insert_update" ON stock.stock_items;

CREATE POLICY "stock_items_select"
  ON stock.stock_items FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_items_insert"
  ON stock.stock_items FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_items_update"
  ON stock.stock_items FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_items_delete"
  ON stock.stock_items FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_movements ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_movements;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_movements;

CREATE POLICY "stock_movements_select"
  ON stock.stock_movements FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_movements_insert"
  ON stock.stock_movements FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_movements_update"
  ON stock.stock_movements FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_movements_delete"
  ON stock.stock_movements FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_kits ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_kits;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_kits;

CREATE POLICY "stock_kits_select"
  ON stock.stock_kits FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_kits_insert"
  ON stock.stock_kits FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_kits_update"
  ON stock.stock_kits FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_kits_delete"
  ON stock.stock_kits FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_maintenance ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_maintenance;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_maintenance;

CREATE POLICY "stock_maintenance_select"
  ON stock.stock_maintenance FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_maintenance_insert"
  ON stock.stock_maintenance FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_maintenance_update"
  ON stock.stock_maintenance FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_maintenance_delete"
  ON stock.stock_maintenance FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_inventory_cycles ─────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_inventory_cycles;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_inventory_cycles;

CREATE POLICY "stock_inventory_cycles_select"
  ON stock.stock_inventory_cycles FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_cycles_insert"
  ON stock.stock_inventory_cycles FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_cycles_update"
  ON stock.stock_inventory_cycles FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_cycles_delete"
  ON stock.stock_inventory_cycles FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_inventory_counts ─────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_inventory_counts;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_inventory_counts;

CREATE POLICY "stock_inventory_counts_select"
  ON stock.stock_inventory_counts FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_counts_insert"
  ON stock.stock_inventory_counts FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_counts_update"
  ON stock.stock_inventory_counts FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_inventory_counts_delete"
  ON stock.stock_inventory_counts FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.stock_photos ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON stock.stock_photos;
DROP POLICY IF EXISTS "all_authenticated" ON stock.stock_photos;

CREATE POLICY "stock_photos_select"
  ON stock.stock_photos FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_photos_insert"
  ON stock.stock_photos FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_photos_update"
  ON stock.stock_photos FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "stock_photos_delete"
  ON stock.stock_photos FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── stock.notifications ──────────────────────────────────────────────────────
-- Política especial: notificações globais (workspace_id NULL) visíveis a todos.
DROP POLICY IF EXISTS "all" ON stock.notifications;
DROP POLICY IF EXISTS "all_authenticated" ON stock.notifications;

CREATE POLICY "notifications_select"
  ON stock.notifications FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "notifications_insert"
  ON stock.notifications FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "notifications_update"
  ON stock.notifications FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "notifications_delete"
  ON stock.notifications FOR DELETE
  USING (
    is_super_admin()
  );

-- =============================================================================
-- PCARE schema
-- =============================================================================

-- ─── pcare.pcs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.pcs;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.pcs;

CREATE POLICY "pcs_select"
  ON pcare.pcs FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcs_insert"
  ON pcare.pcs FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcs_update"
  ON pcare.pcs FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcs_delete"
  ON pcare.pcs FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.parts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.parts;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.parts;

CREATE POLICY "parts_select"
  ON pcare.parts FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "parts_insert"
  ON pcare.parts FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "parts_update"
  ON pcare.parts FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "parts_delete"
  ON pcare.parts FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.maintenance ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.maintenance;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.maintenance;

CREATE POLICY "pcare_maintenance_select"
  ON pcare.maintenance FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcare_maintenance_insert"
  ON pcare.maintenance FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcare_maintenance_update"
  ON pcare.maintenance FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pcare_maintenance_delete"
  ON pcare.maintenance FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.part_usage ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.part_usage;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.part_usage;

CREATE POLICY "part_usage_select"
  ON pcare.part_usage FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "part_usage_insert"
  ON pcare.part_usage FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "part_usage_update"
  ON pcare.part_usage FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "part_usage_delete"
  ON pcare.part_usage FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.checklist_templates ────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.checklist_templates;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.checklist_templates;

CREATE POLICY "checklist_templates_select"
  ON pcare.checklist_templates FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "checklist_templates_insert"
  ON pcare.checklist_templates FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "checklist_templates_update"
  ON pcare.checklist_templates FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "checklist_templates_delete"
  ON pcare.checklist_templates FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.pc_checklists ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.pc_checklists;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.pc_checklists;

CREATE POLICY "pc_checklists_select"
  ON pcare.pc_checklists FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pc_checklists_insert"
  ON pcare.pc_checklists FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pc_checklists_update"
  ON pcare.pc_checklists FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "pc_checklists_delete"
  ON pcare.pc_checklists FOR DELETE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- ─── pcare.action_logs ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all" ON pcare.action_logs;
DROP POLICY IF EXISTS "all_authenticated" ON pcare.action_logs;

CREATE POLICY "action_logs_select"
  ON pcare.action_logs FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "action_logs_insert"
  ON pcare.action_logs FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "action_logs_update"
  ON pcare.action_logs FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "action_logs_delete"
  ON pcare.action_logs FOR DELETE
  USING (
    is_super_admin()
  );
