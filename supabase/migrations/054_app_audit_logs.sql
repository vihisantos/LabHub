-- =============================================================================
-- 054: Auditoria de ações do app (append-only, por workspace)
--
-- Contexto (decisão do usuário, 2026-09-10):
--   - A "Atividade Recente" e a aba de auditoria do admin liam a coleção local
--     IndexedDB `audit_logs` (só-local, nunca sincronizada, apagável) → logs por
--     dispositivo, sem trilha cross-device para eventos graves.
--   - Passam a ler `public.app_audit_logs`: persistente, imutável, por workspace,
--     LGPD-aware (sem segredos em `meta`, acesso restrito por RLS).
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Cria a tabela append-only `public.app_audit_logs`.
--   2. RLS: SELECT para super admin OU membro do workspace; escrita APENAS via
--      service_role/owner (sem policies de INSERT/UPDATE/DELETE).
--   3. Triggers de auditoria (SECURITY DEFINER):
--        - `audit_memberships_change` (INSERT/UPDATE/DELETE em memberships) →
--          membro adicionado/alterado/removido (cobre approve/reject/
--          setUserMemberships/admin_set_user_memberships).
--        - `audit_profiles_change` (UPDATE sensível em profiles: role/status/
--          is_super_admin/app_access) → cargo/status/super admin/app_access.
--
-- NÃO altera nenhuma policy/RLS existente nem lógica de autorização → não
-- toca no RBAC. Aditivo.
--
-- IDEMPOTÊNCIA: DROP IF EXISTS + CREATE OR REPLACE; replay seguro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name    text NOT NULL DEFAULT '',
  action        text NOT NULL,
  entity        text NOT NULL DEFAULT 'user',
  entity_id     text NOT NULL DEFAULT '',
  entity_label  text NOT NULL DEFAULT '',
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timestamp"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_workspace_ts
  ON public.app_audit_logs (workspace_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_actor_ts
  ON public.app_audit_logs (actor_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_workspace_action
  ON public.app_audit_logs (workspace_id, action);

COMMENT ON TABLE public.app_audit_logs IS
  'Auditoria de ações do app (append-only). SELECT: super admin OU membro do '
  'workspace (RLS). Escrita somente via service_role/owner (backend + triggers). '
  'meta NUNCA deve conter segredos, JWTs ou chaves.';

ALTER TABLE public.app_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_audit_logs_select" ON public.app_audit_logs;
CREATE POLICY "app_audit_logs_select"
  ON public.app_audit_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(public.app_audit_logs.workspace_id)
  );

REVOKE ALL ON public.app_audit_logs FROM anon;
REVOKE ALL ON public.app_audit_logs FROM PUBLIC;
GRANT SELECT ON public.app_audit_logs TO authenticated;

-- =============================================================================
-- Trigger: memberships → membro adicionado / alterado / removido
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_memberships_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id    uuid := auth.uid();
  v_actor_name  text := '';
  v_target_name text := '';
  v_ws          uuid;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
  v_target      uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ws      := OLD.workspace_id;
    v_action  := 'membership_removed';
    v_target  := OLD.profile_id;
    v_meta    := jsonb_build_object('role_id', OLD.role_id, 'status', OLD.status, 'managed_by', OLD.managed_by);
  ELSE
    v_ws     := NEW.workspace_id;
    v_target := NEW.profile_id;
    v_meta   := jsonb_build_object(
      'role_id', NEW.role_id,
      'status', NEW.status,
      'prev_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role_id ELSE NULL END,
      'prev_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
    );
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'membership_added' ELSE 'membership_changed' END;
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;
  SELECT name INTO v_target_name FROM public.profiles WHERE id = v_target;

  INSERT INTO public.app_audit_logs
    (workspace_id, actor_id, actor_name, action, entity, entity_id, entity_label, meta)
  VALUES
    (v_ws, v_actor_id, COALESCE(v_actor_name, ''), v_action, 'user',
     v_target::text, COALESCE(v_target_name, ''), v_meta);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_app_audit_memberships ON public.memberships;
CREATE TRIGGER trg_app_audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_memberships_change();

-- =============================================================================
-- Trigger: profiles → cargo / status / super admin / app_access
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_profiles_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_name text := '';
  v_ws         uuid;
  v_action     text;
  v_meta       jsonb := '{}'::jsonb;
BEGIN
  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_action := 'role_changed';
    v_meta   := jsonb_build_object('prev_role', OLD.role, 'new_role', NEW.role);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'status_changed';
    v_meta   := jsonb_build_object('prev_status', OLD.status, 'new_status', NEW.status);
  ELSIF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    v_action := 'super_admin_toggled';
    v_meta   := jsonb_build_object('prev', OLD.is_super_admin, 'new_val', NEW.is_super_admin);
  ELSIF NEW.app_access IS DISTINCT FROM OLD.app_access THEN
    v_action := 'app_access_changed';
  ELSE
    RETURN NULL;
  END IF;

  -- Workspace do alvo: membership ativa (RBAC 2.0). Sem membership → sem
  -- workspace_id (fica NULL; ainda visível ao super admin).
  SELECT workspace_id INTO v_ws FROM public.memberships
    WHERE profile_id = NEW.id AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

  INSERT INTO public.app_audit_logs
    (workspace_id, actor_id, actor_name, action, entity, entity_id, entity_label, meta)
  VALUES
    (v_ws, v_actor_id, COALESCE(v_actor_name, ''), v_action, 'user',
     NEW.id::text, NEW.name, v_meta);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_app_audit_profiles ON public.profiles;
CREATE TRIGGER trg_app_audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role IS DISTINCT FROM OLD.role
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
        OR NEW.app_access IS DISTINCT FROM OLD.app_access)
  EXECUTE FUNCTION public.audit_profiles_change();