import { useMemo } from 'react'
import { assetService } from '../../../core/assets/service'
import type { AssetRecord } from '../../../core/assets/types'

export type RoomAsset = AssetRecord

const CATEGORY_MAP: Record<string, string> = {
  Desktop: 'Equipamentos',
  Notebook: 'Equipamentos',
  Monitor: 'Multimídia',
  Projetor: 'Multimídia',
  TV: 'Multimídia',
  Impressora: 'Equipamentos',
  Mouse: 'Periféricos',
  Teclado: 'Periféricos',
  Webcam: 'Periféricos',
  'Caixa de Som': 'Áudio',
  Headset: 'Áudio',
  'Access Point': 'Rede',
  Switch: 'Rede',
  'Cabo HDMI': 'Cabos',
  'Cabo VGA': 'Cabos',
  'Cabo USB': 'Cabos',
  'Cabo Rede': 'Cabos',
}

export function useRoomAssets(roomName: string) {
  // Fluxo público (professor): busca equipamentos sem filtro de workspace,
  // para a sala aparecer mesmo com resíduo de sessão de outro campus.
  // Fallback: se core/assets não estiver disponível (ex: workspace sem PCare/Estoque),
  // retorna vazio sem quebrar o módulo Chamados.
  const assets = useMemo<RoomAsset[]>(() => {
    if (!roomName) return []
    try {
      return assetService.getByRoomUnfiltered(roomName)
    } catch {
      return []
    }
  }, [roomName])

  const grouped = useMemo(() => {
    const groups: Record<string, RoomAsset[]> = {}
    for (const asset of assets) {
      const category = CATEGORY_MAP[asset.subcategory] || 'Outros'
      if (!groups[category]) groups[category] = []
      groups[category].push(asset)
    }
    return groups
  }, [assets])

  return { assets, grouped }
}
