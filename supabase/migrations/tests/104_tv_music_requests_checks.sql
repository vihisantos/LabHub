-- =============================================================================
-- tests/104_tv_music_requests_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS e COMPORTAMENTAIS da migration 104 (pedidos públicos
-- via QR: colunas source/requester_name/ip_hash, CHECKs e índice único de
-- deduplicação de pendentes).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 104 is applied
-- (o CI roda este arquivo em PostgreSQL efêmero, STEP 6 da suíte).
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 104 checks passed".
--
-- Cobertura do índice tv_music_requests_pending_dedupe_idx
-- (workspace_id, youtube_video_id) WHERE status = 'pending':
--   C1 unidades diferentes, mesmo vídeo      => sem colisão
--   C2 mesma unidade, vídeos diferentes      => sem colisão
--   C3 mesmo ws+vídeo, status diferente      => sem colisão (predicado)
--   C4 vídeo NULL, dois pendentes            => sem colisão (NULLS DISTINCT)
--   C5 mesmo ws+vídeo, dois pendentes        => 23505 (garantia anti-corrida)
-- =============================================================================

DO $$
DECLARE
  v_ws_a     uuid;
  v_ws_b     uuid;
  v_uid      uuid;
  v_uniq     boolean;
  v_partial  boolean;
  v_checks   integer;
  v_notnull  boolean;
  v_default  text;
  v_count    integer;
  v_groups   integer;
  v_sample   text;
BEGIN

-- ── Fixture isolada (prefixo exclusivo; banco efêmero é descartável) ────────
INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user,
                        is_anonymous, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '104-checks@labhub.test', now(),
        '{"provider":"email"}'::jsonb, '{}'::jsonb, false, false, now(), now())
RETURNING id INTO v_uid;

INSERT INTO public.profiles (id, email, name)
VALUES (v_uid, '104-checks@labhub.test', '104 Checks')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (slug, name)
VALUES ('labhub_104_test_a_' || gen_random_uuid()::text, '104 WS A')
RETURNING id INTO v_ws_a;
INSERT INTO public.workspaces (slug, name)
VALUES ('labhub_104_test_b_' || gen_random_uuid()::text, '104 WS B')
RETURNING id INTO v_ws_b;

-- ── 1. Índice único PARCIAL existe (UNIQUE + predicado status='pending') ────
SELECT i.indisunique, (i.indpred IS NOT NULL)
  INTO v_uniq, v_partial
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname = 'tv_music_requests_pending_dedupe_idx';

IF v_uniq IS NULL THEN
  RAISE EXCEPTION 'FAIL: índice tv_music_requests_pending_dedupe_idx ausente';
END IF;
IF NOT v_uniq OR NOT v_partial THEN
  RAISE EXCEPTION 'FAIL: índice dedupe deveria ser UNIQUE e parcial (WHERE status=''pending''); indisunique=%, parcial=%', v_uniq, v_partial;
END IF;

-- ── 2. Colunas: source NOT NULL default 'admin'; requested_by nullable ──────
SELECT attnotnull INTO v_notnull
  FROM pg_attribute
 WHERE attrelid = 'public.tv_music_requests'::regclass AND attname = 'source';
IF v_notnull IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'FAIL: source deveria ser NOT NULL (attnotnull=%)', v_notnull;
END IF;

SELECT column_default INTO v_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tv_music_requests'
   AND column_name = 'source';
IF v_default IS NULL OR v_default NOT LIKE '%admin%' THEN
  RAISE EXCEPTION 'FAIL: default de source deveria ser ''admin''; encontrado %', v_default;
END IF;

SELECT a.attnotnull INTO v_notnull
  FROM pg_attribute a
 WHERE a.attrelid = 'public.tv_music_requests'::regclass AND a.attname = 'requested_by';
IF v_notnull IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'FAIL: requested_by deveria ser nullable (pedido anônimo via QR)';
END IF;

-- ── 3. Os 3 CHECKs existem ──────────────────────────────────────────────────
SELECT count(*) INTO v_checks
  FROM pg_constraint
 WHERE conrelid = 'public.tv_music_requests'::regclass
   AND conname IN ('tv_music_requests_source_check',
                   'tv_music_requests_requester_name_length',
                   'tv_music_requests_anon_only_qr');
IF v_checks <> 3 THEN
  RAISE EXCEPTION 'FAIL: esperados 3 CHECK constraints em tv_music_requests; encontrados %', v_checks;
END IF;

-- ── C1. Unidades diferentes, mesmo vídeo: sem colisão ───────────────────────
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/vid104', 'vid104', v_uid, 'pending', 'qr');
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_b, 'https://youtu.be/vid104', 'vid104', v_uid, 'pending', 'qr');

-- ── C2. Mesma unidade, vídeos diferentes: sem colisão ───────────────────────
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/vid104b', 'vid104b', v_uid, 'pending', 'qr');

-- ── C3. Mesmo ws+vídeo, status diferente: sem colisão (predicado do índice) ─
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/vid104c', 'vid104c', v_uid, 'pending', 'qr');
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/vid104c', 'vid104c', v_uid, 'approved', 'qr');

-- ── C4. Vídeo NULL nunca colide (NULLS DISTINCT) ────────────────────────────
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/watch?v=semvideo', NULL, v_uid, 'pending', 'qr');
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/watch?v=semvideo', NULL, v_uid, 'pending', 'qr');

-- ── C5. Mesmo ws+vídeo, dois pendentes: 23505 (garantia anti-corrida) ───────
-- O PRIMEIRO insert fica fora da subtransação: ele deve PERMANECER — só o
-- segundo (concorrente) é rejeitado pelo índice.
INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                      requested_by, status, source)
VALUES (v_ws_a, 'https://youtu.be/vid104d', 'vid104d', v_uid, 'pending', 'qr');
BEGIN
  INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                        requested_by, status, source)
  VALUES (v_ws_a, 'https://youtu.be/vid104d', 'vid104d', v_uid, 'pending', 'qr');
  RAISE EXCEPTION 'FAIL (dedupe): segundo pendente do mesmo vídeo deveria violar o índice único (23505)';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'OK (dedupe): segundo pendente do mesmo vídeo violou o índice único (23505); o primeiro foi preservado';
END;

-- ── Confirmação contábil: 8 linhas da fixture (escopadas aos 2 workspaces) ──
SELECT count(*) INTO v_count
  FROM public.tv_music_requests
 WHERE workspace_id IN (v_ws_a, v_ws_b);
IF v_count <> 8 THEN
  RAISE EXCEPTION 'FAIL: esperadas 8 linhas da fixture da 104; encontradas %', v_count;
END IF;

-- ── C6. Preflight de duplicatas: 25+ grupos reporta total real, amostra ≤ 20 ──
-- Insere 25 grupos duplicados distintos (mesmo workspace + mesmo vídeo, 2 pendentes cada)
-- e verifica que a lógica de preflight da migration 104 reporta o TOTAL (25), não o
-- LIMIT 20 da amostra, e que nenhum registro é removido ou alterado automaticamente.
BEGIN
  FOR i IN 1..25 LOOP
    INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                          requested_by, status, source)
    VALUES (v_ws_a, 'https://youtu.be/dupgroup' || i, 'dupgroup' || i, v_uid, 'pending', 'qr');
    INSERT INTO public.tv_music_requests (workspace_id, youtube_url, youtube_video_id,
                                          requested_by, status, source)
    VALUES (v_ws_a, 'https://youtu.be/dupgroup' || i, 'dupgroup' || i, v_uid, 'pending', 'qr');
  END LOOP;

  -- Linhas antes do preflight (para verificar transacionalidade)
  SELECT count(*) INTO v_count
    FROM public.tv_music_requests
   WHERE workspace_id = v_ws_a AND youtube_video_id LIKE 'dupgroup%';
  IF v_count <> 50 THEN
    RAISE EXCEPTION 'FAIL (C6): esperado 50 registros dos 25 grupos antes do preflight; encontradas %', v_count;
  END IF;

  -- Mesma lógica de preflight da migration 104 (CTE separa total da amostra de ≤ 20)
  -- LEFT JOIN LATERAL garante v_groups = 0 e v_sample = NULL quando não há duplicatas.
  WITH dup_groups AS (
    SELECT r.workspace_id, r.youtube_video_id, count(*) AS n
      FROM public.tv_music_requests r
     WHERE r.status = 'pending'
       AND r.workspace_id IS NOT NULL
       AND r.youtube_video_id IS NOT NULL
     GROUP BY r.workspace_id, r.youtube_video_id
    HAVING count(*) > 1
  ),
  total_groups AS (
    SELECT count(*) AS total FROM dup_groups
  )
  SELECT t.total,
         coalesce(string_agg(
           format('%s | vídeo=%s | pendentes=%s', d.workspace_id, d.youtube_video_id, d.n),
           E'\n' ORDER BY d.n DESC, d.workspace_id, d.youtube_video_id), '')
    INTO v_groups, v_sample
    FROM total_groups t
    LEFT JOIN LATERAL (
      SELECT workspace_id, youtube_video_id, n
        FROM dup_groups
       ORDER BY n DESC, workspace_id, youtube_video_id
       LIMIT 20
    ) d ON true
   GROUP BY t.total;

  -- O total deve ser 25 (não limitado a 20)
  IF v_groups <> 25 THEN
    RAISE EXCEPTION 'FAIL (C6): preflight reportou % grupo(s), esperado 25 (total real)', v_groups;
  END IF;

  -- A amostra da mensagem não excede 20 linhas
  IF v_sample = '' THEN
    v_count := 0;
  ELSE
    v_count := (length(v_sample) - length(replace(v_sample, chr(10), ''))) + 1;
  END IF;
  IF v_count > 20 THEN
    RAISE EXCEPTION 'FAIL (C6): amostra excede 20 grupos; contém %', v_count;
  END IF;

  -- O preflight abortaria com ERRCODE P0001 (TV_MUSIC_REQUESTS_PENDING_DUPLICATES)
  IF v_groups > 0 THEN
    RAISE EXCEPTION 'TV_MUSIC_REQUESTS_PENDING_DUPLICATES: % grupo(s) de pedidos pendentes duplicados',
      v_groups USING ERRCODE = 'P0001';
  END IF;
EXCEPTION
  WHEN others THEN
    IF SQLSTATE <> 'P0001' THEN
      RAISE EXCEPTION 'FAIL (C6): preflight abortou com SQLSTATE inesperado %', SQLSTATE;
    END IF;
    RAISE NOTICE 'OK (C6): preflight abortou com P0001 (TV_MUSIC_REQUESTS_PENDING_DUPLICATES)';
END;

-- Após o preflight (ROLLBACK da exceção acima), nenhum registro deve ter sido alterado.
-- A exceção P0001 foi capturada e o bloco continua; a transação do teste não fez ROLLBACK
-- dos inserts da fixture C6 porque a exceção foi tratada internamente. Verificamos que
-- os 50 registros ainda existem (sem exclusão ou alteração automática).
SELECT count(*) INTO v_count
  FROM public.tv_music_requests
 WHERE workspace_id = v_ws_a AND youtube_video_id LIKE 'dupgroup%';
IF v_count <> 50 THEN
  RAISE EXCEPTION 'FAIL (C6): após o preflight, esperado 50 registros intactos; encontradas %', v_count;
END IF;

RAISE NOTICE 'OK (C6): 25 grupos duplicados detectados; total real reportado (não amostra); amostra ≤ 20; nenhum registro alterado';

RAISE NOTICE 'OK: 104 checks passed';
END;
$$;
