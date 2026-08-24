-- ============================================
-- LabHub — Tabelas ausentes do schema pcare
-- Execute este script no SQL Editor do Supabase
-- ============================================

-- pcare.part_usage
CREATE TABLE IF NOT EXISTS pcare.part_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partId" TEXT NOT NULL DEFAULT '',
  "pcId" TEXT NOT NULL DEFAULT '',
  "partName" TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_usage_part ON pcare.part_usage("partId");
CREATE INDEX IF NOT EXISTS idx_part_usage_pc ON pcare.part_usage("pcId");
ALTER TABLE pcare.part_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "part_usage_all" ON pcare.part_usage;
CREATE POLICY "part_usage_all" ON pcare.part_usage FOR ALL USING (true) WITH CHECK (true);

-- pcare.checklist_templates
CREATE TABLE IF NOT EXISTS pcare.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  "labName" TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pcare.checklist_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checklist_templates_all" ON pcare.checklist_templates;
CREATE POLICY "checklist_templates_all" ON pcare.checklist_templates FOR ALL USING (true) WITH CHECK (true);

-- pcare.pc_checklists
CREATE TABLE IF NOT EXISTS pcare.pc_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcId" TEXT NOT NULL DEFAULT '',
  "templateId" TEXT NOT NULL DEFAULT '',
  "templateName" TEXT NOT NULL DEFAULT '',
  "labName" TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_checklists_pc ON pcare.pc_checklists("pcId");
ALTER TABLE pcare.pc_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_checklists_all" ON pcare.pc_checklists;
CREATE POLICY "pc_checklists_all" ON pcare.pc_checklists FOR ALL USING (true) WITH CHECK (true);

-- pcare.action_logs
CREATE TABLE IF NOT EXISTS pcare.action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcId" TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_pc ON pcare.action_logs("pcId");
ALTER TABLE pcare.action_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "action_logs_all" ON pcare.action_logs;
CREATE POLICY "action_logs_all" ON pcare.action_logs FOR ALL USING (true) WITH CHECK (true);

-- Garantir permissões de acesso para o schema pcare
GRANT USAGE ON SCHEMA pcare TO anon;
GRANT USAGE ON SCHEMA pcare TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pcare TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA pcare TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pcare TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pcare TO service_role;
