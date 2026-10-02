-- =============================================================================
-- 086_rbac2_module_permissions.sql
-- =============================================================================
-- ALINHA `role_permissions` COM A MATRIZ DE VISIBILIDADE DE MÓDULOS.
--
-- A matriz de visibilidade (`src/core/permissions/moduleVisibility.ts`) e o
-- `role_permissions` são DOIS eixos independentes por construção:
--
--     visibilidade .... membership ativa → roles.slug → MODULE_VISIBILITY_BY_SLUG
--     operação ....... membership ativa → role_permissions → Action → RLS/backend
--
-- Esta migration NÃO muda a matriz (isso é `moduleVisibility.ts`) e NÃO muda
-- nenhuma policy, helper ou rota. Ela ajusta apenas o eixo de AUTORIZAÇÃO das
-- permissões que a nova matriz passa a exibir, e trava o resto para que a
-- correção de visibilidade não vire escalada de privilégio.
--
-- ---------------------------------------------------------------------------
-- 1. `tv.manage` → `tec` (SUPERSEDE a decisão da 077/059) — PRODUTO
-- ---------------------------------------------------------------------------
-- Antes desta migration, o técnico era o ÚNICO papel de execução sem nenhuma
-- Action que o habilitasse awrites de TV, e `tv.manage` — a ÚNICA Action de TV
-- que o banco realmente aplica (077:152-170 `user_can_manage_tv` →
-- 059:83-92 `tv_can_manage_workspace` → ~22 policies RLS + `station_begin_mutation`
-- + os RPCs de schedule) — era de `opv` e `adm`:
--
--     077:125-128   (v_opv, 'tv.manage', 'workspace'), (v_adm, 'tv.manage', 'workspace')
--     077:130-137   RAISE EXCEPTION se `tec` receber `tv.manage`
--
-- Resultado: o técnico tinha `tv.content.manage` e `tv.urgentAnnouncement`
-- semeadas desde a 036 (036:396-397) que são MORTAS — nenhuma policy, RPC ou
-- `useCanAccessAction` as lê — e nenhuma Authority de escrita que exista.
--
-- DECISÃO DE PRODUTO (task RBAC 2.0): o técnico deve ter acesso `full` à TV, e
-- `full` sem Authority de escrita seria uma tela que não opera nada. Por isso o
-- técnico passa a receber `tv.manage`. Isto é uma CONCESSÃO deliberada de
-- escrita de TV a todos os técnicos e SUBSTITUI a trava da 077:130-137 e a
-- justificativa da 059:19-26 ("mass-grant de escrita de TV a todos os técnicos").
-- A trava NÃO é afrouxada para nenhum outro papel — ver §3.
--
-- O que `tv.manage` concede de fato: escrita nas tabelas `tv_*` do workspace da
-- membership (conteúdo, playlists, anúncios, galerias, filas, música, estações e
-- schedules) e nos comandos de estação. NÃO concede: `admin.app.purge` /
-- `tv.purge` (purga de dados e settings, guardados por `can_manage_workspace_apps`,
-- 076:75-99 — de `adm`), nem `reservelab.push.manage`, nem qualquer `admin.*`.
--
-- ---------------------------------------------------------------------------
-- 2. O QUE ESTA MIGRATION NÃO CONCEDE (leitura não é escalada por visibilidade)
-- ---------------------------------------------------------------------------
-- A matriz agora declara `read` de TV e ReservaLab para `vis` e `coordinator`,
-- e `read` de Chamados para `coordinator`. Abrir um MÓDULO não pode vir com
-- Action de escrita. Logo, NADA é concedido a `vis` nem a `coordinator` aqui:
--
--   · `vis` (036:401-406) continua com exatamente `ticket.view`, `ticket.report`,
--     `stock.export`, `pcare.export` — as 4 Actions de leitura/exportação que já
--     tinha. Nenhuma mutação. Trava nova em §3.
--   · `coordinator` (040:77-91 + 082:180) preserva as 12 Actions que já tinha
--     (`ticket.view/edit/status/assign/comment/close/reopen/report/qr`,
--     `stock.export`, `pcare.export`, `chamados.settings.manage`). A matriz
--     desceu `chamados` de `full` para `read`, mas REVOGAR a capacidade
--     operacional do coordenador multiunidade é decisão de produto separada e
--     quebraria o harness da 082 (`tests/082:242-250`, que exige exatamente
--     `tec`/`lider`/`coordinator` com `chamados.settings.manage`). Nenhuma Action
--     nova é concedida ao coordenador; as linhas vermelhas da 040:20-26 são
--     travadas em §3.
--   · `reservelab.tablet.*` continua só em `tec` (036:395, 078:77-79).
--
-- ---------------------------------------------------------------------------
-- 3. TRAVAS ANTI-MASS-GRANT / ANTI-ES CALADA
-- ---------------------------------------------------------------------------
-- Mesma técnica das 077:130-137, 078:83-90 e 082:186-218 — se o estado do banco
-- divergir do que esta migration declara, ela ABORTA em vez de seguir. Todas
-- são fail-closed e todas abortam a migration inteira (transação do runner).
--
--   TRAVA 1  `tec` tem exatamente 1 `tv.manage@workspace`.
--   TRAVA 2  `tv.manage` não existe em NENHUM cargo fora de `opv`/`adm`/`tec`.
--   TRAVA 3  `tv.manage` só existe no escopo `workspace` (nunca `global`/`self` —
--            `global` tornaria a Action indelegável, como `rbac.py:165-166`).
--   TRAVA 4  `vis` não possui NENHUMA Action de mutação. É o invariante que
--            sustenta "read em tudo ≠ escrita": se um seed futuro conceder
--            escrita ao visualizador, esta migration futura aborta aqui.
--   TRAVA 5  `coordinator` continua sem `tv.manage`, sem `reservelab.*`, sem
--            escrita/gestão de estoque ou PC Care e sem `admin.*` (040:20-26),
--            sem `ticket.delete` e sem `ticket.weeklyEmail`.
--
-- ---------------------------------------------------------------------------
-- 4. FORA DE ESCOPO (deliberado — dívida técnica, NÃO corrigida aqui)
-- ---------------------------------------------------------------------------
--   · `tablet_reservations_insert` (034:79-85) autoriza INSERT por MEMBERSHIP,
--     sem Action: um `vis` consegue criar reserva de tablet por chamada direta.
--     Já documentado em `src/apps/reservalab/pages/Tablets.tsx:70-73` e no
--     catálogo (`rbac2.0-actions-catalog.md:327`, `:509` — "A DEFINIR"). Fora
--     desta PR.
--   · `opv`/`est`/`adm` são `UNMAPPED_SLUGS` (`moduleVisibility.ts`) e resolvem
--     `none` em todos os módulos — `opv` e `adm` são os únicos com `tv.manage`
--     e ficam trancados fora da tela de TV. Fora desta PR.
--   · `ticket.qr` é uma permission sem nenhum ponto de aplicação.
--   · `lider` tem `chamados: full` na matriz e nenhuma Action de leitura em
--     Chamados: vê o app e toma 403 no backend. Fora desta PR.
--   · NÃO altera `memberships`, `roles`, policies, helpers, `profiles.*`,
--     `MODULE_VISIBILITY_BY_SLUG`, o bypass de super admin nem nenhuma Action.
--
-- IDEMPOTÊNCIA: `ON CONFLICT (role_id, action, scope) DO NOTHING` (mesma chave da
-- 036/040/077/078/082). Nenhum DELETE, nenhuma tabela nova, nenhuma função nova
-- (logo nada a REVOKE). Reexecutar é seguro.
-- =============================================================================


-- ─── 1. Grant determinístico: `tv.manage@workspace` → tec ─────────────────────
DO $$
DECLARE
  v_tec       uuid;
  v_opv       uuid;
  v_adm       uuid;
  v_vis       uuid;
  v_coord     uuid;
  v_count     integer;
  v_offended  integer;
BEGIN
  SELECT id INTO v_tec   FROM public.roles WHERE slug = 'tec';
  SELECT id INTO v_opv   FROM public.roles WHERE slug = 'opv';
  SELECT id INTO v_adm   FROM public.roles WHERE slug = 'adm';
  SELECT id INTO v_vis   FROM public.roles WHERE slug = 'vis';
  SELECT id INTO v_coord FROM public.roles WHERE slug = 'coordinator';

  IF v_tec IS NULL OR v_opv IS NULL OR v_adm IS NULL OR v_vis IS NULL OR v_coord IS NULL THEN
    RAISE EXCEPTION 'FAIL: roles tec/opv/adm/vis/coordinator ausentes — seeds do RBAC 2.0 (036/040) nao aplicados?';
  END IF;

  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_tec, 'tv.manage', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- TRAVA 1 — `tec` tem exatamente uma `tv.manage@workspace`.
  SELECT count(*) INTO v_count
  FROM public.role_permissions
  WHERE role_id = v_tec AND action = 'tv.manage' AND scope = 'workspace';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: tec deve ter exatamente 1 tv.manage@workspace (encontradas %)', v_count;
  END IF;

  -- TRAVA 2 — nenhum cargo fora de opv/adm/tec recebe `tv.manage`. Fecha a
  -- concessão desta migration sem reabrir o mass-grant para `vis`/`coordinator`
  -- (que a matriz agora exibe em `tv: read`).
  SELECT count(*) INTO v_count
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE rp.action = 'tv.manage'
    AND r.slug NOT IN ('opv', 'adm', 'tec');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL: tv.manage concede escrita de TV a cargo fora de opv/adm/tec (encontradas %)', v_count;
  END IF;

  -- TRAVA 3 — escopo: `workspace` em todos os casos. `global` tornaria a Action
  -- indelegável (rbac.py:165-166) e mudaria a semântica por unidade.
  SELECT count(*) INTO v_offended
  FROM public.role_permissions
  WHERE action = 'tv.manage' AND scope <> 'workspace';
  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: tv.manage so pode existir no escopo workspace (encontradas % fora)', v_offended;
  END IF;

  -- TRAVA 4 — `vis` e leitura pura: nenhuma Action de mutação. A matriz mudou
  -- `vis` de `reservalab: dash` para `read` e adicionou `tv: read`; nenhuma
  -- dessas telas pode vir acompanhada de escrita.
  SELECT count(*) INTO v_offended
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE r.slug = 'vis'
    AND rp.action IN (
      'ticket.create', 'ticket.edit', 'ticket.status', 'ticket.assign',
      'ticket.comment', 'ticket.close', 'ticket.reopen', 'ticket.delete',
      'ticket.claim', 'ticket.qr', 'ticket.weeklyEmail',
      'chamados.settings.manage',
      'stock.item.create', 'stock.item.edit', 'stock.item.delete',
      'stock.movement.create', 'stock.movement.manage', 'stock.kit.audit',
      'stock.inventory.run', 'stock.maintenance.manage',
      'pcare.asset.create', 'pcare.asset.edit', 'pcare.asset.manage',
      'pcare.part.create', 'pcare.part.edit', 'pcare.part.delete',
      'pcare.maintenance.manage', 'pcare.import',
      'pcare.checklist.create', 'pcare.checklist.edit', 'pcare.checklist.delete',
      'reservelab.tablet.reserve', 'reservelab.tablet.cancel', 'reservelab.push.manage',
      'tv.manage', 'tv.content.manage', 'tv.urgentAnnouncement',
      'tv.device.manage', 'tv.settings.manage', 'tv.purge',
      'music.moderate', 'admin.app.purge'
    );
  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: cargo vis e somente-leitura e nao pode receber Action de mutacao (encontradas %)', v_offended;
  END IF;

  -- TRAVA 5 — linhas vermelhas do coordenador (040:20-26) continuam válidas. A
  -- matriz o expõe em `read` nos 5 módulos; nenhuma delas pode virar escrita.
  SELECT count(*) INTO v_offended
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE r.slug = 'coordinator'
    AND (
      rp.action = 'tv.manage'
      OR rp.action LIKE 'tv.%'
      OR rp.action LIKE 'music.%'
      OR rp.action LIKE 'reservelab.%'
      OR rp.action LIKE 'admin.%'
      OR rp.action = 'ticket.delete'
      OR rp.action = 'ticket.weeklyEmail'
      OR rp.action IN (
        'stock.item.create', 'stock.item.edit', 'stock.item.delete',
        'stock.movement.create', 'stock.movement.manage', 'stock.kit.audit',
        'stock.inventory.run', 'stock.maintenance.manage',
        'pcare.asset.create', 'pcare.asset.edit', 'pcare.asset.manage',
        'pcare.part.create', 'pcare.part.edit', 'pcare.part.delete',
        'pcare.maintenance.manage', 'pcare.import',
        'pcare.checklist.create', 'pcare.checklist.edit', 'pcare.checklist.delete'
      )
    );
  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: coordinator mantem as linhas vermelhas da 040 (encontradas % violacoes)', v_offended;
  END IF;

  RAISE NOTICE 'rbac2 086: tv.manage@workspace -> tec (além de opv/adm); vis e coordinator sem concededoes; escopo e matriz inalterados';
END $$;