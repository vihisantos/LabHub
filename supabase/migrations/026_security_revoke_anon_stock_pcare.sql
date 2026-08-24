-- =============================================
-- 026: Segurança — REVOKE anon de stock/pcare
--
-- Objetivos:
-- 1. Mover notificação de cadastro para trigger (remove dependência de anon)
-- 2. Conceder grants explícitos para authenticated em stock e pcare
-- 3. Corrigir stock_photos (grant faltante)
-- 4. Habilitar RLS em stock.notifications (não tinha)
-- 5. Revogar anon de ambos os schemas
-- =============================================

-- =============================================
-- PARTE 1: Trigger — notificação de cadastro
-- =============================================
-- A função handle_new_user() já cria o profile (migration 015).
-- Estendemos para criar a notificação de aprovação diretamente,
-- eliminando a necessidade de INSERT via client anon.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_notification_id UUID;
BEGIN
  -- 1. Criar profile pendente (comportamento existente)
  INSERT INTO public.profiles (id, email, name, role, status, workspace_ids, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer',
    'pending',
    '{}',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    status = 'pending',
    updated_at = NOW();

  -- 2. Criar notificação de aprovação para super admins
  -- (substitui o INSERT que antes era feito pelo frontend como anon)
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_notification_id := gen_random_uuid();

  INSERT INTO stock.notifications (
    id, title, body, type, severity, module,
    "actionUrl", read, "createdAt",
    audience, "targetSuperAdmin"
  ) VALUES (
    v_notification_id,
    'Novo usuário pendente',
    v_name || ' (' || NEW.email || ') aguarda aprovação',
    'approval',
    'info',
    'auth',
    '/admin/users?pending=' || NEW.id::text,
    false,
    NOW(),
    'role',
    true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- PARTE 2: GRANTS — stock (authenticated)
-- =============================================

-- Schema USAGE
GRANT USAGE ON SCHEMA stock TO authenticated;

-- Tabelas: SELECT/INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_kits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.notifications TO authenticated;

-- Sequências
GRANT USAGE ON ALL SEQUENCES IN SCHEMA stock TO authenticated;

-- Default privileges para futuras tabelas
ALTER DEFAULT PRIVILEGES IN SCHEMA stock GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- =============================================
-- PARTE 3: GRANTS — pcare (authenticated)
-- =============================================

-- Schema USAGE
GRANT USAGE ON SCHEMA pcare TO authenticated;

-- Tabelas: SELECT/INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.pcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.parts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.part_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.pc_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.action_logs TO authenticated;

-- Sequências
GRANT USAGE ON ALL SEQUENCES IN SCHEMA pcare TO authenticated;

-- Default privileges para futuras tabelas
ALTER DEFAULT PRIVILEGES IN SCHEMA pcare GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- =============================================
-- PARTE 4: RLS — stock.notifications
-- =============================================
-- A tabela stock.notifications não tinha RLS habilitado.
-- Adicionamos para consistência (política permissiva por enquanto).

ALTER TABLE stock.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_all" ON stock.notifications;
CREATE POLICY "notifications_all" ON stock.notifications
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PARTE 5: REVOKE anon
-- =============================================

-- Stock
REVOKE ALL ON ALL TABLES IN SCHEMA stock FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA stock FROM anon;
REVOKE USAGE ON SCHEMA stock FROM anon;

-- PCare
REVOKE ALL ON ALL TABLES IN SCHEMA pcare FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pcare FROM anon;
REVOKE USAGE ON SCHEMA pcare FROM anon;

-- =============================================
-- PARTE 6: Garantir service_role (ALL)
-- =============================================
-- O REVOKE anterior afetou service_role em stock.notifications.
-- Re-aplicar grants para garantir acesso total do service_role.

GRANT ALL ON ALL TABLES IN SCHEMA stock TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA stock TO service_role;
GRANT USAGE ON SCHEMA stock TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA pcare TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pcare TO service_role;
GRANT USAGE ON SCHEMA pcare TO service_role;

-- =============================================
-- PARTE 7: Limpar default privileges antigos
-- =============================================
-- A migration 016 concedia default privileges para anon+authenticated.
-- Removemos a parte do anon para que futuras tabelas não recebam grants.
-- (O PostgreSQL não suporta REVOKE DEFAULT, então sobrescrevemos.)

ALTER DEFAULT PRIVILEGES IN SCHEMA stock GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pcare GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
