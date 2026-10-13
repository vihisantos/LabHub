-- 098_tablet_reservations_update_horario_fim_rls.sql
-- Issue #388 — ReservaLab: impedir atualização de reserva de tablet após horario_fim.
--
-- Regra de negócio: uma reserva só pode ser atualizada enquanto `horario_fim`
-- não passou (comparação do instante completo, timestamptz).
--
-- POR QUE REESCREVER A POLICY (e não criar um helper novo):
--   A 078 deixou explícito que a policy `tablet_reservations_update` é
--   `is_super_admin() OR (user_belongs_to_workspace(workspace_id) AND
--   user_can_cancel_tablet_reservation(workspace_id))` e que esse shape é uma
--   invariante coberta pelos testes estruturais 050 e 078. A regra temporal
--   nova entra NA policy, preservando os três pilares de autorização:
--     · bypass explícito de super admin (`is_super_admin()`);
--     · isolamento por workspace (`user_belongs_to_workspace(workspace_id)`);
--     · checagem RBAC 2.0 (`user_can_cancel_tablet_reservation(workspace_id)`).
--
-- SEMÂNTICA DA REGRA TEMPORAL (por que `USING` e `WITH CHECK`):
--   Em uma policy FOR UPDATE:
--     · o `USING` é avaliado sobre a linha EXISTENTE (OLD);
--     · o `WITH CHECK` sobre a linha NOVA (NEW).
--   A condição temporal vive no `USING`: uma reserva já encerrada
--   (`OLD.horario_fim <= now()`) não satisfaz o predicado e o UPDATE é recusado
--   antes de qualquer escrita. Isso impede que alguém "ressuscite" uma reserva
--   encerrada alterando `horario_fim` para o futuro — o valor considerado é o
--   OLD, não o NEW.
--   O `WITH CHECK` repete a condição para impedir o caminho inverso: empurrar
--   para o passado uma reserva ativa, o que a tornaria imediatamente
--   não-editável e burlaria a intenção da regra.
--
--   `horario_fim > now()` (e não `>=`) mantém paridade exata com o frontend
--   (`isTabletReservaEditable`: `fim > Date.now()`).

-- ─── 1. Remove a policy anterior (e o helper efêmero de uma versão preliminar
--        desta migration, se existir) — idempotente ─────────────────────────
DROP POLICY IF EXISTS "tablet_reservations_update" ON public.tablet_reservations;
DROP FUNCTION IF EXISTS public.user_can_update_tablet_reservation(uuid);

-- ─── 2. Recria a policy UPDATE preservando RBAC/RLS e adicionando a regra
--        temporal ────────────────────────────────────────────────────────────
CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(workspace_id)
      AND public.user_can_cancel_tablet_reservation(workspace_id)
      AND horario_fim > now()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(workspace_id)
      AND public.user_can_cancel_tablet_reservation(workspace_id)
      AND horario_fim > now()
    )
  );

COMMENT ON POLICY "tablet_reservations_update" ON public.tablet_reservations IS
  'Issue #388: UPDATE permitido apenas enquanto horario_fim não passou, mantendo '
  'o bypass de super admin (is_super_admin()) e o RBAC 2.0 já vigente desde '
  '050/078 (user_belongs_to_workspace + user_can_cancel_tablet_reservation). '
  'O USING avalia a linha OLD (impede ressuscitar reserva encerrada); o '
  'WITH CHECK avalia a linha NEW (impede empurrar reserva ativa para o passado).';
