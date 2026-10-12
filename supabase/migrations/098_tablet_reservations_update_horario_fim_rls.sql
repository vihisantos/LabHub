-- 098_tablet_reservations_update_horario_fim_rls.sql
-- Impedir atualização de reservas de tablet após horario_fim.
-- Regra de negócio: uma reserva só pode ser atualizada enquanto horario_fim não passou.

-- Helper: verifica se o caller pode atualizar a reserva.
-- Reutiliza a função existente user_can_cancel_tablet_reservation (RBAC 2.0).
-- A regra temporal é aplicada ANTES da verificação RBAC: se horario_fim já passou, NEGA.
-- Isso impede que um update altere horario_fim para contornar a regra (o OLD.horario_fim é verificado).

CREATE OR REPLACE FUNCTION public.user_can_update_tablet_reservation(
  reservation_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horario_fim timestamptz;
  v_workspace_id uuid;
  v_can_update boolean;
BEGIN
  -- Busca horario_fim e workspace_id da reserva ANTES da atualização (OLD)
  SELECT horario_fim, workspace_id
  INTO v_horario_fim, v_workspace_id
  FROM public.tablet_reservations
  WHERE id = reservation_id;

  IF v_horario_fim IS NULL THEN
    RETURN false;
  END IF;

  -- Regra temporal: se horario_fim já passou, NEGA a atualização
  -- Usa now() AT TIME ZONE 'UTC' para comparar com horario_fim (timestamptz)
  IF v_horario_fim <= now() AT TIME ZONE 'UTC' THEN
    RETURN false;
  END IF;

  -- Verifica permissão RBAC 2.0 via função existente
  -- Passa o workspace_id já obtido (evita query extra)
  v_can_update := public.user_can_cancel_tablet_reservation(v_workspace_id);

  RETURN COALESCE(v_can_update, false);
END;
$$;

COMMENT ON FUNCTION public.user_can_update_tablet_reservation(uuid) IS
  'Retorna true se o caller pode atualizar a reserva de tablet:
   - horario_fim ainda não passou (regra temporal obrigatória)
   - E o caller tem permissão RBAC 2.0 (reservelab.tablet.cancel no workspace)
   Usada na policy tablet_reservations_update.';

-- Garante que a função não seja executável por roles não autorizadas
REVOKE EXECUTE ON FUNCTION public.user_can_update_tablet_reservation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_update_tablet_reservation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_update_tablet_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_update_tablet_reservation(uuid) TO service_role;

-- Atualiza a policy UPDATE para usar a nova função
DROP POLICY IF EXISTS "tablet_reservations_update" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  USING (
    public.user_can_update_tablet_reservation(id)
  )
  WITH CHECK (
    public.user_can_update_tablet_reservation(id)
  );

COMMENT ON POLICY "tablet_reservations_update" ON public.tablet_reservations IS
  'UPDATE permitido apenas se: (1) horario_fim ainda não passou, (2) caller tem permissão RBAC 2.0 (reservelab.tablet.cancel no workspace) OU é super_admin. O bypass de super_admin está na função user_can_cancel_tablet_reservation.';