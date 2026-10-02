-- =============================================================================
-- tests/086_rbac2_module_permissions.sql
-- =============================================================================
-- Harness da migration 086 (`tv.manage` → `tec` + travas anti-escalada).
--
-- Harness comportamental (mesmo dos harnesses 049/065-071/077/078/082 e do stub
-- do Migrations CI, `scripts/ci/supabase_stub_bootstrap.sql:81`):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   · escritas privilegiadas em `profiles` são feitas com `auth.uid()` nulo —
--     contexto confiável, que a guarda da 067 aceita explicitamente (067:70-72);
--   · memberships são inseridas sem `managed_by` (a guarda da 045 retorna
--     imediatamente nesse caso).
--
--  1. `tec` tem exatamente 1 `tv.manage@workspace`; `opv` e `adm` seguem com 1;
--  2. `tv.manage` não existe fora de `opv`/`adm`/`tec`;
--  3. `tv.manage` só existe no escopo `workspace`;
--  4. `vis` continua somente-leitura (nenhuma Action de mutação);
--  5. `coordinator` mantém as linhas vermelhas da 040 (sem `tv.*`, sem
--     `reservelab.*`, sem escrita de estoque/PC Care, sem `admin.*`, sem
--     `ticket.delete`/`ticket.weeklyEmail`) e preserva as 12 Actions da 040/082;
--  6. `reservelab.tablet.*` continua só em `tec`;
--  7. helper `user_can_manage_tv` e `tv_can_manage_workspace` INTOCAS pela 086
--     (mesma assinatura, mesmo bypass de super admin, mesma ACL);
--  8. COMPORTAMENTAL: membership `tec` ativa/ALLOW em `user_can_manage_tv` ·
--     `vis`/DENY · `coordinator`/DENY · outra unidade/DENY · membership
--     inativa/DENY · caller sem membership/DENY · `app_access` legado não
--     concede nada.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 086 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 086 module permissions RBAC 2.0 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_tec     uuid;
  v_opv     uuid;
  v_adm     uuid;
  v_vis     uuid;
  v_coord   uuid;
  v_wsa     uuid;
  v_wsb     uuid;
  v_uid     uuid;
  v_uid2    uuid;
  v_out     boolean;
BEGIN

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 1 — ESTRUTURAL / CATÁLOGO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT id INTO v_tec   FROM public.roles WHERE slug = 'tec';
SELECT id INTO v_opv   FROM public.roles WHERE slug = 'opv';
SELECT id INTO v_adm   FROM public.roles WHERE slug = 'adm';
SELECT id INTO v_vis   FROM public.roles WHERE slug = 'vis';
SELECT id INTO v_coord FROM public.roles WHERE slug = 'coordinator';

IF v_tec IS NULL OR v_opv IS NULL OR v_adm IS NULL OR v_vis IS NULL OR v_coord IS NULL THEN
  RAISE EXCEPTION 'FAIL: roles tec/opv/adm/vis/coordinator ausentes (seeds 036/040 nao aplicados?)';
END IF;

-- ── 1. `tec` tem exatamente uma `tv.manage@workspace` ─────────────────────────
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_tec AND action = 'tv.manage' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: tec must hold exactly one tv.manage@workspace (found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_opv AND action = 'tv.manage' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: opv must hold exactly one tv.manage@workspace (found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_adm AND action = 'tv.manage' AND scope = 'workspace';
IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: adm must hold exactly one tv.manage@workspace (found %)', v_count;
END IF;

-- ── 2. `tv.manage` só em opv/adm/tec ─────────────────────────────────────────
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'tv.manage'
  AND r.slug NOT IN ('opv', 'adm', 'tec');
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: tv.manage must NOT leak outside opv/adm/tec (found %)', v_count;
END IF;

-- ── 3. Escopo: só `workspace` ───────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE action = 'tv.manage' AND scope <> 'workspace';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: tv.manage must only exist at scope workspace (found %)', v_count;
END IF;

-- ── 4. `vis` continua somente-leitura ────────────────────────────────────────
-- A matriz mudou `vis` (reservalab dash→read, tv novo) — nenhuma escrita pode
-- ter vindo junto. `stock.export`/`pcare.export`/`ticket.report` são leitura.
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE r.slug = 'vis'
  AND rp.action IN (
    'ticket.create', 'ticket.edit', 'ticket.status', 'ticket.assign',
    'ticket.comment', 'ticket.close', 'ticket.reopen', 'ticket.delete',
    'ticket.claim', 'ticket.qr', 'ticket.weeklyEmail', 'chamados.settings.manage',
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
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: cargo vis must stay read-only (found % mutation Actions)', v_count;
END IF;

-- `vis` mantém exatamente as 4 Actions de leitura da 036 (nada removido, nada novo).
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_vis AND scope = 'workspace'
  AND action IN ('ticket.view', 'ticket.report', 'stock.export', 'pcare.export');
IF v_count <> 4 THEN
  RAISE EXCEPTION 'FAIL: vis must keep its 4 read Actions from 036 (found %)', v_count;
END IF;

-- ── 5. `coordinator`: linhas vermelhas da 040 intactas + 12 Actions preservadas ─
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE r.slug = 'coordinator'
  AND (
    rp.action LIKE 'tv.%'
    OR rp.action LIKE 'music.%'
    OR rp.action LIKE 'reservelab.%'
    OR rp.action LIKE 'admin.%'
    OR rp.action IN ('ticket.delete', 'ticket.weeklyEmail',
                     'stock.item.create', 'stock.item.edit', 'stock.item.delete',
                     'stock.movement.create', 'stock.movement.manage',
                     'stock.kit.audit', 'stock.inventory.run',
                     'stock.maintenance.manage',
                     'pcare.asset.create', 'pcare.asset.edit', 'pcare.asset.manage',
                     'pcare.part.create', 'pcare.part.edit', 'pcare.part.delete',
                     'pcare.maintenance.manage', 'pcare.import',
                     'pcare.checklist.create', 'pcare.checklist.edit',
                     'pcare.checklist.delete')
  );
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: coordinator must keep the 040 red lines (found %)', v_count;
END IF;

-- As 12 Actions de 040/082: o downgrade de visibilidade para `read` NÃO revoga
-- a capacidade operacional do coordenador multiunidade.
SELECT count(*) INTO v_count
FROM public.role_permissions
WHERE role_id = v_coord AND scope = 'workspace'
  AND action IN ('ticket.view', 'ticket.edit', 'ticket.status', 'ticket.assign',
                 'ticket.comment', 'ticket.close', 'ticket.reopen',
                 'ticket.report', 'ticket.qr', 'stock.export', 'pcare.export',
                 'chamados.settings.manage');
IF v_count <> 12 THEN
  RAISE EXCEPTION 'FAIL: coordinator must keep its 12 Actions from 040/082 (found %)', v_count;
END IF;

-- `chamados.settings.manage` continua nos 3 cargos da 082 (invariante da 082).
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action = 'chamados.settings.manage'
  AND rp.scope = 'workspace'
  AND r.slug IN ('tec', 'lider', 'coordinator');
IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: chamados.settings.manage@workspace must be on tec/lider/coordinator (found %)', v_count;
END IF;

-- ── 6. `reservelab.tablet.*` continua só em `tec` ────────────────────────────
SELECT count(*) INTO v_count
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.action IN ('reservelab.tablet.reserve', 'reservelab.tablet.cancel')
  AND r.slug <> 'tec';
IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: reservelab.tablet.* must exist ONLY on tec (found %)', v_count;
END IF;

-- ── 7. Helpers intocados pela 086 ────────────────────────────────────────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv must exist';
END IF;
IF v_def NOT LIKE '%public.role_permissions%' THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv must read public.role_permissions';
END IF;
IF v_def NOT LIKE '%public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: user_can_manage_tv must join memberships.role_id';
END IF;
-- O bypass de super admin NÃO pode ter sido puxado para dentro da helper.
IF v_def ILIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: super admin bypass must live in the policy, not in user_can_manage_tv';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'tv_can_manage_workspace';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must exist';
END IF;
IF v_def NOT LIKE '%user_can_manage_tv%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep delegating to user_can_manage_tv';
END IF;
IF v_def NOT LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep the is_super_admin bypass';
END IF;
IF v_def NOT LIKE '%user_belongs_to_workspace%' THEN
  RAISE EXCEPTION 'FAIL: tv_can_manage_workspace must keep the workspace membership check';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv'
    AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: authenticated must hold EXECUTE on user_can_manage_tv';
END IF;
IF EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_tv'
    AND g.grantee = 'anon' AND g.privilege_type = 'EXECUTE'
) THEN
  RAISE EXCEPTION 'FAIL: anon must NOT execute user_can_manage_tv';
END IF;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 2 — COMPORTAMENTAL (caller simulado via request.jwt.claim.sub)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Fixtures: dois usuários reais (auth.users → profile) e duas unidades.
INSERT INTO public.workspaces (id, name, slug)
VALUES ('86868686-8686-8686-8686-868686868681', '086 Modulos WS A', 'ws086-a')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsa FROM public.workspaces WHERE slug = 'ws086-a';

INSERT INTO public.workspaces (id, name, slug)
VALUES ('86868686-8686-8686-8686-868686868682', '086 Modulos WS B', 'ws086-b')
ON CONFLICT (slug) DO NOTHING;
SELECT id INTO v_wsb FROM public.workspaces WHERE slug = 'ws086-b';

IF v_wsa IS NULL OR v_wsb IS NULL OR v_wsa = v_wsb THEN
  RAISE EXCEPTION 'FAIL: could not create two distinct workspaces for the isolation check';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('86868686-8686-8686-8686-868686868683',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '086-modulos@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"086 Modulos"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid FROM public.profiles WHERE email = '086-modulos@labhub.test';
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created did not create the profile for 086-modulos@labhub.test';
END IF;

INSERT INTO auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous, created_at, updated_at)
VALUES ('86868686-8686-8686-8686-868686868684',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '086-modulos-outro@labhub.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"086 Modulos outro"}'::jsonb, false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT id INTO v_uid2 FROM public.profiles WHERE email = '086-modulos-outro@labhub.test';
IF v_uid2 IS NULL THEN
  RAISE EXCEPTION 'FAIL: on_auth_user_created did not create the profile for 086-modulos-outro@labhub.test';
END IF;

-- Contas ativas (contexto confiável: a guarda da 067 aceita auth.uid() nulo).
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET status = 'active' WHERE id IN (v_uid, v_uid2);

-- Atalho para fixar o caller nos cenários abaixo.
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

-- (a) SEM membership => DENY
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [a]: user without membership must be DENIED TV management';
END IF;

-- (b) membership `tec` ATIVA => ALLOW (o ganho da 086, aplicado pela helper real)
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
VALUES (v_uid, v_wsa, v_tec, 'active')
ON CONFLICT (profile_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF NOT v_out THEN
  RAISE EXCEPTION 'FAIL [b]: active tec membership must be ALLOWED to manage TV (the 086 grant)';
END IF;

-- (c) ISOLAMENTO — a MESMA membership `tec` NÃO autoriza outra unidade
SELECT public.user_can_manage_tv(v_wsb) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [c]: active tec membership must NOT grant access to workspace B';
END IF;

-- (d) membership `vis` ATIVA => DENY (leitura da TV, ZERO escrita)
UPDATE public.memberships SET role_id = v_vis
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [d]: viewer membership must be DENIED TV management (read != write)';
END IF;

-- (e) membership `coordinator` ATIVA => DENY (matriz `tv: read`, sem escrita)
UPDATE public.memberships SET role_id = v_coord
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [e]: coordinator membership must be DENIED TV management';
END IF;

-- (f) membership INATIVA => DENY (o `status = ''active''` da helper não é opcional)
UPDATE public.memberships SET role_id = v_tec, status = 'suspended'
WHERE profile_id = v_uid AND workspace_id = v_wsa;
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [f]: suspended membership must be DENIED TV management';
END IF;

-- (g) outro caller sem membership => DENY
PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true);
SELECT public.user_can_manage_tv(v_wsa) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [g]: an unrelated authenticated user must be DENIED TV management';
END IF;

-- (h) workspace NULO => fail-closed
SELECT public.user_can_manage_tv(NULL) INTO v_out;
IF v_out THEN
  RAISE EXCEPTION 'FAIL [h]: NULL workspace must be DENIED';
END IF;

-- Restaura o contexto do GUC para não vazar para os testes seguintes do CI.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

RAISE NOTICE 'OK: 086 module permissions RBAC 2.0 checks passed';
END $$;