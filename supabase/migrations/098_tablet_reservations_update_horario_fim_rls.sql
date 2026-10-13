-- 098_tablet_reservations_update_horario_fim_rls.sql
-- Issue #388 — ReservaLab: impedir atualização de reserva de tablet após
-- horario_fim, para TODOS os perfis — inclusive super admin.
--
-- Regra de negócio: uma reserva só pode ser atualizada enquanto `horario_fim`
-- não passou (comparação do instante completo, timestamptz). A regra é garantida
-- pela RLS (não apenas pela interface) e não possui exceção de perfil.
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
-- FIX DO BYPASS TEMPORAL DE SUPER ADMIN (v2 — fechamento da Issue #388):
--   A primeira versão desta migration colocou `horario_fim > now()` DENTRO do
--   ramo `user_belongs_to_workspace AND user_can_cancel_tablet_reservation`,
--   deixando o ramo `is_super_admin()` sem a condição temporal. Resultado:
--   o super admin podia atualizar reservas encerradas — o RLS NÃO impedia.
--   A versão final promove a regra temporal a CONJUNÇÃO DE TOPO:
--
--     USING / WITH CHECK =
--       horario_fim > now()                        -- regra temporal: TODOS
--       AND (
--         is_super_admin()                         -- bypass de workspace APENAS
--         OR (
--           user_belongs_to_workspace(workspace_id)
--           AND user_can_cancel_tablet_reservation(workspace_id)
--         )
--       )
--
--   · A regra temporal é o PRIMEIRO operando da AND de topo — fora do alcance
--     do `OR` do bypass. Nenhum perfil (super admin incluído) pode ignorá-la.
--   · O bypass de super admin é preservado EXCLUSIVAMENTE para os privilégios
--     que não conflitam com a janela temporal (quais workspaces/memberships
--     podem editar), nunca para a janela em si.
--   · Nenhum outro artefato foi tocado: `tablet_reservations_delete` continua
--     super admin only e `tablet_reservations_insert` permanece intacta.
--   · A seção 3 torna EXPLÍCITOS os grants de tabela que a produção Supabase já
--     concede por default privileges (padrão 091/093/096), para que o PostgreSQL
--     efêmero do CI modele produção e possa exercitar a RLS. RLS intacta.
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

-- ─── 2. Recria a policy UPDATE preservando RBAC/RLS e tornando a regra
--        temporal uma CONJUNÇÃO DE TOPO (aplicável a todos os perfis) ───────
CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  TO authenticated
  USING (
    horario_fim > now()
    AND (
      public.is_super_admin()
      OR (
        public.user_belongs_to_workspace(workspace_id)
        AND public.user_can_cancel_tablet_reservation(workspace_id)
      )
    )
  )
  WITH CHECK (
    horario_fim > now()
    AND (
      public.is_super_admin()
      OR (
        public.user_belongs_to_workspace(workspace_id)
        AND public.user_can_cancel_tablet_reservation(workspace_id)
      )
    )
  );

COMMENT ON POLICY "tablet_reservations_update" ON public.tablet_reservations IS
  'Issue #388: UPDATE permitido apenas enquanto horario_fim > now() para TODOS os '
  'perfis, inclusive super admin — a regra temporal é conjunção de topo e não pode '
  'ser ignorada pelo bypass. Super admin mantém apenas o bypass de workspace/RBAC; '
  'os demais exigem membership ativa + Action reservelab.tablet.cancel@workspace. '
  'O USING avalia a linha OLD (impede ressuscitar reserva encerrada); o WITH CHECK '
  'avalia a linha NEW (impede empurrar reserva ativa para o passado).';

-- ─── 3. Grants explícitos de tabela (padrão 026/033, seguido por 091/093/096) ─
--   `tablet_reservations` é anterior ao padrão de grants explícitos: em DEV/PROD
--   a tabela herdava os default privileges amplos da plataforma Supabase
--   (schema public → anon/authenticated/service_role), enquanto o PostgreSQL
--   efêmero do CI NÃO os aplica. Sem o grant, um SELECT/UPDATE de `authenticated`
--   falha com 42501 (insufficient_privilege) ANTES de a RLS ser avaliada — o que
--   dá falsa segurança: a regra temporal não chega a ser exercitada.
--   Explicitamos o MESMO estado efetivo de produção (`não dependa de default
--   privileges da plataforma` — 093). A RLS permanece habilitada e é quem
--   restringe as linhas: o grant de tabela NÃO amplia acesso efetivo.
REVOKE ALL ON public.tablet_reservations FROM anon;
REVOKE ALL ON public.tablet_reservations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablet_reservations TO authenticated;
GRANT ALL ON public.tablet_reservations TO service_role;
