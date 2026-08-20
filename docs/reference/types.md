# Types Reference

> Key TypeScript types used across LabHub.

## Core Types

### Ticket
```typescript
type TicketStatus = 'aberto' | 'a_caminho' | 'em_atendimento' | 'resolvido' | 'fechado'
type TicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente'
```

### Workspace
```typescript
interface Workspace {
  id: string
  name: string
  slug: string
  location: string
  spreadsheet_url: string | null
  lab_count: number
  color: string | null
  disabled_apps: string[]
  created_at: string
  updated_at: string
}
```

### Profile
```typescript
interface Profile {
  id: string
  email: string
  name: string
  role: 'viewer' | 'technician' | 'admin'
  status: 'active' | 'pending'
  is_super_admin: boolean
  workspace_ids: string[]
  app_access: Record<string, 'full' | 'read' | 'none'>
  notify_settings: Record<string, boolean>
  avatar: string
  banner: string
}
```

### Asset
```typescript
type AssetStatus = 'draft' | 'active' | 'maintenance' | 'retired'

interface Asset {
  id: string
  workspace_id: string
  asset_tag: string | null
  serial_number: string | null
  equipment_type: string
  manufacturer: string
  model: string
  name: string
  location_id: string | null
  status: AssetStatus
  notes: string
  metadata: Record<string, any>
  created_by: string | null
  created_at: string
  updated_at: string
}
```

## Module Types

### PCare
```typescript
type CleaningStatus = 'pending' | 'in_progress' | 'done'
type RestorationStatus = 'pending' | 'in_progress' | 'done'
type OSType = 'windows10' | 'windows11' | 'linux' | 'macos' | ''
```

### Stock
```typescript
type StockItemStatus = 'ativo' | 'em_conserto' | 'descartado' | 'emprestado'
type MovementType = 'entrada' | 'saida' | 'emprestimo' | 'devolucao' | 'transferencia'
type KitStatus = 'ok' | 'incompleto' | 'nao_conferido'
```

### TV
```typescript
type ContentType = 'video' | 'music' | 'events'
type AnnouncementSeverity = 'info' | 'warning' | 'danger'
```

## Service Types

### Sync Service
```typescript
interface SyncService<T extends { id: string }> {
  getAll(): T[]
  getById(id: string): T | undefined
  create(data: Omit<T, 'id'>): T
  update(id: string, data: Partial<T>): T | undefined
  remove(id: string): boolean
  query(predicate: (item: T) => boolean): T[]
}
```

### Sync Result
```typescript
interface SyncResult {
  synced: number
  failed: string[]
}
```

### Sync Log
```typescript
interface SyncLogEntry {
  collection: string
  itemCount: number
  status: 'ok' | 'simulated' | 'error'
  at: string
}
```

## Related

- [Reference: Database](database.md)
- [Concepts: Glossary](../glossary.md)
