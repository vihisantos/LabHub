-- =============================================================================
-- supabase_stub_bootstrap.sql — bootstrap mínimo "Supabase-like" para o
-- PostgreSQL efêmero do CI de migrations (GitHub Actions `services: postgres`).
--
-- As migrations 000–072 são escritas para o Postgres gerenciado da Supabase e
-- referenciam: roles `anon`/`authenticated`/`service_role` (GRANT/REVOKE),
-- schema `auth` (funções auth.uid()/auth.jwt()/auth.role() em policies/guards)
-- e a tabela `auth.users` (FKs de 000/001/051). Este arquivo provê APENAS o
-- mínimo necessário para o fluxo real rodar — NÃO replica Supabase auth.
--
-- O runner do CI conecta como `postgres` (superuser): políticas RLS não são
-- aplicadas a ele, então os gates que validam "service_role only" nos helpers
-- SECURITY DEFINER são exercitados via REVOKE/GRANT (ACL), não via RLS.
--
-- Idempotente (CREATE ... IF NOT EXISTS / DO $$). Replay seguro.
-- =============================================================================

-- ── 1. roles padrão da Supabase (NOLOGIN: nenhum cliente conecta com elas) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- ── 2. schema auth + usuários (tabela mínima p/ FKs e triggers) ─────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    instance_id             uuid,
    id                      uuid PRIMARY KEY,
    aud                     varchar(255),
    role                    varchar(255),
    email                   varchar(255),
    encrypted_password      varchar(255),
    email_confirmed_at      timestamptz,
    invited_at              timestamptz,
    confirmation_token      varchar(255),
    confirmation_sent_at    timestamptz,
    recovery_token          varchar(255),
    recovery_sent_at        timestamptz,
    email_change_token_new  varchar(255),
    email_change            varchar(255),
    email_change_sent_at    timestamptz,
    last_sign_in_at         timestamptz,
    raw_app_meta_data       jsonb,
    raw_user_meta_data      jsonb,
    is_super_admin          boolean,
    created_at              timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now(),
    phone                   varchar(255),
    phone_confirmed_at      timestamptz,
    phone_change            varchar(255),
    phone_change_token      varchar(255),
    phone_change_sent_at    timestamptz,
    confirmed_at            timestamptz,
    email_change_token_current varchar(255),
    email_change_confirm_status smallint,
    banned_until            timestamptz,
    reauthentication_token  varchar(255),
    reauthentication_sent_at timestamptz,
    is_sso_user             boolean DEFAULT false,
    deleted_at              timestamptz,
    is_anonymous            boolean DEFAULT false
);

-- ── 3. helpers auth.* usados nas policies/guards das migrations ─────────────
-- Semelhante ao Supabase real: leem as claims do JWT da sessão (current_setting
-- 'request.jwt.claim.*' — o harness 071/072/039 as injeta via set_config).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

-- ── 4. extensões comuns que as migrations esperam existir ───────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;