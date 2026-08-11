import { pcService } from '../../pcare/services/pcService'
import type { StockItem } from '../types'

export interface ActivateItemDeps {
  updateItem: (id: string, patch: Partial<StockItem>) => void
}

/**
 * Ativa um item de estoque como PC no PC-Care: cria o PC, vincula o item ao
 * PC (linkedPcId/linkedPcLabel) e retorna o id do PC criado.
 *
 * A dependência updateItem é injetada (padrão DI do createMany) para permitir
 * que o chamador atualize o estado local (hook) ou o serviço diretamente.
 */
export function activateItemAsPC(item: StockItem, { updateItem }: ActivateItemDeps): string {
  const now = new Date().toISOString()
  const pc = pcService.create({
    labName: item.room || 'Laboratório',
    pcNumber: item.serialNumber || item.name,
    assetTag: item.serialNumber || '',
    roomLocation: item.room || '',
    specs: { cpu: '', ram: '', storage: '' },
    config: { osType: '', osVersion: '', osEdition: '', pcType: '', domain: '' },
    cleaningStatus: 'pending',
    restorationStatus: 'pending',
    softwareInstalled: [],
    partsReplaced: [],
    observations: item.notes || '',
    photos: [],
    lastIntervention: null,
    createdAt: now,
    updatedAt: now,
  })
  updateItem(item.id, {
    linkedPcId: pc.id,
    linkedPcLabel: `${pc.labName} — ${pc.pcNumber}`,
  })
  return pc.id
}
