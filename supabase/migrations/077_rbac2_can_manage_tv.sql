-- =============================================================================
-- 077_rbac2_can_manage_tv.sql
-- =============================================================================
-- #296 (PR-4B) — GERENCIAMENTO DA TV PASSA A SER AUTORIZADO POR RBAC 2.0.
--
-- Problema (achado da auditoria read-only de `profiles.role`/`profiles.app_access`):
--   `public.user_can_manage_tv(uuid)`, criada na 059, resolvia a autoridade de
--   gerenciamento da TV por UM ÚNICO sinal:
--
--       COALESCE(p.app_access->>'tv', '') = 'full'
--
--   Ou seja, `profiles.app_access` era a fonte de verdade. Pior: essa era a
--   ÚNICA leitura de `app_access->>'tv'` em todo o repositório, e ela era
--   suficiente porque é a base de `tv_can_manage_workspace`, o predicado de
--   escrita de TODAS as tabelas tv_* + 4 RPCs. Não havia branch RBAC 2.0
--   nenhum — diferente de `user_can_cancel_tablet_reservation` (050), que já
--   tinha `app_access` OU `role_permissions`.
--
-- A 059 adiou essa branch de propósito (059:19-26):
--   "as actions estão seedadas também para o cargo 'tec' (036) e dariam
--    mass-grant de escrita a todos os técnicos, contradizendo o AppAccessLevel
--    atual (tec = sem TV)".
--   Esse adiamento é resolvido aqui com uma Action DEDICADA (`tv.manage`), que
--   NÃO é nenhuma das actions granulares já semeadas — ver a tabela abaixo.
--
-- ACTION CRIADA: `tv.manage` (scope `workspace`)
--   Ações de TV já existentes e seus donos (confirmado no catálogo §"TV" e nos
--   seeds da 036) — nenhuma pode ser reutilizada, porque TODASmass-grant:
--
--     action                  | tec | opv | adm | por que não serve
--     ------------------------|-----|-----|-----|--------------------------------
--     tv.content.manage       | SIM | SIM | --- | semeada p/ tec => mass-grant
--     tv.urgentAnnouncement   | SIM | SIM | --- | idem
--     tv.device.manage        | --- | SIM | --- | so opv; nao cobre conteudo
--     tv.settings.manage      | --- | SIM | SIM | so settings, nao conteudo
--     music.moderate          | --- | SIM | --- | so moderacao de pedidos
--     tv.purge                | --- | --- | SIM | e um ADMIN (purge), nao gestao
--
--   `tv.manage` e a acao de MODULO: "pode gerenciar o conteudo/configuracao da
--   TV desta unidade". E o que a 059 exigia de fato.
--
-- QUEM RECEBE `tv.manage` (decisao explicita, nao automatica):
--   · `opv` (Operador TV) — SIM. A role se chama exatamente isso e ja holds as
--     6 actions granulares de TV da 036.
--   · `adm` (Admin de Workspace) — SIM. Ja holds `tv.settings.manage` e
--     `tv.purge` (036:443-447). Antes da 059, escrita de TV era liberada a
--     QUALQUER membro do workspace; um `adm` era membro. Sem esta concessao o
--     PR introduziria perda de acesso nova para o admin de workspace.
--   · `tec` (Tecnico) — NAO. A 059 documenta explicitamente que dar acao de TV
--     ao `tec` contradiz o AppAccessLevel atual (`tec` = sem TV) e causaria
--     mass-grant. Este PR mantem essa decisao.
--   · `vis`, `est` — NAO. Sem qualquer acao de TV hoje.
--
-- SEMANTICA RESULTANTE (ws_id = unidade avaliada):
--   1. membership ATIVA em ws_id + role com `tv.manage`@workspace ... ALLOW
--   2. sem membership .................................................. DENY
--   3. membership suspensa/removida/pending .......................... DENY
--   4. membership ativa, mas so em OUTRA unidade ..................... DENY
--   5. role sem `tv.manage` ......................................... DENY
--   6. `app_access->>'tv' = 'full'` sem `tv.manage` ................... DENY
--      (a dependencia funcional de app_access ENCERRADA neste PR)
--
-- FAIL-CLOSED: a helper e um unico `EXISTS` sobre membership ativa. Sem
-- membership, sem permissao ou com workspace divergente, o EXISTS e falso e a
-- helper nega. Nao ha ramo permissivo nem fallback.
--
-- SUPER ADMIN: NAO entra na helper, por invariante de policies ja vigente
-- desde a 059 — o bypass vive na policy:
--     tv_can_manage_workspace = is_super_admin() OR
--                                (user_belongs_to_workspace AND user_can_manage_tv)
-- Colocar `is_super_admin()` dentro da helper seria redundante e violaria esse
-- invariante (e o teste api/tests/test_059_tv_rbac_full_write_migration.py:62).
-- O comportamento observable do super admin NAO MUDA: continua ALLOW via bypass.
--
-- BLAST RADIUS MINIMO: as 4 policies/funcoes consumidoras NAO sao reescritas.
-- Trocar apenas o CORPO da helper realoca de uma vez:
--   · ~20 policies RLS (via `tv_can_manage_workspace`, 030 + 055/059/062) em
--     tv_events, tv_playlists, tv_announcements, tv_galleries,
--     tv_gallery_photos, tv_music_queues, tv_music_tracks, tv_calendar_cache,
--     tv_urgent_announcements, tv_devices, tv_activation_codes;
--   · as 2 policies de tv_music_requests (SELECT/UPDATE, 059:95-111);
--   · os gates RPC de 060/062/064 (station, schedules, reservation).
--
-- ASSINATURA E ACL PRESERVADAS: `user_can_manage_tv(uuid)` (parametro `ws_id`),
-- `SECURITY DEFINER`, `SET search_path = public`, `LANGUAGE sql STABLE`. Os
-- REVOKE/GRANT da 059 sao reaplicados (idempotentes) — `CREATE OR REPLACE` nao
-- reseta privilegios, mas reaplicar mantem o estado explicito e auditavel.
--
-- FORA DE ESCOPO (deliberadamente):
--   · NAO remove `profiles.app_access` nem a coluna (a migracao e apenas a
--     independencia FUNCIONAL da helper; a coluna segue existindo e legivel
--     por leitores de compatibilidade, ate uma etapa posterior com backfill
--     auditado — ver o DIAGNOSTICO no fim desta migration);
--   · NAO toca `profiles.role`, RBAC_2_ENABLED, permissionService, useAppAccess,
--     AppGuard, localStorage, `/api/push/action`, ReservaLab (`050`), Chamados,
--     Estoque, Coordinator, Admin, migrations 030/059/060/062/064;
--   · NAO recria Actions granulares de TV nem mexe nelas.
--
-- BACKFILL: ver a secao DIAGNOSTICO. Resumindo: o seed da Action por role e
-- deterministico e e feito aqui. A conversao de USUARIOS que hoje dependem de
-- `app_access->>'tv' = 'full'` NAO e feita, porque `app_access` nao tem dimensao
-- de workspace — e inventar a associacao seria criar acesso por acidente.
-- =============================================================================

-- ─── 1. Action `tv.manage` + seed determinístico por role ───────────────────
--     Idempotente: ON CONFLICT (role_id, action, scope) DO NOTHING (mesma
--     chave usada pela 036). Nenhum DELETE/limpeza de permission existente.
DO $$
DECLARE
  v_opv uuid;
  v_adm uuid;
  v_tec uuid;
BEGIN
  SELECT id INTO v_opv FROM public.roles WHERE slug = 'opv';
  SELECT id INTO v_adm FROM public.roles WHERE slug = 'adm';
  SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';

  IF v_opv IS NULL OR v_adm IS NULL THEN
    RAISE EXCEPTION 'FAIL: roles opv/adm ausentes — seeds do RBAC 2.0 (036) nao aplicados?';
  END IF;

  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_opv, 'tv.manage', 'workspace'),
    (v_adm, 'tv.manage', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Guarda explícita: `tec` NAO pode receber `tv.manage` (decisão da 059:19-26
  -- — mass-grant de escrita de TV a todos os técnicos).
  IF v_tec IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role_id = v_tec AND action = 'tv.manage'
  ) THEN
    RAISE EXCEPTION 'FAIL: role tec não deve receber tv.manage (mass-grant de TV)';
  END IF;

  RAISE NOTICE 'rbac2 tv: tv.manage@workspace -> opv, adm (tec explicitamente excluído)';
END $$;

COMMENT ON FUNCTION public.user_can_manage_tv(uuid) IS
  'RBAC 2.0 (#296 PR-4B): true se o caller tem membership ATIVA na unidade ws_id '
  'cuja role concede a Action `tv.manage` no escopo `workspace`. A antiga '
  'autoridade `profiles.app_access->>''tv'' = ''full''` (migration 059) NAO concede '
  'mais nada aqui. Super admin NAO é tratado aqui por invariante de policies: o '
  'bypass vive em tv_can_manage_workspace (is_super_admin() OR (... AND helper)). '
  'SECURITY DEFINER + search_path fixo (evita recursão de RLS). Fail-closed: sem '
  'membership ativa ou sem a Action, nega.';

-- ─── 2. Helper migrada para RBAC 2.0 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_manage_tv(ws_id uuid)
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
         AND rp.action = 'tv.manage'
         AND rp.scope = 'workspace'
     )
$$;

-- ACL reaplicada (idempotente), idêntica à 059:77-80.
REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO service_role;

-- ─── 3. DIAGNÓSTICO (read-only; não altera dado algum) ───────────────────────
--     Quem perde acesso de TV se ainda não tiver `tv.manage`? Esta PR não
--     regulariza esses perfis: `app_access` é um override POR PERFIL, sem
--     dimensão de workspace, então não existe conversão determinística para
--     (membership, role). A regularização é via RPC 072
--     (admin_upsert_membership), por unidade, com decisão humana.
DO $$
DECLARE
  v_dep        integer;
  v_perdendo   integer;
  v_jah_coberto integer;
BEGIN
  SELECT count(*) INTO v_dep
  FROM public.profiles p
  WHERE COALESCE(p.app_access->>'tv', '') = 'full';

  SELECT count(*) INTO v_jah_coberto
  FROM public.profiles p
  WHERE COALESCE(p.app_access->>'tv', '') = 'full'
    AND EXISTS (
      SELECT 1
      FROM public.memberships m
      JOIN public.role_permissions rp ON rp.role_id = m.role_id
      WHERE m.profile_id = p.id
        AND m.status = 'active'
        AND rp.action = 'tv.manage'
        AND rp.scope = 'workspace'
    );

  v_perdendo := v_dep - v_jah_coberto;

  RAISE NOTICE 'tv.manage — dependentes de app_access->>''tv''=''full'': %; já cobertos por RBAC 2.0: %; PERDERÃO acesso de TV até regularização via RPC 072: %',
    v_dep, v_jah_coberto, v_perdendo;

  IF v_perdendo > 0 THEN
    RAISE WARNING 'ATENÇÃO: % perfil(s) com app_access->>''tv''=''full'' sem `tv.manage` em membership ativa. Regularize via admin_upsert_membership (migration 072) antes de decidir sobre remover app_access.',
      v_perdendo;
  END IF;
END $$;
