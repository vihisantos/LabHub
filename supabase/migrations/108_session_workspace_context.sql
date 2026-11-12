-- Workspace efetivo por sessão Supabase autenticada.
-- Aplicação posterior exige revisão e aprovação separadas; esta etapa não aplica DDL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.session_workspace_contexts (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_workspace_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_workspace_contexts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_workspace_contexts TO service_role;

CREATE OR REPLACE FUNCTION public.labhub_auth_session_is_active(
  p_session_id uuid,
  p_user_id uuid,
  p_token_exp bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_token_exp IS NULL
     OR p_token_exp <= extract(epoch FROM clock_timestamp())::bigint THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.labhub_set_session_workspace_context(
  p_session_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_token_exp bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_is_super boolean;
  v_revision bigint;
BEGIN
  IF NOT public.labhub_auth_session_is_active(p_session_id, p_user_id, p_token_exp) THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_SESSION_INACTIVE';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKSPACE_REQUIRED';
  END IF;

  SELECT COALESCE(p.is_super_admin, false)
    INTO v_is_super
    FROM public.profiles AS p
   WHERE p.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'PROFILE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces AS w WHERE w.id = p_workspace_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WORKSPACE_NOT_FOUND';
  END IF;

  IF NOT v_is_super AND NOT EXISTS (
    SELECT 1 FROM public.memberships AS m
     WHERE m.profile_id = p_user_id
       AND m.workspace_id = p_workspace_id
       AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKSPACE_MEMBERSHIP_REQUIRED';
  END IF;

  INSERT INTO public.session_workspace_contexts AS existing
    (session_id, user_id, workspace_id, revision, created_at, updated_at)
  VALUES (p_session_id, p_user_id, p_workspace_id, 1, clock_timestamp(), clock_timestamp())
  ON CONFLICT (session_id) DO UPDATE
     SET workspace_id = EXCLUDED.workspace_id,
         revision = existing.revision + 1,
         updated_at = clock_timestamp()
  WHERE existing.user_id = EXCLUDED.user_id
  RETURNING revision INTO v_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SESSION_CONTEXT_OWNER_MISMATCH';
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'revision', v_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.labhub_get_session_workspace_context(
  p_session_id uuid,
  p_user_id uuid,
  p_token_exp bigint
)
RETURNS TABLE (workspace_id uuid, revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT public.labhub_auth_session_is_active(p_session_id, p_user_id, p_token_exp) THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_SESSION_INACTIVE';
  END IF;

  RETURN QUERY
  SELECT c.workspace_id, c.revision
    FROM public.session_workspace_contexts AS c
   WHERE c.session_id = p_session_id
     AND c.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.labhub_create_tv_activation_for_context(
  p_session_id uuid,
  p_user_id uuid,
  p_token_exp bigint,
  p_expected_workspace_id uuid,
  p_expected_revision bigint,
  p_code text,
  p_device_name text,
  p_expires_at timestamptz
)
RETURNS TABLE (code text, expires_at timestamptz, workspace_id uuid, device_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_context public.session_workspace_contexts%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_session_id uuid;
  v_is_super boolean;
  v_disabled_apps jsonb;
  v_membership_id uuid;
  v_role_id uuid;
  v_override_effect text;
  v_base_allowed boolean := false;
  v_action_allowed boolean := false;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_token_exp IS NULL
     OR p_token_exp <= extract(epoch FROM clock_timestamp())::bigint THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_SESSION_INACTIVE';
  END IF;

  -- Serialize against session revocation/expiry updates until the activation
  -- insert commits. A prior EXISTS check alone leaves a revocation race.
  SELECT s.id INTO v_session_id
    FROM auth.sessions AS s
   WHERE s.id = p_session_id
     AND s.user_id = p_user_id
     AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_SESSION_INACTIVE';
  END IF;

  IF p_expected_workspace_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKSPACE_CONTEXT_REQUIRED';
  END IF;
  IF p_code IS NULL OR p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVATION_CODE';
  END IF;
  IF p_device_name IS NOT NULL AND length(p_device_name) > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEVICE_NAME';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
     OR p_expires_at > clock_timestamp() + interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVATION_EXPIRY';
  END IF;

  SELECT c.* INTO v_context
    FROM public.session_workspace_contexts AS c
   WHERE c.session_id = p_session_id
     AND c.user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WORKSPACE_CONTEXT_REQUIRED';
  END IF;
  IF v_context.workspace_id <> p_expected_workspace_id
     OR v_context.revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'WORKSPACE_CONTEXT_CHANGED';
  END IF;

  -- Revalidate the privilege and workspace access at the write boundary.
  -- Locks make concurrent revocation/role changes wait for this transaction.
  SELECT p.* INTO v_profile
    FROM public.profiles AS p
   WHERE p.id = p_user_id
   FOR SHARE;
  IF NOT FOUND OR v_profile.status IN ('blocked', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'PROFILE_NOT_AUTHORIZED';
  END IF;
  v_is_super := COALESCE(v_profile.is_super_admin, false);

  SELECT w.* INTO v_workspace
    FROM public.workspaces AS w
   WHERE w.id = v_context.workspace_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WORKSPACE_NOT_FOUND';
  END IF;

  IF NOT v_is_super THEN
    SELECT m.id, m.role_id
      INTO v_membership_id, v_role_id
      FROM public.memberships AS m
     WHERE m.profile_id = p_user_id
       AND m.workspace_id = v_context.workspace_id
       AND m.status = 'active'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKSPACE_MEMBERSHIP_REQUIRED';
    END IF;

    -- Mirror RBAC 2.0 for tv.manage at the database write boundary.
    -- The membership lock also serializes FK-backed override insertion.
    IF v_role_id IS NOT NULL THEN
      PERFORM 1
        FROM public.role_permissions AS rp
       WHERE rp.role_id = v_role_id
         AND rp.action = 'tv.manage'
         AND rp.scope = 'workspace'
       FOR SHARE;
      v_base_allowed := FOUND;
    END IF;

    SELECT mo.effect
      INTO v_override_effect
      FROM public.membership_overrides AS mo
     WHERE mo.membership_id = v_membership_id
       AND mo.action = 'tv.manage'
     FOR SHARE;

    IF v_override_effect = 'deny' THEN
      v_action_allowed := false;
    ELSIF v_override_effect = 'allow' THEN
      v_action_allowed := true;
    ELSE
      v_action_allowed := v_base_allowed;
    END IF;

    IF NOT v_action_allowed THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TV_MANAGE_PERMISSION_REQUIRED';
    END IF;
  END IF;

  v_disabled_apps := to_jsonb(v_workspace)->'disabled_apps';
  IF v_disabled_apps IS NULL OR v_disabled_apps = 'null'::jsonb THEN
    v_disabled_apps := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_disabled_apps) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKSPACE_MODULE_STATE_INVALID';
  END IF;
  IF v_disabled_apps ? 'tv' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TV_MODULE_DISABLED';
  END IF;

  RETURN QUERY
  INSERT INTO public.tv_activation_codes
    (code, workspace_id, user_id, device_name, status, expires_at)
  VALUES
    (p_code, v_context.workspace_id, p_user_id, p_device_name, 'pending', p_expires_at)
  RETURNING tv_activation_codes.code, tv_activation_codes.expires_at,
            tv_activation_codes.workspace_id, tv_activation_codes.device_name;
END;
$$;

REVOKE ALL ON FUNCTION public.labhub_auth_session_is_active(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.labhub_set_session_workspace_context(uuid, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.labhub_get_session_workspace_context(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.labhub_create_tv_activation_for_context(uuid, uuid, bigint, uuid, bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.labhub_auth_session_is_active(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.labhub_set_session_workspace_context(uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.labhub_get_session_workspace_context(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.labhub_create_tv_activation_for_context(uuid, uuid, bigint, uuid, bigint, text, text, timestamptz) TO service_role;

COMMENT ON TABLE public.session_workspace_contexts IS
  'Backend-confirmed active workspace keyed by a verified Supabase Auth session, not by user_id alone.';
COMMENT ON FUNCTION public.labhub_create_tv_activation_for_context(uuid, uuid, bigint, uuid, bigint, text, text, timestamptz) IS
  'Locks the active Auth session and workspace context, revalidates profile, membership, RBAC tv.manage and TV availability, then atomically inserts the activation code.';

COMMIT;