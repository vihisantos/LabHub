import type { Asset } from '../types/asset'
import { emptyNetworkInfo, emptyTechnicalInfo } from '../types/asset'
import type { PC } from '../types/pc'
import { getCol, setCol } from '../../../lib/db'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<Asset>('assets')

function fromLegacyPC(pc: PC): Asset {
  return {
    id: pc.id,
    assetTag: pc.assetTag || pc.pcNumber,
    equipmentType: 'Desktop',
    manufacturer: '', model: '', serialNumber: '',
    location: pc.roomLocation || pc.labName,
    status: pc.restorationStatus === 'in_progress' ? 'maintenance' : 'in_use',
    observations: pc.observations || '',
    technical: {
      ...emptyTechnicalInfo(),
      operatingSystem: pc.config?.osType === 'macos' ? 'macos' : pc.config?.osType === 'linux' ? 'linux' : pc.config?.osType ? 'windows' : '',
      processor: pc.specs?.cpu || '', memory: pc.specs?.ram || '', storageCapacity: pc.specs?.storage || '',
    },
    network: { ...emptyNetworkInfo(), domain: pc.config?.domain || '' },
    parentAssetId: null, childAssetIds: [], photos: pc.photos || [],
    createdAt: pc.createdAt, updatedAt: pc.updatedAt,
  }
}

/** One-way, id-preserving migration. Legacy PCs remain intact for existing maintenance workflows. */
function migrateLegacyPCs(): void {
  if (getCol<Asset>('assets').length) return
  const legacy = getCol<PC>('pcs')
  if (legacy.length) setCol('assets', legacy.map(fromLegacyPC))
}

export const assetService = {
  getAll: () => { migrateLegacyPCs(); return service.getAll() },
  getById: (id: string) => { migrateLegacyPCs(); return service.getById(id) },
  create: (data: Omit<Asset, 'id'>) => service.create(data),
  update: (id: string, data: Partial<Asset>) => service.update(id, data),
  query: (predicate: (asset: Asset) => boolean) => { migrateLegacyPCs(); return service.query(predicate) },
}
