-- =============================================================================
-- 078_rbac2_tablet_cancel.sql
-- =============================================================================
-- #296 (PR-4D-A) — CANCELAMENTO DE RESERVA DE TABLET AUTORIZADO POR RBAC 2.0.
--
-- Problema (achado da auditoria read-only D4 de `profiles.app_access`):
--   a 050 criou `user_can_cancel_tablet_reservation(uuid)` com DOIS ramos:
--
--       (a) override individual `profiles.app_access->>'reservalab' = 'full'`
--       (b) RBAC 2.0: membership ativa + `reservelab.tablet.cancel`@workspace
--
--   O ramo (a) mantém `profiles.app_access` como fonte de autoridade para o
--   cancelamento — exatamente o que o PR-4D-A encerra para a escrita legada:
--   a autorização passa a vir SOMENTE de membership → role_permissions →
--   `reservelab.tablet.cancel`. O override legado (a) é removido SEM backfill:
--   nenhuma linha de `profiles` é alterada (diferente da 077, que revogou a
--   chave `tv`; aqui NÃO há tratamento de dados de usuário — escopo F2).
--
-- ACTION REUTILIZADA: `reservelab.tablet.cancel` (scope `workspace`)
--   Já existe há 40 migrations, mas NINGUÉM a tem — o catálogo
--   (docs/architecture/rbac2.0-actions-catalog.md §10) a marcava como
--   "A DEFINIR": sem holder não havia acesso prático por RBAC 2.0 e o único
--   caminho real para não-super-admin era o override legado (a). Aqui ela deixa
--   de ser "A DEFINIR" e ganha dono:
--
--     action                      | tec | por que
--     ----------------------------|-----|--------------------------------------
--     reservelab.tablet.reserve   | SIM | 036:395 — role operacional de tablets
--     reservelab.tablet.cancel    | SIM | par da reserve; mesmo operador
--
-- QUEM RECEBE `reservelab.tablet.cancel` (decisao explicita):
--   · `tec` (Tecnico) — SIM. E a role que ja executa a reserva (036:395) e o
--     papel operacional do modulo ReservaLab (catalogo §"ReservaLab").
--   · `opv`/`glm`/`adm`/`vis`/`est` — NAO. ReservaLab nao pertence ao escopo
--     dessas roles hoje; nenhuma detem `reservelab.*`.
--
-- SEMANTICA RESULTANTE (ws_id = unidade avaliada):
--   1. membership ATIVA em ws_id + role com `reservelab.tablet.cancel` ... ALLOW
--   2. sem membership .................................................. DENY
--   3. membership suspensa/removida/pending .......................... DENY
--   4. membership ativa, mas so em OUTRA unidade ..................... DENY
--   5. role sem `reservelab.tablet.cancel` .......................... DENY
--   6. `app_access->>'reservalab' = 'full'` sem a Action ............ DENY
--      (a dependencia funcional de app_access ENCERRADA neste PR)
--
-- FAIL-CLOSED: a helper e um unico `EXISTS` sobre membership ativa + Action.
-- Super admin continua FORA da helper (invariante de policies vigente desde a
-- 050): o bypass vive na policy:
--     tablet_reservations_update = is_super_admin() OR
--                                  (user_belongs_to_workspace AND helper)
-- A policy NAO e reescrita neste PR (BLAST RADIUS minimo).
--
-- FORA DE ESCOPO (deliberadamente):
--   · NAO remove `profiles.app_access` nem a coluna, NAO faz backfill e NAO
--     toca NENHUMA linha de `profiles` (F2 = etapa posterior com backfill
--     auditado). O que muda e apenas a independencia FUNCIONAL da helper.
--   · NAO toca `profiles.role`, RBAC_2_ENABLED, permissionService,
--     useAppAccess, AppGuard, localStorage, Chamados, TV, 077/059;
--   · NAO cria/remover Actions: `reservelab.tablet.cancel` ja e Action de
--     catalogo desde a 036; apenas recebe dono.
-- =============================================================================

-- ─── 1. Seed determinístico da Action por role ───────────────────────────────
--     Idempotente: ON CONFLICT (role_id, action, scope) DO NOTHING (mesma chave
--     da 036). Nenhum DELETE/limpeza de permission existente, nenhum DML em
--     `profiles`/`memberships`/`roles`.
DO $$
DECLARE
  v_tec uuid;
  v_outro_count integer;
BEGIN
  SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
  IF v_tec IS NULL THEN
    RAISE EXCEPTION 'FAIL: role tec ausente — seeds do RBAC 2.0 (036) nao aplicados?';
  END IF;

  INSERT INTO public.role_permissions (role_id, action, scope)
  VALUES (v_tec, 'reservelab.tablet.cancel', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Guarda explicita (fail-closed): NENHUMA outra role pode ter cancel
  -- (mass-grant acidental). O unico holder legitimo e o `tec`.
  SELECT count(*) INTO v_outro_count
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE rp.action = 'reservelab.tablet.cancel'
    AND r.slug <> 'tec';
  IF v_outro_count > 0 THEN
    RAISE EXCEPTION 'FAIL: reservelab.tablet.cancel fora de tec (% role(s)) — mass-grant acidental', v_outro_count;
  END IF;

  RAISE NOTICE 'rbac2 tablet: reservelab.tablet.cancel@workspace -> tec (nenhuma outra role)';
END $$;

-- ─── 2. Helper migrada para RBAC 2.0 puro (ramo legado removido) ─────────────
CREATE OR REPLACE FUNCTION public.user_can_cancel_tablet_reservation(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       JOIN public.role_permissions rp ON rp.role_id = m.role_id
       WHERE m.profile_id = auth.uid()
         AND m.workspace_id = ws_id
         AND m.status = 'active'
         AND rp.action = 'reservelab.tablet.cancel'
         AND rp.scope = 'workspace'
     )
$$;

COMMENT ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) IS
  'RBAC 2.0 (PR-4D-A): true se o caller tem membership ATIVA na unidade ws_id '
  'cuja role concede a Action `reservelab.tablet.cancel` no escopo `workspace`. '
  'O antigo ramo `profiles.app_access->>''reservalab'' = ''full''` (050) foi '
  'removido e NAO concede mais nada aqui. Super admin NAO é tratado por '
  'invariante de policies: o bypass vive em tablet_reservations_update '
  '(is_super_admin() OR (user_belongs_to_workspace AND helper)). '
  'SECURITY DEFINER + search_path fixo (evita recursao de RLS). Fail-closed: '
  'sem membership ativa ou sem a Action, nega.';

-- ACL reaplicada (idempotente), identica a 050:86-90.
REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO service_role;