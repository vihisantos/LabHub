import type { PartUsage } from '../types/partUsage'
import { createSyncService } from '../../../lib/sync'

const store = createSyncService<PartUsage>('part_usage')

/**
 * Leitura de consumo de peças.
 *
 * F2-D-N2: `log`/`remove` foram REMOVIDOS. Eles guardavam escrita com
 * `permissionService.requireWrite('pc-care')`, gate local que decidia por
 * `Role.appAccess` + `profiles.app_access`. A produção só consome leitura
 * (`PartsList`, `StockConsolidado`), então não havia Action nova a criar — a
 * escrita de consumo de peças não existe como fluxo no produto.
 */
export const partUsageService = {
  getAll: () => store.getAll(),

  getByPC: (pcId: string) =>
    store.query((u) => u.pcId === pcId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),

  getByPartId: (partId: string) =>
    store.query((u) => u.partId === partId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
}
