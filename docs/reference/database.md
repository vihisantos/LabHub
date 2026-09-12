# Referência do banco de dados

> Schemas, tabelas, políticas de RLS e migrations de segurança do Supabase.

Para o modelo completo com diagrama entidade-relacionamento, consulte o snapshot datado em [Auditoria: banco de dados — agosto de 2026](../audits/architecture/database-audit-2026-08.md).

## Schemas

| Schema | Propósito | Acesso |
|--------|-----------|--------|
| `public` | Tabelas centrais: workspaces, profiles, ativos, chamados, TV, RBAC | RLS + `service_role` |
| `pcare` | Dados do PC Care: pcs, parts, maintenance | Engine de sync |
| `stock` | Dados do Estoque: items, movements, kits, inventory | Engine de sync |

## Tabelas principais

### public.workspaces

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Gerado automaticamente |
| `name` | text | Nome do campus |
| `slug` | text (UK) | Identificador amigável para URL |
| `location` | text | Localização física |
| `spreadsheet_url` | text | Link da planilha do ReservaLab |
| `lab_count` | smallint | Quantidade de laboratórios (padrão 2) |
| `color` | text | Cor de exibição |
| `disabled_apps` | jsonb | Aplicações desabilitadas no campus |
| `created_at` / `updated_at` | timestamptz | Datas de criação e atualização |

### public.profiles

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Igual a `auth.users.id` |
| `email` | text | E-mail do usuário |
| `name` | text | Nome de exibição |
| `role` | text | Cargo legado: `viewer`, `technician`, `admin` |
| `status` | text | `active` ou `pending` |
| `is_super_admin` | boolean | Capacidade de plataforma |
| `workspace_ids` | uuid[] | Workspaces do usuário no modelo legado |
| `app_access` | jsonb | Overrides de acesso por aplicação (legado) |
| `notify_settings` | jsonb | Preferências de notificação |
| `avatar` / `banner` | text | Imagens de perfil |
| `created_at` / `updated_at` | timestamptz | Datas de criação e atualização |

### public.assets (Registro Global de Ativos)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Gerado automaticamente |
| `workspace_id` | uuid (FK) | Campus proprietário |
| `asset_tag` | text | Patrimônio, único por workspace |
| `serial_number` | text | Número de série do fabricante |
| `equipment_type` | text | Desktop, Notebook etc. |
| `manufacturer` / `model` / `name` | text | Identificação do equipamento |
| `location_id` | uuid | Reservado para o futuro registro de localizações |
| `status` | text | `draft`, `active`, `maintenance`, `retired` |
| `notes` | text | Observações livres |
| `metadata` | jsonb | Extensões por aplicação |
| `created_at` / `updated_at` | timestamptz | Datas de criação e atualização |

### public.chamados_tickets

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Gerado automaticamente |
| `workspace_id` | uuid (FK) | Campus |
| `roomName` | text | Local do problema |
| `ticketNumber` | int | Sequencial por workspace |
| `status` | text | `aberto`, `a_caminho`, `em_atendimento`, `resolvido`, `fechado` |
| `priority` | text | `baixa`, `normal`, `alta`, `urgente` |
| `reportedBy` | text | Nome de quem relatou |
| `assignedTo` | text | Técnico responsável |
| `problemCategory` | text | Categoria do problema |
| `problemDescription` | text | Descrição |
| `feedbackRating` | int | Avaliação de 1 a 5, com constraint `chk_feedback_rating` |
| `feedbackComment` | text | Comentário da avaliação |
| `feedbackAt` | timestamptz | Data da avaliação |
| `archived` | boolean | Marca de arquivamento |
| `createdAt` / `updatedAt` | timestamptz | Datas de criação e atualização |

A tabela tem `REVOKE ALL FROM anon, authenticated`: somente a API Flask (`service_role`) acessa.

### public.tablet_reservations

Reservas de tablet do ReservaLab: `id` (uuid), `sala`, `quantidade_tablets`, `professor`, `horario_inicio`, `horario_fim`, `finalidade`, `reservado_por`, `status`, `workspace_id`.

### public.workspace_app_settings

Configurações de uma aplicação por workspace: `workspace_id`, `app_id`, `settings` (jsonb) e `updated_at`. Criada na migration 031 e acessada diretamente pelo frontend via RLS.

### Tabelas do RBAC 2.0

| Tabela | Conteúdo |
|--------|----------|
| `roles` | Roles do sistema (`tec`, `vis`, `est`, `opv`, `adm`) e roles por workspace |
| `role_permissions` | Concessões de Action por role |
| `memberships` | Relação perfil × workspace, com `role`, `status` e `managed_by` |
| `membership_overrides` | Ajustes pontuais de permissão por membership |
| `rbac_audit_logs` | Registro append-only das decisões de autorização |

Criadas na migration 036.

### Tabelas da TV (schema `public`)

`tv_events`, `tv_playlists`, `tv_music_queues`, `tv_music_tracks`, `tv_announcements`, `tv_galleries`, `tv_gallery_photos`, `tv_calendar_cache`, `tv_urgent_announcements`, `tv_devices`, `tv_activation_codes`, `tv_music_requests`.

### Tabelas de backup

`app_data_backups` guarda os backups gerados antes do expurgo de dados de uma aplicação por workspace, com data de expiração.

### Schema pcare

`pcs`, `parts`, `part_usage`, `maintenance`, `checklist_templates`, `pc_checklists`, `action_logs`.

### Schema stock

`stock_items`, `stock_movements`, `stock_kits`, `stock_maintenance`, `stock_inventory_cycles`, `stock_inventory_counts`, `notifications`.

## Políticas de RLS

As tabelas de `pcare` e `stock` usam RLS por workspace, com políticas por operação:

```sql
-- Função auxiliar (migration 027)
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws_id IS NULL OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles WHERE id = auth.uid()
      )
$$;
-- Também existe a sobrecarga uuid, para colunas workspace_id com FK

-- Padrão por tabela:
CREATE POLICY "{table}_select" ON schema.table FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));
-- Mesmo padrão para INSERT, UPDATE (com WITH CHECK) e DELETE
```

Exceções:

- `chamados_tickets` tem `REVOKE ALL FROM anon, authenticated` — apenas `service_role`
- A função `pg_sql()` tem `REVOKE` para `anon`, `authenticated` e `PUBLIC` (migration 025)

## Migrations de segurança

| Migration | Descrição |
|-----------|-----------|
| 025 | Revoga `pg_sql()` de anon, authenticated e PUBLIC |
| 026 | Revoga anon dos schemas `stock` e `pcare`; move a criação de notificações para um trigger |
| 027 | Substitui políticas permissivas por políticas escopadas por workspace e cria `user_belongs_to_workspace()` |
| 029 | Remove policies permissivas legadas que a 027 não cobriu |
| 034 | Remove 14 policies legadas que burlavam o isolamento |
| 036 | Cria o schema do RBAC 2.0 (roles, permissões, memberships, overrides, auditoria) |
| 044 | Hardening das políticas de RLS de `profiles` e `workspaces` |

O índice completo e o status de aplicação de cada migration estão em `supabase/migrations/README.md`.

## Relacionados

- [Camada de dados](../platform/architecture/data-layer.md)
- [Migrations do banco](../guides/database-migrations.md)
- [Autorização](../platform/security/authorization.md)
- [Auditoria: banco de dados — agosto de 2026](../audits/architecture/database-audit-2026-08.md)
