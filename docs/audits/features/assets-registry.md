# Asset Registry — LabHub

> Entidade global de ativos, independente de PCare/Estoque.
> Feature 3A — Fundação (migration 024).

---

## Visão Geral

O Asset Registry é a tabela global `public.assets` que representa ativos de TI de forma independente dos módulos existentes. Cada ativo pertence a um workspace e é isolado por RLS via `profiles.workspace_ids`.

```
┌─────────────────────────────────────────────────────────┐
│  public.assets (Supabase)                               │
│  Tabela global, RLS por workspace                       │
├─────────────────────────────────────────────────────────┤
│  global_assets (IndexedDB)                              │
│  Coleção local, sync com Supabase                       │
├─────────────────────────────────────────────────────────┤
│  core/assets/global-repository.ts                       │
│  CRUD + stats, zero imports de apps/*                   │
└─────────────────────────────────────────────────────────┘
```

---

## Modelo de Dados

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | PK, gerado automaticamente |
| `workspace_id` | UUID FK | Sim | Workspace ao qual o ativo pertence |
| `asset_tag` | TEXT | Não | Patrimônio (único por workspace quando não nulo) |
| `serial_number` | TEXT | Não | Número de série do fabricante |
| `equipment_type` | TEXT | Sim | Tipo: Desktop, Notebook, Monitor, etc. |
| `manufacturer` | TEXT | Sim | Fabricante |
| `model` | TEXT | Sim | Modelo |
| `name` | TEXT | Sim | Nome/descrição legível |
| `location_id` | UUID | Não | Placeholder para Location Registry (futuro) |
| `status` | TEXT | Sim | draft, active, maintenance, retired |
| `notes` | TEXT | Sim | Observações livres |
| `metadata` | JSONB | Não | Extensão por módulo (ver política abaixo) |
| `created_by` | UUID | Não | ID do usuário que criou |
| `created_at` | TIMESTAMPTZ | Sim | Timestamp de criação |
| `updated_at` | TIMESTAMPTZ | Sim | Timestamp de última atualização |

---

## Política de `metadata`

`metadata` é um campo JSONB extensível para dados específicos de um módulo.

**Regra:** Campos usados por mais de um módulo devem virar campos estruturais em uma feature futura. `metadata` não é um depósito genérico.

**Exemplo correto:** O módulo PCare pode armazenar dados técnicos em `metadata.technical` (processador, RAM, etc). Esses dados são específicos do PCare.

**Exemplo incorreto:** Armazenar `status` ou `equipment_type` em `metadata` — esses campos já existem como estruturais.

**Revisão periódica:** Quando um campo de `metadata` é usado por mais de um módulo, ele deve ser promovido a campo estrutural na tabela `public.assets`.

---

## Identificadores

- **`id` (UUID):** PK permanente. Usado internamente e no sync. Nunca muda.
- **`asset_tag` (patrimônio):** Identificador externo do ativo. Único por workspace (constraint UNIQUE parcial). Pode ser nulo se o ativo não tiver patrimônio.
- **`serial_number`:** Número de série do fabricante. Índice de busca, sem constraint de unicidade nesta fase.

O futuro QR Code apontará para o UUID (`id`), não para o `asset_tag`.

---

## Segurança

### RLS (Row Level Security)

```sql
USING (
  public.is_super_admin()
  OR workspace_id IN (
    SELECT unnest(workspace_ids)
    FROM public.profiles
    WHERE id = auth.uid()
  )
)
```

- **Super admins:** Veem todos os assets de todos os workspaces
- **Usuários comuns:** Veem apenas assets dos workspaces que pertencem (via `profiles.workspace_ids`)
- **Sync:** Usa o client autenticado (JWT do usuário), não service_role. RLS protege pull e push automaticamente
- **Defense in depth:** `workspaceStore.filter()` no frontend é segunda barreira

### workspace_id

- Auto-atribuído pelo repository no `create()` (via `workspaceStore.activeWorkspaceId`)
- Validado pelo RLS no banco — o backend é a autoridade final
- Se o frontend mentir sobre `workspace_id`, o RLS rejeita o INSERT

---

## Compatibilidade

| Módulo | Afetado? | Observação |
|--------|----------|------------|
| PCare | Não | `apps/pcare/services/assetService.ts` continua usando coleção `assets` (local-only) |
| Estoque | Não | `apps/stock/services/stockService.ts` inalterado |
| Chamados | Não | `apps/chamados/` inalterado |
| core/assets (legado) | Não | `core/assets/service.ts` (agregador) continua funcionando |

---

## Relação com Legado

```
┌─────────────────────────────────────────────────────────┐
│  Coleção "assets" (IndexedDB)                           │
│  → Usada por pcare/services/assetService.ts             │
│  → Tipo: Asset (pcare/types/asset.ts)                   │
│  → LOCAL_ONLY (sem sync remoto)                         │
│  → Conterá dados existentes do PCare                    │
├─────────────────────────────────────────────────────────┤
│  Coleção "global_assets" (IndexedDB)                    │
│  → Usada por core/assets/global-repository.ts           │
│  → Tipo: GlobalAsset (core/assets/global-types.ts)      │
│  → REMOTE (sync com public.assets)                      │
│  → Começa vazia (será populada manualmente ou futura    │
│    migração)                                            │
└─────────────────────────────────────────────────────────┘
```

**Nenhum dado legado é migrado nesta feature.** As duas coleções coexistem pacificamente.

---

## API

```typescript
import { globalAssetRepository } from '../core/assets/global-repository'

// Listar assets do workspace ativo
const assets = globalAssetRepository.getAll()

// Buscar por ID
const asset = globalAssetRepository.getById('uuid')

// Criar (workspace_id e created_by auto-atribuídos)
const novo = globalAssetRepository.create({
  name: 'Desktop Lab A',
  equipment_type: 'Desktop',
  manufacturer: 'Dell',
  model: 'OptiPlex 7090',
  asset_tag: 'TI-001',
  serial_number: 'SN12345',
  location_id: null,
  status: 'active',
  notes: '',
  metadata: {},
})

// Atualizar (updated_at auto-atualizado)
globalAssetRepository.update(novo.id, { name: 'Desktop Lab A - Atualizado' })

// Remover
globalAssetRepository.remove(novo.id)

// Buscar por patrimônio
const porTag = globalAssetRepository.getByAssetTag('TI-001')

// Buscar por serial
const porSerial = globalAssetRepository.getBySerial('SN12345')

// Estatísticas
const stats = globalAssetRepository.getStats()
```

---

## Planejamento Futuro

- **Location Registry:** Criar entidade `public.locations` e popular `location_id`
- **QR Code:** Gerar QR que aponta para o UUID do ativo
- **Migração de dados:** Migrar assets do PCare e Estoque para o Asset Registry
- **Promoção de metadata:** Campos usados por múltiplos módulos viram colunas estruturais
