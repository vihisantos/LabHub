-- ============================================================
-- MIGRAÇÃO: Configurações do workspace (apps + cor)
-- Execute este arquivo no SQL Editor do Supabase.
--
-- 1. disabled_apps: apps desativados neste workspace (jsonb array
--    de ids do appRegistry). Vazio = todos ativos por padrão.
-- 2. color: cor/tema escolhida para o workspace (hex, ex: "#6366f1").
-- ============================================================

alter table workspaces add column if not exists disabled_apps jsonb default '[]'::jsonb;
alter table workspaces add column if not exists color text default '';
