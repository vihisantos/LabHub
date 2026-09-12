# Migrations do banco

> Como criar e gerenciar migrations no Supabase.

## Local das migrations

Todas as migrations ficam em `supabase/migrations/`:

```text
supabase/migrations/
├── 001_create_profiles.sql
├── 002_seed_admin.sql
├── ...
├── 024_global_asset_registry.sql
├── 025_security_revoke_pg_sql.sql
├── 026_security_revoke_anon_stock_pcare.sql
├── 027_rls_workspace_isolation.sql
└── supa/              # gerenciado pela CLI do Supabase
```

## Convenção de nomes

```text
NNN_descricao_em_snake_case.sql
```

Exemplos:

- `028_add_ticket_notes.sql`
- `029_create_location_registry.sql`

O índice das migrations aplicadas e o status de cada uma estão em `supabase/migrations/README.md`.

## Criando uma migration

1. **Escreva o SQL** em um arquivo novo, com o próximo número da sequência
2. **Teste no SQL Editor do Supabase** antes de versionar
3. **Inclua o rollback** em um comentário no topo

```sql
-- ============================================================
-- 025: Adiciona a coluna de anotações do chamado
--
-- Rollback: ALTER TABLE public.chamados_tickets DROP COLUMN IF EXISTS notes;
-- ============================================================

ALTER TABLE public.chamados_tickets
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
```

## Boas práticas

### Sempre use IF NOT EXISTS

```sql
-- Seguro para reexecução
CREATE TABLE IF NOT EXISTS public.my_table (...);
ALTER TABLE public.my_table ADD COLUMN IF NOT EXISTS my_col TEXT;

-- Falha na reexecução
CREATE TABLE public.my_table (...);
ALTER TABLE public.my_table ADD COLUMN my_col TEXT;
```

### Sempre inclua o rollback

```sql
-- Rollback: DROP TABLE IF EXISTS public.my_table;
```

### Políticas de RLS

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_table_select" ON public.my_table
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(workspace_id)
  );
-- Mesmo padrão para INSERT, UPDATE (com WITH CHECK) e DELETE
```

### Índices

```sql
CREATE INDEX IF NOT EXISTS idx_my_table_workspace
  ON public.my_table(workspace_id);
```

## Organização dos schemas

| Schema | Propósito |
|--------|-----------|
| `public` | Tabelas centrais: workspaces, profiles, assets, chamados, TV |
| `pcare` | Dados do PC Care: pcs, parts, maintenance, checklists |
| `stock` | Dados do Estoque: items, movements, kits, inventory, notifications |

## Testando uma migration

1. Execute no SQL Editor do Supabase
2. Confirme o resultado com consultas `SELECT`
3. Verifique o RLS com usuários de cargos diferentes
4. Teste pela aplicação (criar, ler, atualizar e excluir)

## Relacionados

- [Referência do banco](../reference/database.md)
- [Camada de dados](../platform/architecture/data-layer.md)
- [Operações: Recuperação](../operations/recovery.md)
