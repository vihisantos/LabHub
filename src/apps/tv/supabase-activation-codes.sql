-- ============================================================
-- DEPRECATED — NÃO EXECUTAR. Registro histórico apenas.
-- Consolidado em supabase/migrations/000_bootstrap_baseline.sql (seção TV).
-- ============================================================
-- Códigos de ativação do Lab Hub TV Desktop
-- O código é gerado no painel do site (PC) e digitado no app
-- desktop na TV. Apenas o backend (service_role) cria/valida:
-- o cliente (anon/authenticated) NÃO tem acesso direto à tabela.
-- ============================================================
create table if not exists tv_activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text,
  status text not null default 'pending' check (status in ('pending', 'used')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Sem policies de RLS → clientes anon/authenticated não acessam;
-- somente o service_role (backend em api/app.py) opera a tabela.
alter table tv_activation_codes enable row level security;

create index if not exists idx_tv_activation_codes_code on tv_activation_codes(code);
create index if not exists idx_tv_activation_codes_status on tv_activation_codes(status, expires_at);
