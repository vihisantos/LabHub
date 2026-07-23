export interface HealthMetrics {
  totalAssets: number
  openTickets: number
  criticalTickets: number
  computersOnline: number
  pendingMaintenance: number
  lastSyncAt: string | null
  syncStatus: 'ok' | 'syncing' | 'error' | 'offline'
}
