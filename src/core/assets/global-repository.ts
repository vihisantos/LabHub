import { createSyncService } from '../../lib/sync'
import { authService } from '../auth/service'
import { workspaceStore } from '../workspaces/store'
import type { GlobalAsset, GlobalAssetCreateData, GlobalAssetStats, GlobalAssetStatus } from './global-types'

const service = createSyncService<GlobalAsset>('global_assets')

function createAsset(data: GlobalAssetCreateData): GlobalAsset {
  const user = authService.getCurrentUser()
  return service.create({
    ...data,
    workspace_id: workspaceStore.activeWorkspaceId ?? '',
    created_by: user?.id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Omit<GlobalAsset, 'id'>)
}

function updateAsset(id: string, data: Partial<GlobalAsset>): GlobalAsset | undefined {
  return service.update(id, {
    ...data,
    updated_at: new Date().toISOString(),
  })
}

function getStats(): GlobalAssetStats {
  const all = service.getAll()
  const byStatus = {} as Record<GlobalAssetStatus, number>
  const byType = {} as Record<string, number>

  for (const asset of all) {
    byStatus[asset.status] = (byStatus[asset.status] || 0) + 1
    byType[asset.equipment_type] = (byType[asset.equipment_type] || 0) + 1
  }

  return {
    total: all.length,
    byStatus,
    byType,
  }
}

export const globalAssetRepository = {
  getAll: () => service.getAll(),
  getById: (id: string) => service.getById(id),
  create: createAsset,
  update: updateAsset,
  remove: (id: string) => service.remove(id),
  query: (predicate: (item: GlobalAsset) => boolean) => service.query(predicate),
  getByAssetTag: (tag: string) => service.query((a) => a.asset_tag === tag),
  getBySerial: (serial: string) => service.query((a) => a.serial_number === serial),
  getStats,
}
