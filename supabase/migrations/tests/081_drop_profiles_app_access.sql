-- =============================================================================
-- tests/081_drop_profiles_app_access.sql
-- =============================================================================
-- F2-D-N3 — harness PÓS-DROP de `public.profiles.app_access`.
--
-- Roda depois da 081 e prova que a remoção foi SEGURA, ou seja, que nada além
-- da coluna foi perdido e que o trust boundary continua funcionando.
--
-- Harness comportamental (mesmo padrão dos harnesses 049/065-071/076-080 e do
-- stub do Migrations CI, scripts/ci/supabase_stub_bootstrap.sql:81):
--   · o caller é simulado com `set_config('request.jwt.claim.sub', ...)`;
--   · `profiles.id` referencia `auth.users(id)`, então o profile nasce pela
--     trigger `on_auth_user_created` (053) a partir de um INSERT em auth.users;
--   · escritas privilegiadas em `profiles` são feitas com `auth.uid()` NULL —
--     contexto confiável, que a guarda da 067/080 aceita explicitamente.
--
--  CHECKS
--    1. `public.profiles.app_access` NÃO EXISTE mais (a coluna foi removida);
--    2. as demais colunas de identidade/configuração SOBREVIVEM
--       (id, role, workspace_ids, status, is_super_admin);
--    3. a trigger de signup `on_auth_user_created` continua criando profile
--       a partir de `auth.users` (não foi quebrada pela remoção);
--    4. um UPDATE NORMAL em `public.profiles` funciona — a regressão que a 080
--       existia para impedir era `record "new" has no field "app_access"` em
--       TODO update; se a coluna tivesse saído antes da 080, este check falha;
--    5. a trigger de auditoria `trg_app_audit_profiles` continua gravando
--       `role_changed` com o mesmo `meta` (comportamento da 080 preservado);
--    6. a guarda `trg_profiles_guard_privileged` continua bloqueando
--       autoelevação de usuário comum (is_super_admin/role/status, 42501);
--    7. a guarda continua protegendo `id` e `workspace_ids` como imutáveis;
--    8. as funções de autorização RBAC2 continuam no catálogo e sem `app_access`.
-- =============================================================================

DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_uid2  uuid := gen_random_uuid();
  v_tec   uuid;
  v_n     integer;
  v_txt   text;          -- usada nos FOREACH sobre listas de TEXTO
  v_meta  jsonb;
  v_role  text;
BEGIN

-- ══ [1] a coluna foi removida ═══════════════════════════════════════════
IF EXISTS (
  SELECT 1 FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass
    AND attname = 'app_access'
    AND NOT attisdropped
) THEN
  RAISE EXCEPTION 'FAIL [1]: public.profiles.app_access ainda existe apos a 081';
END IF;

-- ══ [2] as outras colunas sobreviveram ═══════════════════════════════════
FOREACH v_txt IN ARRAY ARRAY['id','role','workspace_ids','status','is_super_admin'] LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = v_txt AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'FAIL [2]: a coluna % de public.profiles sumiu com a 081', v_txt;
  END IF;
END LOOP;

-- ══ [3] a trigger de signup continua criando profile ═════════════════════
IF NOT EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'public.profiles'::regclass
                AND tgname = 'trg_profiles_guard_privileged' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'FAIL [3]: trg_profiles_guard_privileged sumiu';
END IF;

INSERT INTO auth.users (id, email) VALUES (v_uid, '081-target@teste.invalid');
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

-- A trigger de signup precisa ter criado o profile (id = auth.users.id).
IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
  RAISE EXCEPTION 'FAIL [3]: on_auth_user_created nao criou o profile apos a 081';
END IF;

-- ══ [4] UPDATE NORMAL funciona (a regressão que a 080 evitava) ═════════════
-- Se a coluna tivesse sido removida com a trigger da 054/067 ainda ativa, este
-- UPDATE lancaria `record "new" has no field "app_access"`.
UPDATE public.profiles SET name = 'nome apos a 081' WHERE id = v_uid;

SELECT name INTO v_role FROM public.profiles WHERE id = v_uid;
IF v_role IS NULL THEN
  RAISE EXCEPTION 'FAIL [4]: UPDATE normal apagou a linha do profile';
END IF;
IF v_role <> 'nome apos a 081' THEN
  RAISE EXCEPTION 'FAIL [4]: UPDATE normal nao persistiu em public.profiles';
END IF;

-- ══ [5] a auditoria continua gravando role_changed ════════════════════════
SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec';

-- Contexto confiável (auth.uid() nulo) para editar cargo de terceiro.
PERFORM set_config('request.jwt.claim.sub', NULL, true);
UPDATE public.profiles SET role = 'admin' WHERE id = v_uid;

SELECT meta INTO v_meta FROM public.app_audit_logs
WHERE entity = 'user' AND entity_id = v_uid::text AND action = 'role_changed'
ORDER BY timestamp DESC NULLS LAST, id DESC NULLS LAST LIMIT 1;
IF v_meta IS NULL THEN
  RAISE EXCEPTION 'FAIL [5]: trg_app_audit_profiles nao gravou role_changed apos a 081';
END IF;
IF v_meta ->> 'new_role' IS DISTINCT FROM 'admin' THEN
  RAISE EXCEPTION 'FAIL [5]: meta de role_changed divergiu apos a 081: %', v_meta::text;
END IF;

-- ══ [6/7] a guarda de colunaprivileged continua valendo ═══════════════════
INSERT INTO auth.users (id, email) VALUES (v_uid2, '081-comum@teste.invalid');
PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true);

BEGIN
  UPDATE public.profiles SET is_super_admin = true WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [6]: usuario comum conseguiu virar super admin apos a 081';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

BEGIN
  UPDATE public.profiles SET role = 'admin' WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [6]: usuario comum conseguiu virar admin apos a 081';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

BEGIN
  UPDATE public.profiles SET status = 'suspended' WHERE id = v_uid2;
  RAISE EXCEPTION 'FAIL [6]: usuario comum conseguiu mudar o proprio status apos a 081';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;

-- ══ [8] as funções RBAC2 seguem no catálogo, sem app_access ══════════════
FOREACH v_txt IN ARRAY ARRAY['user_can_manage_tv','user_can_cancel_tablet_reservation'] LOOP
  IF to_regprocedure('public.' || v_txt || '(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL [8]: a funcao % sumiu com a 081', v_txt;
  END IF;
END LOOP;

-- Nenhuma delas pode ler a coluna removida.
--
-- CUIDADO COM FALSO POSITIVO: `guard_profile_privileged_columns` MENCIONA
-- `app_access` em um COMENTÁRIO (que registra que o campo saiu da lista de
-- protegidos). Um `LIKE '%app_access%'` acusaria dependência inexistente — foi
-- exatamente o que aconteceu na auditoria live. Por isso o teste casa só as
-- FORMAS EXECUTÁVEIS: `NEW/OLD.app_access`, `.<algo>.app_access->` e
-- `app_access->>`. Um backtick de comentário não casa.
IF EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('user_can_manage_tv','user_can_cancel_tablet_reservation',
                      'audit_profiles_change','guard_profile_privileged_columns')
    AND pg_get_functiondef(p.oid) ~
        '(NEW|OLD)\.app_access|\.app_access[[:space:]]*->|app_access[[:space:]]*->>'
) THEN
  RAISE EXCEPTION 'FAIL [8]: alguma funcao ainda le app_access apos a 081';
END IF;

-- Limpeza: as linhas de auditoria criadas por este harness.
DELETE FROM public.app_audit_logs WHERE entity_id IN (v_uid::text, v_uid2::text);
DELETE FROM public.profiles WHERE id IN (v_uid, v_uid2);
DELETE FROM auth.users WHERE id IN (v_uid, v_uid2);

-- Não vaza o contexto do GUC para os testes seguintes do STEP 6.
PERFORM set_config('request.jwt.claim.sub', NULL, true);

RAISE NOTICE 'OK: 081 drop_profiles_app_access checks passed';
END $$;
