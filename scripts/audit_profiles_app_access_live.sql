-- ============================================================
-- LabHub — Auditoria live de public.profiles.app_access
-- ============================================================
-- Verifica que a coluna legada `app_access` nãoTEM mais nenhuma
-- dependência estrutural, nenhuma autoridade e nenhuma referência no
-- código de produção.
--
-- ESTADO ESPERADO: a coluna NÃO EXISTE (migration 081 aplicada).
--     · 8.0  -> 0 linhas ...................... PASS (a coluna saiu)
--                1 linha ...................... FAIL (a coluna voltou / 081
--                                                 não foi aplicada)
--     · 8.1  -> 0 linhas ...................... PASS
--     · 8.2  -> exatamente 2 triggers ......... PASS
--     · 8.4  -> 0 funções ................... PASS (ver nota sobre comentários)
--     · 8.5/8.6 -> 0 linhas .................. PASS
--     · 8.7  -> `coluna_inexistente` = 1 e todos os outros = 0
--
-- Se a coluna AINDA existir (8.0 com 1 linha, e a 081 ainda não foi
-- aplicada), os demais blocos continuam válidos: eles dizem se é seguro
-- removê-la. É o estado intermediário de um ambiente que ainda não recebeu
-- a 081.
--
-- READ-ONLY. Este arquivo contém SOMENTE SELECT de catálogo do
-- PostgreSQL. Não altera, cria, remove nem bloqueia nada.
--
-- COMO USAR
--   1. Abra o SQL Editor do Supabase DEV
--   2. Cole o arquivo INTEIRO e execute
--   3. Copie o resultado de cada bloco
--   4. Repita, sem mudar nada, no SQL Editor do PROD
--   5. Compare os dois ambientes entre si
--
-- IMPORTANTE
--   · Execute com o papel padrão `postgres`. Ele é o único que enxerga
--     funções de todos os schemas (a 8.4 é justamente para achar
--     dependência fora de `public`).
--   · Se um bloco der erro, PARE e reporte o erro. Não contorne.
--   · Cada bloco é independente: um erro em um não invalida os outros,
--     mas a ausência de resultado NÃO deve ser lida como "vazio".
-- ============================================================


-- ============================================================
-- 8.0 — A coluna JÁ FOI REMOVIDA?
-- ============================================================
-- Critério pós-081. Esperado: 0 linhas (a coluna não existe mais).
-- Se voltar 1 linha, a 081 não foi aplicada neste ambiente.
-- ============================================================

SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.column_default,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'profiles'
  AND c.column_name = 'app_access';


-- ============================================================
-- 8.1 — Dependências registradas em pg_depend
-- ============================================================
-- BLOQUEADOR: qualquer linha aqui impede a 081.
--
-- ATENÇÃO — esta consulta NÃO cobre tudo de propósito:
--   · índices entram com deptype='i' e são filtrados fora pelo ='n'
--     (cobertos pela 8.6);
--   · views dependem da coluna via pg_rewrite, não via pg_depend
--     direto na coluna (cobertas pela 8.5);
--   · corpos plpgsql NÃO geram entrada de catálogo (cobertos pela 8.4).
-- É por isso que existem as 8.4, 8.5 e 8.6.
-- ============================================================

SELECT
  d.classid::regclass AS dependent_class,
  d.objid,
  d.objsubid,
  d.deptype,
  a.attrelid::regclass AS referenced_table,
  a.attname AS referenced_column
FROM pg_depend d
JOIN pg_attribute a
  ON a.attrelid = d.refobjid
 AND a.attnum = d.refobjsubid
WHERE d.refobjid = 'public.profiles'::regclass
  AND a.attname = 'app_access'
  AND d.deptype = 'n'
ORDER BY 1, 2, 3;


-- ============================================================
-- 8.2 — Triggers de public.profiles
-- ============================================================
-- ESPERADO: exatamente 2 linhas.
--     1) trg_app_audit_profiles        (AFTER UPDATE  — migration 080)
--     2) trg_profiles_guard_privileged (BEFORE UPDATE — migration 080)
--
-- Qualquer TERCEIRO trigger em public.profiles é BLOQUEADOR.
--
-- `on_auth_user_created` NÃO deve aparecer aqui: ele vive em
-- `auth.users` (ver 8.2b). Se aparecer, a tabela está errada.
--
-- `trg_profiles_sync_memberships` NÃO deve aparecer: foi removido
-- na migration 053 e é conferido pela 8.3b.
-- ============================================================

SELECT
  tgname,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal
ORDER BY tgname;


-- ============================================================
-- 8.2b — Trigger de signup em auth.users
-- ============================================================
-- Confirma que a criação de profile continua no lugar certo.
-- A presença de `on_auth_user_created` aqui NÃO é dependência de
-- profiles.app_access e NÃO conta como bloqueador.
-- ============================================================

SELECT
  tgname,
  tgrelid::regclass AS on_table,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal
ORDER BY tgname;


-- ============================================================
-- 8.3 — Policies de public.profiles
-- ============================================================
-- A coluna `menciona_app_access` é calculada: ela evita ter que ler
-- `qual`/`with_check` linha a linha procurando a coluna.
--
-- ESPERADO: `menciona_app_access` = false em TODAS as linhas.
-- Qualquer true é BLOQUEADOR.
-- ============================================================

SELECT
  policyname,
  cmd,
  permissive,
  roles,
  (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ILIKE '%app_access%'
    AS menciona_app_access,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;


-- ============================================================
-- 8.3b — Quantas policies por comando?
-- ============================================================
-- Serve para conferir duas coisas de uma vez:
--   · DELETE: deve existir exatamente 1 policy. Duas reabririam
--     self-delete (a hardening da 073 consolidatei isso).
--   · SELECT/UPDATE/INSERT: 1 cada, como esperado.
-- ============================================================

SELECT
  cmd,
  count(*)::int AS total_policies,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
GROUP BY cmd
ORDER BY cmd;


-- ============================================================
-- 8.4 — Funções que mencionem app_access (TODOS os schemas)
-- ============================================================
-- BLOQUEADOR: qualquer linha aqui que leia a coluna de fato.
-- Menção apenas em COMMENT/COMMENT ON não é dependência funcional —
-- o corpo vem inteiro em `definition`, então dá para distinguir.
--
-- NOTA TÉCNICA: o filtro `p.prokind IN ('f','p')` é obrigatório.
-- `pg_get_functiondef()` LANÇA ERRO em agregadas ('a') e window
-- ('w'), que existem no catálogo do Supabase. Sem esse filtro, esta
-- consulta quebra inteira em vez de devolver o resultado.
-- ============================================================

SELECT
  n.nspname AS schema_name,
  p.proname,
  p.prokind,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE p.prokind IN ('f', 'p')
  AND pg_get_functiondef(p.oid) ILIKE '%app_access%'
ORDER BY n.nspname, p.proname;


-- ============================================================
-- 8.5 — Views e materialized views que mencionem app_access
-- ============================================================
-- BLOQUEADOR: qualquer linha.
-- ============================================================

SELECT DISTINCT
  n.nspname AS schema_name,
  c.relname,
  c.relkind,
  pg_get_viewdef(c.oid) AS definition
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND pg_get_viewdef(c.oid) ILIKE '%app_access%'
ORDER BY n.nspname, c.relname;


-- ============================================================
-- 8.6 — Índices que mencionem app_access
-- ============================================================
-- BLOQUEADOR: qualquer linha.
-- ============================================================

SELECT
  n.nspname AS schema_name,
  c.relname AS index_name,
  i.indisunique,
  pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class c
  ON c.oid = i.indexrelid
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE i.indrelid = 'public.profiles'::regclass
  AND pg_get_indexdef(i.indexrelid) ILIKE '%app_access%'
ORDER BY n.nspname, c.relname;


-- ============================================================
-- 8.7 — Resumo: contagem de bloqueadores
-- ============================================================
-- Uma linha por tipo de bloqueador, com o total ao lado.
-- Se TODO total for 0 nos dois ambientes, a 081 está liberada.
-- `triggers_de_profiles_inesperados` considera que o esperado é 2.
-- ============================================================

SELECT
  -- 1 quando a coluna NÃO existe, que é o estado esperado APÓS a 081.
  -- (0 significa que ela ainda existe: a 081 não foi aplicada aqui.)
  'coluna_removida' AS verificacao,
  CASE WHEN count(*) = 0 THEN 1 ELSE 0 END::int AS total
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'app_access'
UNION ALL
SELECT 'pg_depend', count(*)::int FROM pg_depend d
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refobjid='public.profiles'::regclass AND a.attname='app_access' AND d.deptype='n'
UNION ALL
SELECT 'triggers_de_profiles_inesperados', greatest(count(*)::int - 2, 0) FROM pg_trigger
  WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'policies_que_mencionam', count(*)::int FROM pg_policies
  WHERE schemaname='public' AND tablename='profiles'
    AND (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ILIKE '%app_access%'
UNION ALL
SELECT 'funcoes_que_mencionam', count(*)::int FROM pg_proc p
  WHERE p.prokind IN ('f','p') AND pg_get_functiondef(p.oid) ILIKE '%app_access%'
UNION ALL
SELECT 'views_que_mencionam', count(DISTINCT c.oid)::int FROM pg_class c
  WHERE c.relkind IN ('v','m') AND pg_get_viewdef(c.oid) ILIKE '%app_access%'
UNION ALL
SELECT 'indices_que_mencionam', count(*)::int FROM pg_index i
  WHERE i.indrelid='public.profiles'::regclass
    AND pg_get_indexdef(i.indexrelid) ILIKE '%app_access%'
ORDER BY 1;
