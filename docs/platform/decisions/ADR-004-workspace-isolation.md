# ADR-004 — Modelo de isolamento por workspace

## Status

Aceita

## Contexto

O LabHub atende vários campi universitários. Cada campus precisa dos seus próprios dados (ativos, chamados, reservas), sem visibilidade sobre os dados dos demais. Usuários podem pertencer a mais de um campus.

## Decisão

Implementar isolamento por workspace em três níveis:

1. **Banco (RLS)** — políticas por operação (SELECT/INSERT/UPDATE/DELETE) usando `user_belongs_to_workspace(workspace_id)`, com bypass de `is_super_admin()`. Implementado na migration 027.
2. **Frontend (filtro)** — `workspaceStore.filter()` sobre as coleções locais
3. **Backend (API)** — `require_module()` verifica a configuração do workspace

Cada usuário tem `workspace_ids: UUID[]` no perfil, e o workspace ativo é selecionado na interface.

### Função auxiliar

```sql
-- Migration 027: user_belongs_to_workspace()
-- Duas sobrecargas: text (stock_items, notifications) e uuid (colunas com FK)
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws_id IS NULL OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles WHERE id = auth.uid()
      )
$$;
```

## Alternativas consideradas

1. **Um projeto Supabase por campus** — não escala e impede dados compartilhados entre campi
2. **Um schema por campus** — migrações complexas e sem suporte a usuários multi-campus
3. **Filtro apenas na aplicação** — sem proteção no nível do banco

## Consequências

### Positivas

- Segurança no nível do banco (RLS) como barreira principal
- Suporte natural a usuários de vários campi
- Habilitação e desabilitação de aplicações por workspace
- Padrão consistente em todas as tabelas

### Negativas

- Políticas de RLS aumentam a complexidade das consultas
- Consultas sobre o array indexado `workspace_ids` podem ficar lentas em escala
- A exclusão de um workspace exige limpeza em cascata

## Relacionados

- `supabase/migrations/009_workspace_isolation.sql`
- `supabase/migrations/025_security_revoke_pg_sql.sql` — revoga `pg_sql()` de anon/authenticated
- `supabase/migrations/026_security_revoke_anon_stock_pcare.sql` — revoga anon de stock/pcare
- `supabase/migrations/027_rls_workspace_isolation.sql` — políticas de RLS por workspace
- `src/core/workspaces/store.ts`
- [Conceitos: Workspaces](../concepts/workspaces.md)
