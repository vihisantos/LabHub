import type { UserRole } from '../auth/types'

export type NotificationType = 'ticket' | 'asset' | 'maintenance' | 'system' | 'sync' | 'approval'
export type NotificationSeverity = 'info' | 'warning' | 'critical'
export type NotificationAudience = 'role' | 'workspace' | 'user'

export interface AppNotification {
  id: string
  title: string
  body: string
  type: NotificationType
  severity: NotificationSeverity
  module: string
  actionUrl?: string
  read: boolean
  createdAt: string
  /** Segmentação de destino — quem recebe essa notificação */
  audience?: NotificationAudience
  /** audience === 'role' — cargo alvo */
  targetRole?: UserRole
  /** audience === 'role' — apenas admin absoluto */
  targetSuperAdmin?: boolean
  /** audience === 'workspace' — ambiente da ocorrência */
  workspace_id?: string
  /** audience === 'user' — usuário específico */
  targetUserId?: string
}

export type NotificationFormData = Omit<AppNotification, 'id' | 'read' | 'createdAt'>
