-- =============================================================================
-- tests/098_tablet_reservations_update_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS + COMPORTAMENTAIS para a migration 098 (Issue #388):
-- a policy `tablet_reservations_update` passa a exigir que `horario_fim` ainda
-- não tenha passado PARA TODOS OS PERFIS — inclusive super admin — SEM
-- enfraquecer a autorização vigente (050 + 078).
--
-- SHAPE EXIGIDO (fix do bypass temporal de super admin):
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
--   A regra temporal É CONJUNÇÃO DE TOPO: não pode viver dentro de um ramo que
--   o `is_super_admin()` consiga ignorar via `OR`. Os checks 5/6 abaixo falham
--   na versão antiga (que colocava `horario_fim > now()` dentro do ramo RBAC).
--
-- Harness comportamental (mesmo dos testes 049/065-071/077/078/082 e do stub do
-- Migrations CI, `scripts/ci/supabase_stub_bootstrap.sql`):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` a partir de um INSERT em `auth.users`;
--   · escritas de campo privilegiado em `profiles` (status/is_super_admin) são
--     feitas com `auth.uid()` nulo (contexto confiável, aceito pela guarda 067);
--   · janelas RLS usam `SET LOCAL ROLE authenticated` (padrão do harness 082);
--     a conferência roda SEMPRE como `postgres`, depois de `RESET ROLE`.
--   · cenários de regressão: técnico autorizado (futura/em andamento/encerrada
--     + isolamento entre unidades), usuário sem permissão e SUPER ADMIN
--     (futura permitida, ENCERRADA NEGADA — o bypass temporal não existe).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 098 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 098 checks passed".
-- =============================================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 1 — ESTRUTURAL
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE
  v_count integer;
  v_qual  text;
  v_check text;
  v_roles name[];
  v_cmd   text;
  v_ql    text;
  v_cl    text;
BEGIN

-- ── 1. A policy existe exatamente uma vez e é FOR UPDATE ────────────────────
SELECT count(*) INTO v_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: esperado 1 policy tablet_reservations_update; encontrado %', v_count;
END IF;

SELECT qual, with_check, roles, cmd
  INTO v_qual, v_check, v_roles, v_cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update';

IF v_cmd <> 'UPDATE' THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update deve ser FOR UPDATE (cmd=%)', v_cmd;
END IF;

-- Papel preservado (050/078): a policy é destinada a `authenticated`.
IF NOT ('authenticated' = ANY (v_roles)) THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update deve ser TO authenticated (roles=%)', v_roles;
END IF;

v_ql := lower(v_qual);
v_cl := lower(v_check);

-- ── 2. Regra temporal presente em USING (OLD) e WITH CHECK (NEW) ────────────
IF v_ql IS NULL OR v_ql NOT LIKE '%horario_fim%' OR v_ql NOT LIKE '%now()%' THEN
  RAISE EXCEPTION 'FAIL: USING sem a regra temporal (horario_fim > now()): %', v_qual;
END IF;

IF v_cl IS NULL OR v_cl NOT LIKE '%horario_fim%' OR v_cl NOT LIKE '%now()%' THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK sem a regra temporal (horario_fim > now()): %', v_check;
END IF;

-- ── 3. Os três pilares de autorização continuam na policy ───────────────────
IF v_ql NOT LIKE '%is_super_admin%' OR v_cl NOT LIKE '%is_super_admin%' THEN
  RAISE EXCEPTION 'FAIL: bypass de super admin (is_super_admin) removido da policy';
END IF;

IF v_ql NOT LIKE '%user_belongs_to_workspace%' OR v_cl NOT LIKE '%user_belongs_to_workspace%' THEN
  RAISE EXCEPTION 'FAIL: isolamento por workspace (user_belongs_to_workspace) removido da policy';
END IF;

IF v_ql NOT LIKE '%user_can_cancel_tablet_reservation%'
   OR v_cl NOT LIKE '%user_can_cancel_tablet_reservation%' THEN
  RAISE EXCEPTION 'FAIL: checagem RBAC 2.0 (user_can_cancel_tablet_reservation) removida da policy';
END IF;

-- ── 4. A policy não pode conter um ramo temporal solto/permissivo ────────────
--    Um `OR horario_fim > now()` global (sem workspace/RBAC) seria fail-open:
--    qualquer autenticado editaria qualquer reserva (futura ou não) de qualquer
--    unidade. Este guard também cobre o antigo bypass de super admin na forma
--    `is_super_admin() OR (... AND horario_fim > now())`.
IF v_qual ~* 'or\s+\(?\s*horario_fim\s*>' THEN
  RAISE EXCEPTION 'FAIL: USING com ramo temporal permissivo fora da autorização: %', v_qual;
END IF;
IF v_check ~* 'or\s+\(?\s*horario_fim\s*>' THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK com ramo temporal permissivo fora da autorização: %', v_check;
END IF;

-- ── 5. A regra temporal conduz a expressão (conjunção de topo) ───────────────
--    Issue #388: o bypass de super admin NÃO pode ficar fora / guiar a regra
--    temporal. Na forma correta `horario_fim > now() AND (is_super_admin() OR
--    ...)`, `horario_fim` aparece ANTES de `is_super_admin` no texto da policy.
--    Na forma antiga `is_super_admin() OR (... AND horario_fim > now())`,
--    `is_super_admin` viria primeiro — este check então FALHA.
IF position('horario_fim' in v_ql) >= position('is_super_admin' in v_ql) THEN
  RAISE EXCEPTION 'FAIL: USING — regra temporal não conduz a expressão (bypass de super admin): %', v_qual;
END IF;
IF position('horario_fim' in v_cl) >= position('is_super_admin' in v_cl) THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK — regra temporal não conduz a expressão (bypass de super admin): %', v_check;
END IF;

-- ── 6. Forma textual da conjunção `horario_fim > now() AND ...` ──────────────
--    Tolerante a parênteses produzidos pelo deparser do Postgres.
IF v_qual !~* 'horario_fim\s*>\s*now\(\)\s*\)?\s*AND' THEN
  RAISE EXCEPTION 'FAIL: USING deve conjungir horario_fim > now() com AND (topo): %', v_qual;
END IF;
IF v_check !~* 'horario_fim\s*>\s*now\(\)\s*\)?\s*AND' THEN
  RAISE EXCEPTION 'FAIL: WITH CHECK deve conjungir horario_fim > now() com AND (topo): %', v_check;
END IF;

END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PARTE 2 — COMPORTAMENTAL (caller simulado via request.jwt.claim.sub)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── Fixtures: duas unidades, três usuários, quatro reservas ─────────────────
--    (encerrada / em andamento / futura na unidade A; futura na unidade B).
DO $$
DECLARE
  v_wsa uuid;
  v_wsb uuid;
  v_tec uuid;
  v_uid uuid;
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
  VALUES ('09809809-8098-0980-9809-809809809801', '098 Tablet WS A', 'ws098-a')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.workspaces (id, name, slug)
  VALUES ('09809809-8098-0980-9809-809809809802', '098 Tablet WS B', 'ws098-b')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_wsa FROM public.workspaces WHERE slug = 'ws098-a';
  SELECT id INTO v_wsb FROM public.workspaces WHERE slug = 'ws098-b';

  IF v_wsa IS NULL OR v_wsb IS NULL OR v_wsa = v_wsb THEN
    RAISE EXCEPTION 'FAIL: could not create two distinct workspaces for the isolation check';
  END IF;

  -- Técnico autorizado / usuário sem permissão / super admin
  -- (o profile nasce pela trigger `on_auth_user_created`).
  INSERT INTO auth.users (id, instance_id, aud, role, email,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          is_sso_user, is_anonymous, created_at, updated_at)
  VALUES ('09809809-8098-0980-9809-809809809101',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '098-tec@labhub.test', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"098 Tec"}'::jsonb,
          false, false, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id, instance_id, aud, role, email,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          is_sso_user, is_anonymous, created_at, updated_at)
  VALUES ('09809809-8098-0980-9809-809809809102',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '098-nobody@labhub.test', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"098 Nobody"}'::jsonb,
          false, false, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id, instance_id, aud, role, email,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          is_sso_user, is_anonymous, created_at, updated_at)
  VALUES ('09809809-8098-0980-9809-809809809103',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '098-super@labhub.test', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"098 Super"}'::jsonb,
          false, false, now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Perfis ativos (contexto confiável: auth.uid() NULL); super admin marcado.
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  UPDATE public.profiles SET status = 'active'
   WHERE email IN ('098-tec@labhub.test', '098-nobody@labhub.test', '098-super@labhub.test');
  UPDATE public.profiles SET is_super_admin = true
   WHERE email = '098-super@labhub.test';

  SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';
  SELECT id INTO v_uid FROM public.profiles WHERE email = '098-tec@labhub.test';
  IF v_tec IS NULL OR v_uid IS NULL THEN
    RAISE EXCEPTION 'FAIL: fixtures 098 — role tec ou profile tec ausente';
  END IF;

  -- Técnico: membership ATIVA na unidade A (o role tec já possui a Action
  -- `reservelab.tablet.cancel@workspace` semeada pela 036, assert 078).
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  VALUES (v_uid, v_wsa, v_tec, 'active')
  ON CONFLICT (profile_id, workspace_id) DO UPDATE
    SET role_id = EXCLUDED.role_id, status = 'active', managed_by = NULL;

  -- Reservas (contexto confiável, auth.uid() NULL). `now()` é o timestamp da
  -- transação — o mesmo em todos os checks —, então os limites são exatos.
  INSERT INTO public.tablet_reservations
    (id, workspace_id, sala, quantidade_tablets, professor,
     horario_inicio, horario_fim, finalidade, reservado_por, status)
  VALUES
    -- ENCERRADA: horario_fim já passou (now() - 1h).
    ('09809809-8098-0980-9809-809809809301', v_wsa, '098 Sala', 1, 'r1-orig',
     now() - interval '2 hours', now() - interval '1 hour', '', '098-seed', 'ativa'),
    -- EM ANDAMENTO: iniciou há 1h, termina em 2h (horario_fim futuro → editável).
    ('09809809-8098-0980-9809-809809809302', v_wsa, '098 Sala', 1, 'r2-orig',
     now() - interval '1 hour', now() + interval '2 hours', '', '098-seed', 'ativa'),
    -- FUTURA na unidade A.
    ('09809809-8098-0980-9809-809809809303', v_wsa, '098 Sala', 1, 'r3-orig',
     now() + interval '1 day', now() + interval '2 days', '', '098-seed', 'ativa'),
    -- FUTURA na unidade B (isolamento entre unidades).
    ('09809809-8098-0980-9809-809809809304', v_wsb, '098 Sala', 1, 'r4-orig',
     now() + interval '1 day', now() + interval '2 days', '', '098-seed', 'ativa')
  ON CONFLICT (id) DO NOTHING;

  -- IDs repassados às janelas `authenticated` via GUC (sob esse papel as tabelas
  -- public.workspaces/profiles podem estar invisíveis pela RLS).
  PERFORM set_config('labhub.tec',
    (SELECT id::text FROM public.profiles WHERE email = '098-tec@labhub.test'), true);
  PERFORM set_config('labhub.nobody',
    (SELECT id::text FROM public.profiles WHERE email = '098-nobody@labhub.test'), true);
  PERFORM set_config('labhub.super',
    (SELECT id::text FROM public.profiles WHERE email = '098-super@labhub.test'), true);

  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

-- ── JANELA 1 — TÉCNICO AUTORIZADO (membership ativa na unidade A) ────────────
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('labhub.tec'), true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rows integer;
BEGIN
  -- (a) ENCERRADA: a regra temporal nega (USING false) — 0 linhas.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'HACK-TEC'
     WHERE id = '09809809-8098-0980-9809-809809809301';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [tec/ended]: reserva encerrada editável (linhas=%)', v_rows;
  END IF;

  -- (b) EM ANDAMENTO (horario_fim futuro): permitida — 1 linha.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'TEC-ONGOING'
     WHERE id = '09809809-8098-0980-9809-809809809302';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL [tec/ongoing]: reserva em andamento negada (linhas=%)', v_rows;
  END IF;

  -- (c) FUTURA: permitida — 1 linha.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'TEC-FUTURE'
     WHERE id = '09809809-8098-0980-9809-809809809303';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL [tec/future]: reserva futura negada (linhas=%)', v_rows;
  END IF;

  -- (d) OUTRA UNIDADE (ws B): isolamento por workspace — 0 linhas.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'HACK-TEC'
     WHERE id = '09809809-8098-0980-9809-809809809304';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [tec/cross-ws]: vazamento entre unidades (linhas=%)', v_rows;
  END IF;
END $$;
RESET ROLE;

-- Conferência (postgres): só as edições autorizadas persistirão.
DO $$
DECLARE v_p text;
BEGIN
  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809301';
  IF v_p IS DISTINCT FROM 'r1-orig' THEN
    RAISE EXCEPTION 'FAIL [tec/ended]: técnico alterou reserva encerrada: %', v_p;
  END IF;

  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809302';
  IF v_p IS DISTINCT FROM 'TEC-ONGOING' THEN
    RAISE EXCEPTION 'FAIL [tec/ongoing]: edição autorizada não persistiu: %', v_p;
  END IF;

  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809303';
  IF v_p IS DISTINCT FROM 'TEC-FUTURE' THEN
    RAISE EXCEPTION 'FAIL [tec/future]: edição autorizada não persistiu: %', v_p;
  END IF;

  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809304';
  IF v_p IS DISTINCT FROM 'r4-orig' THEN
    RAISE EXCEPTION 'FAIL [tec/cross-ws]: técnico alterou reserva de outra unidade: %', v_p;
  END IF;
END $$;

-- ── JANELA 2 — USUÁRIO SEM PERMISSÃO (sem membership; sem Action) ────────────
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('labhub.nobody'), true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rows integer;
BEGIN
  -- FUTURA: negada (sem autorização) — 0 linhas.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'HACK-NOBODY'
     WHERE id = '09809809-8098-0980-9809-809809809303';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [nobody/future]: usuário sem permissão editou reserva futura (linhas=%)', v_rows;
  END IF;

  -- ENCERRADA: negada (sem autorização e fora da janela) — 0 linhas.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'HACK-NOBODY'
     WHERE id = '09809809-8098-0980-9809-809809809301';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [nobody/ended]: usuário sem permissão editou reserva encerrada (linhas=%)', v_rows;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_p text;
BEGIN
  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809303';
  IF v_p IS DISTINCT FROM 'TEC-FUTURE' THEN
    RAISE EXCEPTION 'FAIL [nobody/future]: reserva futura alterada por quem não pode: %', v_p;
  END IF;
END $$;

-- ── JANELA 3 — SUPER ADMIN (sem membership) ──────────────────────────────────
--    O ponto central da Issue #388: a regra temporal VENCE o bypass de super
--    admin. Super admin edita reserva futura de qualquer unidade, mas NÃO
--    consegue editar reserva encerrada.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('labhub.super'), true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rows integer;
BEGIN
  -- (a) ENCERRADA: negada mesmo para super admin — 0 linhas.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'HACK-SUPER'
     WHERE id = '09809809-8098-0980-9809-809809809301';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [super/ended]: SUPER ADMIN editou reserva ENCERRADA (bypass temporal!) linhas=%', v_rows;
  END IF;

  -- (b) FUTURA em outra unidade: bypass de workspace preservado — 1 linha.
  BEGIN
    UPDATE public.tablet_reservations SET professor = 'SUPER-FUTURE'
     WHERE id = '09809809-8098-0980-9809-809809809304';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_rows := -1; END;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL [super/future]: super admin não conseguiu editar reserva futura (linhas=%)', v_rows;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_p text;
BEGIN
  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809301';
  IF v_p IS DISTINCT FROM 'r1-orig' THEN
    RAISE EXCEPTION 'FAIL [super/ended]: SUPER ADMIN alterou reserva encerrada: %', v_p;
  END IF;

  SELECT professor INTO v_p FROM public.tablet_reservations
   WHERE id = '09809809-8098-0980-9809-809809809304';
  IF v_p IS DISTINCT FROM 'SUPER-FUTURE' THEN
    RAISE EXCEPTION 'FAIL [super/future]: edição do super admin não persistiu: %', v_p;
  END IF;
END $$;

-- ── Restaura o contexto confiável e encerra ─────────────────────────────────
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

DO $$ BEGIN
  RAISE NOTICE 'OK: 098 checks passed';
END $$;
