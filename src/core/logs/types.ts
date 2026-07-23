export type LogAction = 'created' | 'updated' | 'deleted' | 'status_changed' | 'viewed' | 'exported'

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: LogAction
  entity: string
  entityId: string
  entityLabel: string
  details?: Record<string, any>
  timestamp: string
}

export type AuditLogFormData = Omit<AuditLog, 'id' | 'timestamp'>
