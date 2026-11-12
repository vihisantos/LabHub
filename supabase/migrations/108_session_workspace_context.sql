-- 108_session_workspace_context.sql
-- Contexto de workspace por sessão
-- 
-- Objetivo: rastrear e validar o workspace associado a cada sessão de autenticação.
-- Permite isolamento de dados entre sessões e contexto de workspace persistente
-- durante a vida da sessão.
--
-- Mudanças:
--   1. Tabela session_workspace_contexts para armazenar o mapping sessão↔workspace↔revisão
--   2. RPC labhub_auth_session_is_active — valida se sessão está ativa e retorna workspace
--   3. RPC labhub_set_session_workspace_context — atualiza workspace da sessão (incrementa revisão)
--   4. RPC labhub_get_session_workspace_context — recupera workspace atual da sessão
--   5. RPC labhub_create_tv_activation_for_context — gera código de ativação para o workspace da sessão
--
-- Segurança:
--   - Tabela com RLS habilitado (policies definidas em 108_rls_for_session_context.sql)
--   - RPCs SECURITY DEFINER com REVOKE ALL de anon/authenticated
--   - GRANT EXECUTE apenas para service_role
--
-- Depende: PostgreSQL 16+ (gen_random_uuid() nativo)

-- ============================================================================
-- 1. Tabela session_workspace_contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.session_workspace_contexts (
  session_id uuid NOT NULL PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para consultas por user_id
CREATE INDEX IF NOT EXISTS idx_session_workspace_contexts_user ON public.session_workspace_contexts(user_id);

-- Í�ndice para consultas por workspace_id
CREATE INDEX IF NOT EXISTS idx_session_workspace_contexts_workspace ON public.session_workspace_contexts(workspace_id);

-- ============================================================================
-- 2. RPC: labhub_auth_session_is_active
-- ============================================================================

CREATE OR REPLACE FUNCTION public.labhub_auth_session_is_active(
  p_session_id uuid
) RETURNS TABLE(
  is_active boolean,
  user_id uuid,
  workspace_id uuid,
  revision bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT 
    s.is_active,
    c.user_id,
    c.workspace_id,
    c.revision
  FROM auth.sessions s
  LEFT JOIN public.session_workspace_contexts c ON c.session_id = s.id
  WHERE s.id = p_session_id
    AND s.expires_at > now()
    AND s.current_user_id IS NOT NULL
$function$;

-- ============================================================================
-- 3. RPC: labhub_set_session_workspace_context
-- ============================================================================

CREATE OR REPLACE FUNCTION public.labhub_set_session_workspace_context(
  p_session_id uuid,
  p_workspace_id uuid
) RETURNS TABLE(
  success boolean,
  new_revision bigint
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_existing_workspace uuid;
  v_new_revision bigint;
BEGIN
  -- Verificar se o workspace existe
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Verificar se a sessão existe e está ativa
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions 
    WHERE id = p_session_id 
      AND expires_at > now()
      AND current_user_id IS NOT NULL
  ) THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Atualizar ou inserir o contexto
  INSERT INTO public.session_workspace_contexts (session_id, user_id, workspace_id, revision)
  SELECT 
    p_session_id,
    (SELECT current_user_id FROM auth.sessions WHERE id = p_session_id),
    p_workspace_id,
    1
  ON CONFLICT (session_id) 
  DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    revision = session_workspace_contexts.revision + 1,
    updated_at = clock_timestamp()
  RETURNING revision INTO v_new_revision;

  RETURN QUERY SELECT true, v_new_revision;
END;
$function$;

-- ============================================================================
-- 4. RPC: labhub_get_session_workspace_context
-- ============================================================================

CREATE OR REPLACE FUNCTION public.labhub_get_session_workspace_context(
  p_session_id uuid
) RETURNS TABLE(
  user_id uuid,
  workspace_id uuid,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT 
    c.user_id,
    c.workspace_id,
    c.revision,
    c.created_at,
    c.updated_at
  FROM public.session_workspace_contexts c
  WHERE c.session_id = p_session_id
$function$;

-- ============================================================================
-- 5. RPC: labhub_create_tv_activation_for_context
-- ============================================================================

CREATE OR REPLACE FUNCTION public.labhub_create_tv_activation_for_context(
  p_session_id uuid
) RETURNS TABLE(
  success boolean,
  code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_device_name text := 'activation-flow';
  v_expires_at timestamptz := now() + interval '24 hours';
  v_code text;
BEGIN
  -- Verificar se o contexto da sessão existe
  SELECT user_id, workspace_id INTO v_user_id, v_workspace_id
  FROM public.session_workspace_contexts
  WHERE session_id = p_session_id;

  IF v_user_id IS NULL OR v_workspace_id IS NULL THEN
    RETURN QUERY SELECT false, NULL, NULL;
    RETURN;
  END IF;

  -- Gerar código de ativação único
  v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- Inserir o código de ativação
  INSERT INTO public.tv_activation_codes (
    id,
    code,
    workspace_id,
    user_id,
    device_name,
    expires_at
  ) VALUES (
    gen_random_uuid(),
    v_code,
    v_workspace_id,
    v_user_id,
    v_device_name,
    v_expires_at
  );

  RETURN QUERY SELECT true, v_code, v_expires_at;
END;
$function$;

-- ============================================================================
-- 6. RLS e permissoes
-- ============================================================================

-- Habilitar RLS na tabela
ALTER TABLE public.session_workspace_contexts ENABLE ROW LEVEL SECURITY;

-- Policy: usuario soh pode ver/editar seu proprio contexto
DROP POLICY IF EXISTS "session_workspace_contexts_select" ON public.session_workspace_contexts;
CREATE POLICY "session_workspace_contexts_select"
  ON public.session_workspace_contexts
  FOR SELECT
  USING (
    session_id = (SELECT id FROM auth.sessions WHERE current_user_id = auth.uid() AND expires_at > now() LIMIT 1)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

DROP POLICY IF EXISTS "session_workspace_contexts_insert" ON public.session_workspace_contexts;
CREATE POLICY "session_workspace_contexts_insert"
  ON public.session_workspace_contexts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

DROP POLICY IF EXISTS "session_workspace_contexts_update" ON public.session_workspace_contexts;
CREATE POLICY "session_workspace_contexts_update"
  ON public.session_workspace_contexts
  FOR UPDATE
  USING (
    session_id = (SELECT id FROM auth.sessions WHERE current_user_id = auth.uid() AND expires_at > now() LIMIT 1)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "session_workspace_contexts_delete" ON public.session_workspace_contexts;
CREATE POLICY "session_workspace_contexts_delete"
  ON public.session_workspace_contexts
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- Rebaixar permissoes de anon e authenticated
REVOKE ALL ON public.session_workspace_contexts FROM anon;
REVOKE ALL ON public.session_workspace_contexts FROM authenticated;
REVOKE ALL ON TABLE public.session_workspace_contexts FROM anon;
REVOKE ALL ON TABLE public.session_workspace_contexts FROM authenticated;

-- Conceder permissoes para service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_workspace_contexts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE session_workspace_contexts_revision_seq TO service_role;

-- ============================================================================
-- 7. Log de auditoria
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'rbac_audit_logs'
  ) THEN
    RAISE NOTICE 'rbac_audit_logs table not found, skipping audit log creation';
  ELSE
    -- Log de criacao da tabela
    INSERT INTO public.rbac_audit_logs (action, outcome, role_id, resource, details)
    VALUES (
      'table_create',
      'success',
      NULL,
      'session_workspace_contexts',
      '{"migration": "108", "purpose": "session-workspace-context"}'
    );
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'rbac_audit_logs table not available';
END
$$;