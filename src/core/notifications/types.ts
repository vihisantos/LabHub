export type NotificationType = 'ticket' | 'asset' | 'maintenance' | 'system' | 'sync'
export type NotificationSeverity = 'info' | 'warning' | 'critical'

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
}

export type NotificationFormData = Omit<AppNotification, 'id' | 'read' | 'createdAt'>
