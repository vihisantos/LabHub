import type { StockItemFormData } from '../types'

/**
 * Remove duplicatas por Nº de série, mantendo o primeiro registro.
 * Itens sem Nº de série são sempre mantidos (não há como identificá-los
 * de forma segura — ex.: carregadores de notebook ou CSV sem série).
 * Aplicado a TODOS os fluxos de importação em lote.
 */
export function dedupeBySerial(items: StockItemFormData[]): StockItemFormData[] {
  const seen = new Set<string>()
  const result: StockItemFormData[] = []
  for (const item of items) {
    // Sem Nº de série não há como identificar duplicata (ex.: carregadores
    // de notebook sem série, ou CSV com nomes repetidos) → sempre manter.
    const key = item.serialNumber.trim().toLowerCase()
    if (!key) {
      result.push(item)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export interface CreateManyDeps {
  create: (data: StockItemFormData) => void
  reload?: () => void
}

/**
 * Núcleo único de importação em lote, compartilhado por todos os fluxos
 * (lote, notebooks CSV e importação genérica): dedupe por série, criação
 * dos itens e reload opcional. Retorna quantos itens foram criados.
 *
 * As dependências (create/reload) são injetadas para permitir testes
 * isolados e reuso fora do StockSection.
 */
export function createMany(items: StockItemFormData[], { create, reload }: CreateManyDeps): number {
  const clean = dedupeBySerial(items)
  for (const data of clean) create(data)
  reload?.()
  return clean.length
}
