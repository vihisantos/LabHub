-- =============================================================================
-- 036: RBAC 2.0 — Server-side schema, seeds, backfill and RLS (ETAPA 4)
--
-- Introduces the five server-side RBAC 2.0 tables described in
-- docs/architecture/rbac2.0-specification.md (§3, §11) and the task §15-17:
--
--   public.roles                 — roles (workspace or global blueprint)
--   public.role_permissions      — Actions per role (from the Actions catalog)
--   public.memberships           — profile → workspace → role
--   public.membership_overrides  — per-action allow/deny override (override > role)
--   public.rbac_audit_logs       — append-only authorization audit trail
--
-- Source of truth for Actions: docs/architecture/rbac2.0-actions-catalog.md.
-- Only Actions present in that catalog are seeded. Nothing is invented.
--
-- Scope of ETAPA 4 (deliberately NOT done here, per task):
--   - RBAC 2.0 is NOT enabled globally (feature flag RBAC_2_ENABLED stays OFF).
--   - Frontend / AppGuard / usePermissions / AppAccessLevel are NOT touched.
--   - profles.role / profiles.workspace_ids legacy model is PRESERVED.
--   - Local-only `roles` / `audit_logs` collections are NOT removed.
--   - Legacy RLS / authorization mechanisms are NOT removed.
--   - The Actions catalog is NOT modified.
--
-- Safety conventions (mirroring 028/031/032):
--   - CREATE ... IF NOT EXISTS on tables, indexes and policies.
--   - DROP ... IF EXISTS on all policies before re-creating them.
--   - Seeds are idempotent (upsert on roles.slug, DO NOTHING on memberships).
--   - Backfill is idempotent (ON CONFLICT DO NOTHING), reversible, and does
--     NOT touch `profiles.workspace_ids` / `profiles.role`.
--   - rbac_audit_logs is append-only (no UPDATE/DELETE policies) exactly like
--     app_data_backups (031).
-- =============================================================================


-- =============================================================================
-- 1. public.roles
-- =============================================================================
-- A role belongs either to one workspace (`workspace_id` set) or is a global
-- blueprint (`workspace_id IS NULL`, used to avoid duplicating a role row per
-- workspace). `slug` is a stable business key (mirrors the existing
-- LEGACY_ROLE_TO_ID keys like `role-technician` in permissions/types.ts) used
-- for deterministic, idempotent seeding and for the memberships backfill.
-- `is_system` roles are seeds and must not be edited/deleted by the app.

CREATE TABLE IF NOT EXISTS public.roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  is_system    boolean NOT NULL DEFAULT false,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_roles_workspace ON public.roles (workspace_id);

COMMENT ON TABLE public.roles IS
  'RBAC 2.0 roles. workspace_id NULL = global blueprint; set = workspace role. '
  'system roles (is_system) are seeds and are not editable by the app.';

COMMENT ON COLUMN public.roles.slug IS
  'Stable business key (e.g. tec/vis/adm) for idempotent seeding and backfill.';


-- =============================================================================
-- 2. public.role_permissions
-- =============================================================================
-- Maps a role to the Actions (from the catalog) it may perform in a scope.
-- scope values: workspace | global | self. Unique per (role, action, scope).

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  action     text NOT NULL,
  scope      text NOT NULL DEFAULT 'workspace'
             CHECK (scope IN ('workspace', 'global', 'self')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_role_action_scope_unique UNIQUE (role_id, action, scope)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_action ON public.role_permissions (action);

COMMENT ON TABLE public.role_permissions IS
  'Actions (from docs/architecture/rbac2.0-actions-catalog.md) granted to a role.';


-- =============================================================================
-- 3. public.memberships
-- =============================================================================
-- The bearer of a role inside a workspace (one per (profile, workspace)).

CREATE TABLE IF NOT EXISTS public.memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('pending', 'active', 'suspended', 'removed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_profile_workspace_unique UNIQUE (profile_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON public.memberships (workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON public.memberships (role_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON public.memberships (status);

COMMENT ON COLUMN public.memberships.role_id IS
  'ON DELETE RESTRICT: a role cannot be deleted while memberships reference it.';


-- =============================================================================
-- 4. public.membership_overrides
-- =============================================================================
-- Per-action allow/deny override on top of the role base. override > role.
-- Only super admin may write (prevents a user self-granting an override).

CREATE TABLE IF NOT EXISTS public.membership_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  action        text NOT NULL,
  effect        text NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_overrides_membership_action_unique UNIQUE (membership_id, action)
);

CREATE INDEX IF NOT EXISTS idx_membership_overrides_membership
  ON public.membership_overrides (membership_id);

COMMENT ON TABLE public.membership_overrides IS
  'Per-action override on a membership. effect allow grants even if the role '
  'denies; effect deny blocks even if the role grants. Never store secrets.';


-- =============================================================================
-- 5. public.rbac_audit_logs  (append-only)
-- =============================================================================
-- Authorization decisions (best-effort, side-channel written by the backend
-- with service_role). Append-only: no UPDATE/DELETE policies. Never stores
-- secrets, JWTs or service keys in `meta`.

CREATE TABLE IF NOT EXISTS public.rbac_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_is_super boolean NOT NULL DEFAULT false,
  action        text NOT NULL,
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  scope         text NOT NULL DEFAULT 'workspace',
  effect        text NOT NULL CHECK (effect IN ('allow', 'deny')),
  outcome       text NOT NULL CHECK (outcome IN ('success', 'denied')),
  resource_type text,
  resource_id   text,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timestamp"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor ON public.rbac_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_workspace ON public.rbac_audit_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_action ON public.rbac_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_ts ON public.rbac_audit_logs ("timestamp");
CREATE INDEX IF NOT EXISTS idx_rbac_audit_workspace_ts
  ON public.rbac_audit_logs (workspace_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor_ts
  ON public.rbac_audit_logs (actor_id, "timestamp");

COMMENT ON TABLE public.rbac_audit_logs IS
  'Append-only RBAC authorization audit trail. SELECT is super_admin-only; '
  'INSERT happens via service_role from the backend (side-channel, best-effort). '
  'meta must NEVER contain secrets, JWTs or service keys.';
COMMENT ON COLUMN public.rbac_audit_logs.effect IS 'allow|deny — the decision applied';
COMMENT ON COLUMN public.rbac_audit_logs.outcome IS 'success|denied — the result recorded';


-- =============================================================================
-- 6. Row Level Security (isolation, per task §15: RLS isolation, user cannot
--    self-grant override, audit log cannot be forged)
-- =============================================================================
-- Write policies on memberships / membership_overrides / roles /
-- role_permissions are super-admin ONLY (a normal member can never grant
-- themselves an override or a role). rbac_audit_logs is append-only and
-- readable only by super admin — a user cannot forge/collude audit rows.

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_audit_logs FORCE ROW LEVEL SECURITY;

-- ---- roles ----------------------------------------------------------------
DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.roles.workspace_id IS NULL
    OR public.user_belongs_to_workspace(public.roles.workspace_id)
  );

DROP POLICY IF EXISTS "roles_insert" ON public.roles;
CREATE POLICY "roles_insert"
  ON public.roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "roles_update" ON public.roles;
CREATE POLICY "roles_update"
  ON public.roles FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "roles_delete" ON public.roles;
CREATE POLICY "roles_delete"
  ON public.roles FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---- role_permissions -----------------------------------------------------
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
CREATE POLICY "role_permissions_select"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = public.role_permissions.role_id
        AND (r.workspace_id IS NULL OR public.user_belongs_to_workspace(r.workspace_id))
    )
  );

DROP POLICY IF EXISTS "role_permissions_insert" ON public.role_permissions;
CREATE POLICY "role_permissions_insert"
  ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "role_permissions_update" ON public.role_permissions;
CREATE POLICY "role_permissions_update"
  ON public.role_permissions FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "role_permissions_delete" ON public.role_permissions;
CREATE POLICY "role_permissions_delete"
  ON public.role_permissions FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---- memberships ----------------------------------------------------------
-- Select: super admin or member of the workspace. Write: super admin ONLY —
-- a user cannot add/alter their own membership (precludes self-grant).
DROP POLICY IF EXISTS "memberships_select" ON public.memberships;
CREATE POLICY "memberships_select"
  ON public.memberships FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(public.memberships.workspace_id)
  );

DROP POLICY IF EXISTS "memberships_insert" ON public.memberships;
CREATE POLICY "memberships_insert"
  ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "memberships_update" ON public.memberships;
CREATE POLICY "memberships_update"
  ON public.memberships FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;
CREATE POLICY "memberships_delete"
  ON public.memberships FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---- membership_overrides -------------------------------------------------
-- Select: super admin or member of the workspace through its membership.
-- Write: super admin ONLY — a user cannot grant themselves an override.
DROP POLICY IF EXISTS "membership_overrides_select" ON public.membership_overrides;
CREATE POLICY "membership_overrides_select"
  ON public.membership_overrides FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = public.membership_overrides.membership_id
        AND public.user_belongs_to_workspace(m.workspace_id)
    )
  );

DROP POLICY IF EXISTS "membership_overrides_insert" ON public.membership_overrides;
CREATE POLICY "membership_overrides_insert"
  ON public.membership_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "membership_overrides_update" ON public.membership_overrides;
CREATE POLICY "membership_overrides_update"
  ON public.membership_overrides FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "membership_overrides_delete" ON public.membership_overrides;
CREATE POLICY "membership_overrides_delete"
  ON public.membership_overrides FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---- rbac_audit_logs (append-only; only super admin can read) ------------
DROP POLICY IF EXISTS "rbac_audit_logs_select" ON public.rbac_audit_logs;
CREATE POLICY "rbac_audit_logs_select"
  ON public.rbac_audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Intentionally NO INSERT / UPDATE / DELETE policies for authenticated roles:
-- rows are written exclusively via service_role (backend), which bypasses RLS.
-- This makes it impossible for a non-super user to forge or erase audit rows.

REVOKE ALL ON public.rbac_audit_logs FROM anon;
REVOKE ALL ON public.rbac_audit_logs FROM PUBLIC;


-- =============================================================================
-- 7. Seed system roles (from docs/architecture/rbac2.0-specification.md §5
--    and the Actions catalog — only catalog Actions are seeded)
-- =============================================================================
-- Global blueprints (workspace_id NULL): Técnico, Visualizador, Gestor de
-- Estoque, Operador TV, Admin de Workspace. Super Admin is NOT a role: it is
-- the `profiles.is_super_admin` platform capability (concept closed in the
-- spec §8) and therefore has no membership/role row.

INSERT INTO public.roles (slug, workspace_id, name, description, is_system, is_default)
VALUES
  ('tec', NULL, 'Técnico', 'Executa tickets e operações do workspace', true, false),
  ('vis', NULL, 'Visualizador', 'Acesso de leitura ao workspace', true, false),
  ('est', NULL, 'Gestor de Estoque', 'Gestão de estoque full + export', true, false),
  ('opv', NULL, 'Operador TV', 'Gestão de conteúdo e moderação da TV', true, false),
  ('adm', NULL, 'Admin de Workspace', 'Administração do workspace e memberships', true, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;


-- =============================================================================
-- 8. Seed role permissions — individual catalog Actions ONLY (task: no
--    wildcards like `stock.*` unless the catalog/DB explicitly supports them;
--    the engine does exact-match, so wildcards would be a silent no-op).
-- =============================================================================
-- Mapping follows the task's deterministic roles mapping, restricted to
-- Actions EXISTING in the catalog and to workspace scope by default.

DO $$
DECLARE
  v_tec uuid; v_vis uuid; v_est uuid; v_opv uuid; v_adm uuid;
BEGIN
  SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
  SELECT id INTO v_vis FROM public.roles WHERE slug = 'vis';
  SELECT id INTO v_est FROM public.roles WHERE slug = 'est';
  SELECT id INTO v_opv FROM public.roles WHERE slug = 'opv';
  SELECT id INTO v_adm FROM public.roles WHERE slug = 'adm';
  IF v_tec IS NULL OR v_vis IS NULL OR v_est IS NULL OR v_opv IS NULL OR v_adm IS NULL THEN
    RAISE EXCEPTION 'roles seed not found';
  END IF;

  -- Técnico: ticket + stock + pcare + reservelab + tv content + commons.
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_tec, 'ticket.create',   'workspace'),
    (v_tec, 'ticket.view',     'workspace'),
    (v_tec, 'ticket.edit',     'workspace'),
    (v_tec, 'ticket.status',   'workspace'),
    (v_tec, 'ticket.assign',   'workspace'),
    (v_tec, 'ticket.comment',  'workspace'),
    (v_tec, 'ticket.close',    'workspace'),
    (v_tec, 'ticket.reopen',   'workspace'),
    (v_tec, 'ticket.delete',   'workspace'),
    (v_tec, 'ticket.qr',       'workspace'),
    (v_tec, 'ticket.report',   'workspace'),
    (v_tec, 'stock.item.create','workspace'),
    (v_tec, 'stock.item.edit',  'workspace'),
    (v_tec, 'stock.item.delete','workspace'),
    (v_tec, 'stock.movement.create','workspace'),
    (v_tec, 'stock.movement.manage','workspace'),
    (v_tec, 'stock.kit.audit',  'workspace'),
    (v_tec, 'stock.inventory.run','workspace'),
    (v_tec, 'stock.maintenance.manage','workspace'),
    (v_tec, 'stock.export',     'workspace'),
    (v_tec, 'pcare.asset.create','workspace'),
    (v_tec, 'pcare.asset.edit',  'workspace'),
    (v_tec, 'pcare.asset.manage','workspace'),
    (v_tec, 'pcare.part.create', 'workspace'),
    (v_tec, 'pcare.part.edit',   'workspace'),
    (v_tec, 'pcare.part.delete', 'workspace'),
    (v_tec, 'pcare.maintenance.manage','workspace'),
    (v_tec, 'pcare.export',      'workspace'),
    (v_tec, 'pcare.import',      'workspace'),
    (v_tec, 'reservelab.tablet.reserve','workspace'),
    (v_tec, 'tv.content.manage', 'workspace'),
    (v_tec, 'tv.urgentAnnouncement','workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Visualizador: read-only families present in the catalog.
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_vis, 'ticket.view',   'workspace'),
    (v_vis, 'ticket.report', 'workspace'),
    (v_vis, 'stock.export',  'workspace'),
    (v_vis, 'pcare.export',  'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Gestor de Estoque: full stock + exports.
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_est, 'stock.item.create','workspace'),
    (v_est, 'stock.item.edit',  'workspace'),
    (v_est, 'stock.item.delete','workspace'),
    (v_est, 'stock.movement.create','workspace'),
    (v_est, 'stock.movement.manage','workspace'),
    (v_est, 'stock.kit.audit',  'workspace'),
    (v_est, 'stock.inventory.run','workspace'),
    (v_est, 'stock.maintenance.manage','workspace'),
    (v_est, 'stock.export',     'workspace'),
    (v_est, 'ticket.report',    'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Operador TV: content + music moderation + urgent + settings.
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_opv, 'tv.content.manage',     'workspace'),
    (v_opv, 'tv.urgentAnnouncement', 'workspace'),
    (v_opv, 'music.request',         'self'),
    (v_opv, 'music.moderate',        'workspace'),
    (v_opv, 'tv.settings.manage',    'workspace'),
    (v_opv, 'tv.device.manage',      'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- Admin de Workspace: the workspace-scoped ADMIN actions that the Actions
  -- catalog (docs/architecture/rbac2.0-actions-catalog.md §10 "Workspace Admin")
  -- explicitly attributes to a workspace administrator. ONLY literal catalog
  -- Actions are seeded (no invented actions).
  --
  -- NEEDS_DECISION (documented, NOT seeded here): the spec §5 seed matrix also
  -- lists `membership.*`, `appSettings.*`, `backup.*` and `workspace.*` for the
  -- workspace admin, but the Actions catalog does NOT contain those as concrete
  -- Actions (and the backend engine does exact-match on action names). Seeding
  -- them would create permissions-by-accident, so they are deliberately
  -- omitted until the catalog defines concrete Actions for them.
  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    (v_adm, 'admin.app.purge',    'workspace'),
    (v_adm, 'tv.purge',           'workspace'),
    (v_adm, 'tv.settings.manage', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;
END $$;


-- =============================================================================
-- 9. Backfill memberships from the legacy model (idempotent, reversible)
-- =============================================================================
-- Mapping (task deterministic role mapping):
--   profiles.role = 'technician' → role slug 'tec'   (Técnico)
--   profiles.role = 'viewer'     → role slug 'vis'   (Visualizador)
--   profiles.role = 'admin'      → role slug 'adm'   (Admin de Workspace)
-- Super admin is NOT backfilled: it is the is_super_admin platform capability
-- and does not become a membership (spec §8).
--
-- A profile × workspace is taken from profiles.workspace_ids (unnest). Only
-- valid profile rows and known legacy roles are mapped. Profiles with no
-- workspace_ids, or with an unknown/null role, contribute 0 memberships
-- (counted and reported via RAISE NOTICE). profiles.workspace_ids and
-- profiles.role are left untouched.

DO $$
DECLARE
  v_placement integer := 0;     -- memberships created
  v_no_ws     integer := 0;     -- profiles with empty/null workspace_ids
  v_no_role   integer := 0;     -- rows with unknown/null role
BEGIN
  -- Técnico
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  SELECT p.id, ws, r.id, 'active'
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.workspace_ids) AS ws
  JOIN public.roles r ON r.slug = 'tec'
  WHERE p.role = 'technician'
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;
  GET DIAGNOSTICS v_placement = ROW_COUNT;

  -- Visualizador
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  SELECT p.id, ws, r.id, 'active'
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.workspace_ids) AS ws
  JOIN public.roles r ON r.slug = 'vis'
  WHERE p.role = 'viewer'
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;
  GET DIAGNOSTICS v_placement = v_placement + ROW_COUNT;

  -- Admin de Workspace (legacy role='admin')
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  SELECT p.id, ws, r.id, 'active'
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.workspace_ids) AS ws
  JOIN public.roles r ON r.slug = 'adm'
  WHERE p.role = 'admin'
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;
  GET DIAGNOSTICS v_placement = v_placement + ROW_COUNT;

  -- Count profiles with empty/null workspace_ids (contribute 0 memberships).
  SELECT COUNT(*) INTO v_no_ws FROM public.profiles
  WHERE workspace_ids IS NULL OR array_length(workspace_ids, 1) IS NULL;

  -- Count profiles whose legacy role is unknown/null (contribute 0 memberships).
  SELECT COUNT(*) INTO v_no_role FROM public.profiles
  WHERE role IS NULL OR role NOT IN ('technician', 'viewer', 'admin');

  RAISE NOTICE 'rbac2 backfill: % memberships created; % profiles without workspaces (0 memberships); % profiles with unknown/null role (0 memberships)',
    v_placement, v_no_ws, v_no_role;
END $$;
