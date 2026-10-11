-- =============================================================================
-- 096_patrimonio_grants_hygiene.sql
-- =============================================================================
-- Issue #289 / revisão de segurança da PR #379 — higiene de GRANTS das tabelas
-- do Patrimônio.
--
-- CAUSA-RAIZ (comprovada em produção via pg_default_acl):
--   O Supabase cria TODO objeto novo do schema `public` com privilégios de
--   plataforma amplos para anon/authenticated/service_role (arwdDxtm —
--   incluindo TRUNCATE, que NÃO é bloqueado por RLS). As migrations 091-094
--   revogaram `anon` explicitamente, mas não normalizaram `authenticated`:
--   o desvio ficou invisível no CI (PostgreSQL puro não tem esses defaults)
--   e só apareceu no banco real — o check 094 falhou no DEV.
--
-- CORREÇÃO (idempotente — REVOKE de privilégio não concedido é no-op):
--   · `asset_movements`: append-only a nível de GRANT — `authenticated` fica
--     com SELECT+INSERT apenas (UPDATE/DELETE já são negados por ausência de
--     policy; TRUNCATE precisava da revogação explícita);
--   · `assets`/`patrimonio_locations`/`patrimonio_responsibles`: mantêm o DML
--     autorizado (UPDATE/DELETE permanecem, gated pelas policies RLS —
--     `patrimonio.asset.edit` e delete super-admin-only); apenas o TRUNCATE
--     é revogado.
--
-- FORA DO ESCOPO (deliberado):
--   · sem CASCADE; sem tocar em `service_role` (servidor, full por desenho),
--     `anon` (já limpo pelas 091-094) ou `postgres` (owner);
--   · sem ALTER de dados, estrutura, policies, funções, triggers, ownership;
--   · sem tocar no módulo Stock ou em qualquer outro módulo;
--   · UPDATE/DELETE de assets/locations/responsibles NÃO são revogados aqui
--     (sujeitos às policies RLS; avaliação separada).
--
-- A transação é de responsabilidade do runner (`scripts/migrate.py`), que
-- registra esta versão em `public.schema_migrations` após a execução limpa.
-- =============================================================================

REVOKE UPDATE, DELETE, TRUNCATE
ON public.asset_movements
FROM authenticated;

REVOKE TRUNCATE
ON public.patrimonio_locations
FROM authenticated;

REVOKE TRUNCATE
ON public.patrimonio_responsibles
FROM authenticated;

REVOKE TRUNCATE
ON public.assets
FROM authenticated;
