-- =============================================================================
-- 052: RBAC 2.0 — Fase 9.2-C: escrita administrativa atômica de memberships
--
-- Função `admin_set_user_memberships(p_user_id, p_workspace_ids, p_role_slug)`:
-- grava memberships + espelha `profiles.workspace_ids` NUMA ÚNICA transação
-- (decisão 3.5.1 do desenho 9.2: RPC transacional; o Flask apenas chama).
--
-- Semântica (espelha §3.5 do desenho):
--   - slug desconhecido / perfil inexistente ⇒ aborta ANTES de qualquer escrita;
--   - memberships ausentes do conjunto ⇒ DELETE;
--   - memberships novas ⇒ INSERT com status='active';
--   - memberships existentes com role divergente ⇒ UPDATE de role_id (+ volta a
--     'active' — concessão);
--   - `managed_by` NUNCA é tocado (árvore de gestão preservada);
--   - espelho: `profiles.workspace_ids = p_workspace_ids` (mesma transação);
--   - retorna as memberships resultantes (confirmação para o chamador).
--
-- Segurança:
--   - SECURITY DEFINER (roda como owner, ignora RLS de memberships/profiles);
--   - SEM GRANT para anon/PUBLIC/authenticated — somente service_role executa
--     (o Flask verifica is_super_admin no JWT antes de chamar);
--   - a trigger guarda 046 revalida cada escrita (ciclos, lider→lider, etc.);
--   - criação/remoção de memberships fora deste RPC segue super-admin-only.
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE; reexecutar com o mesmo conjunto é no-op.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_user_memberships(
  p_user_id uuid,
  p_workspace_ids uuid[],
  p_role_slug text
)
RETURNS SETOF public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_ws uuid;
  v_existing_role uuid;
  v_existing_status text;
  v_wanted uuid[] := COALESCE(p_workspace_ids, '{}');
BEGIN
  -- Perfil precisa existir (FK abortaria de qualquer forma; mensagem clara).
  PERFORM 1 FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id;
  END IF;

  -- Cargo precisa existir (slug estável de public.roles).
  SELECT id INTO v_role_id FROM public.roles WHERE slug = p_role_slug;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role slug: %', p_role_slug;
  END IF;

  -- DELETE das ausentes do conjunto desejado.
  DELETE FROM public.memberships m
  WHERE m.profile_id = p_user_id
    AND NOT (m.workspace_id = ANY (v_wanted));

  -- UPSERT das desejadas (role + active; managed_by intocado).
  FOREACH v_ws IN ARRAY v_wanted LOOP
    SELECT m.role_id, m.status INTO v_existing_role, v_existing_status
    FROM public.memberships m
    WHERE m.profile_id = p_user_id AND m.workspace_id = v_ws;

    IF NOT FOUND THEN
      INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
      VALUES (p_user_id, v_ws, v_role_id, 'active');
    ELSIF v_existing_role IS DISTINCT FROM v_role_id OR v_existing_status IS DISTINCT FROM 'active' THEN
      UPDATE public.memberships
      SET role_id = v_role_id,
          status = 'active',
          updated_at = now()
      WHERE profile_id = p_user_id AND workspace_id = v_ws;
    END IF;
  END LOOP;

  -- Espelho de compatibilidade (mesma transação; trigger 041/045 re-sincroniza
  -- de forma idempotente a partir deste mesmo conjunto).
  UPDATE public.profiles
  SET workspace_ids = v_wanted,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN QUERY
  SELECT m.*
  FROM public.memberships m
  WHERE m.profile_id = p_user_id
  ORDER BY m.workspace_id;
END;
$$;

-- Somente service_role executa (o Flask autoriza is_super_admin no JWT).
REVOKE ALL ON FUNCTION public.admin_set_user_memberships(uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_memberships(uuid, uuid[], text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_user_memberships(uuid, uuid[], text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_memberships(uuid, uuid[], text) TO service_role;

COMMENT ON FUNCTION public.admin_set_user_memberships(uuid, uuid[], text) IS
  'RBAC 2.0 (052, Fase 9.2-C): escrita administrativa ATÔMICA de memberships + espelho profiles.workspace_ids. Chamado apenas pelo backend (service_role) após checar is_super_admin no JWT. Preserva managed_by; reativa concessões como active.';
