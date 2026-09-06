-- =============================================================================
-- 040_rbac2_coordinator_role.sql
-- =============================================================================
-- RBAC 2.0 — CARGO "COORDENADOR MULTIUNIDADE" (role slug 'coordinator').
--
-- Contexto:
--   O schema RBAC 2.0 (036) define membros via `memberships`
--   (profile × workspace × role) e o motor de enforcement
--   (`src/apps/reservalab/api/rbac.py`) resolve Actions por contribuição de
--   membership. Este cargo adiciona à hierarquia determinística uma posição
--   de GESTÃO OPERACIONAL DE MÚLTIPLAS UNIDADES: o coordenador recebe
--   memberships em vários workspaces (escopo `all_assigned`), coordena os
--   chamados e ACOMPANHA estoque / PC Care / TV — sem jamais obter as
--   funções administrativas globais.
--
-- Hierarquia (spec §): Super Admin (is_super_admin — NÃO é cargo) >
--   Coordenador Multiunidade > Gestor de Unidade/Admin de Workspace (adm) >
--   Técnico (tec) > Visualizador (vis).
--
-- LINHAS VERMELHAS (o que o coordenador NÃO recebe, por garantia do seed):
--   - Nenhuma Action `admin.*` (approve/reject/edit/role/workspace/audit/
--     backup/purge/wipe/logs/notification) — todas escopo global.
--   - Nenhuma Action destrutiva: `ticket.delete`, `ticket.weeklyEmail`,
--     `tv.purge`, `tv.device.manage`, `tv.settings.manage`.
--   - Nenhum wildcard (`stock.*`/`ticket.*`): o motor é exact-match e o teste
--     estático reprova qualquer introdução de wildcard.
--   - Super Admin permanece como `is_super_admin` (bypass global do motor,
--     primeira regra de resolução); não vira membership nem role row.
--   - UI (App Access / `canAccessApp`) NÃO é mecanismo de segurança: as
--     garantias acima são no seed de permissions consumido pelo motor.
--
-- IDEMPOTÊNCIA (replay seguro pelo runner):
--   - Seed: ON CONFLICT (slug) DO UPDATE (nome/descrição atualizáveis).
--   - Permissions: ON CONFLICT (role_id, action, scope) DO NOTHING.
--   - Backfill memberships: ON CONFLICT (profile_id, workspace_id) DO NOTHING.
--   - Nenhuma tabela/função nova ⇒ nada a REVOKE (default privileges de
--     funções não se aplicam; a 036 já fixou RLS/REVOKE das 5 tabelas e a
--     lição de REVOKE de EXECUTE de funções da 039 continua valendo para
--     migrations futuras que criem functions).
--   - Não altera tabelas/linhas de migrations anteriores (apenas insere).
--
-- Referências:
--   - Catálogo de Actions: docs/architecture/rbac2.0-actions-catalog.md
--   - Spec RBAC 2.0:        docs/architecture/rbac2.0-specification.md

-- =============================================================================
-- 1. Role blueprint (workspace_id NULL = global)
-- =============================================================================

INSERT INTO public.roles (slug, workspace_id, name, description, is_system, is_default)
VALUES
  ('coordinator', NULL, 'Coordenador Multiunidade',
   'Gestão operacional de múltiplas unidades, sem acesso às funções administrativas globais',
   true, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- =============================================================================
-- 2. Seed role permissions — Actions literais do catálogo, escopo workspace.
--    Apenas Actions que EXISTEM no catálogo são semeadas (o teste estático
--    test_rbac_coordinator_migration.py reprova qualquer invento).
-- =============================================================================

DO $$
DECLARE
  v_coord uuid;
BEGIN
  SELECT id INTO v_coord FROM public.roles WHERE slug = 'coordinator';
  IF v_coord IS NULL THEN
    RAISE EXCEPTION 'roles seed not found (coordinator)';
  END IF;

  -- Chamados: acompanhar todas as unidades do escopo, atribuir a técnicos,
  -- mudar status, encerrar/reabrir, comentar, relatórios agregados e QR das
  -- unidades. SEM `ticket.delete` e SEM `ticket.weeklyEmail` (ADMIN).
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_coord, 'ticket.view',    'workspace'),
    (v_coord, 'ticket.edit',    'workspace'),
    (v_coord, 'ticket.status',  'workspace'),
    (v_coord, 'ticket.assign',  'workspace'),
    (v_coord, 'ticket.comment', 'workspace'),
    (v_coord, 'ticket.close',   'workspace'),
    (v_coord, 'ticket.reopen',  'workspace'),
    (v_coord, 'ticket.report',  'workspace'),
    (v_coord, 'ticket.qr',      'workspace'),
    -- Estoque / PC Care: leitura/reporting (dados e operações são lidos pelo
    -- App Access read; Actions de escrita/gestão ficam fora do seed).
    (v_coord, 'stock.export',   'workspace'),
    (v_coord, 'pcare.export',   'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;
END $$;

-- =============================================================================
-- 3. Backfill memberships — profiles.role legado 'coordinator' | 'role-coordinator'
--    × workspace_ids → membership ativa (idempotente).
--    profiles.workspace_ids / profiles.role permanecem intocados.
-- =============================================================================

DO $$
DECLARE
  v_placement integer := 0;
  v_ct        integer := 0;
BEGIN
  -- Coordenador Multiunidade
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  SELECT p.id, ws, r.id, 'active'
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.workspace_ids) AS ws
  JOIN public.roles r ON r.slug = 'coordinator'
  WHERE p.role IN ('coordinator', 'role-coordinator')
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;
  GET DIAGNOSTICS v_ct = ROW_COUNT;
  v_placement := v_placement + v_ct;

  RAISE NOTICE 'rbac2 coordinator backfill: % memberships created (idempotent)', v_placement;
END $$;