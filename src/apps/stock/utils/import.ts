import * as XLSX from 'xlsx'
import type { StockItem, StockSection, StockItemStatus } from '../types'
import { stockSections } from '../types'

export interface ParseResult {
  headers: string[]
  rows: string[][]
  sheetName: string
}

export function parseFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const name = wb.SheetNames[0]
        const ws = wb.Sheets[name]
        const json = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
        if (json.length < 2) {
          reject(new Error('Arquivo vazio ou sem dados'))
          return
        }
        const headers = json[0] as string[]
        const rows = json.slice(1) as string[][]
        resolve({ headers, rows, sheetName: name })
      } catch {
        reject(new Error('Erro ao ler o arquivo'))
      }
    }
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'))
    reader.readAsArrayBuffer(file)
  })
}

const statusMap: Record<string, StockItemStatus> = {
  'ativo': 'ativo',
  'em conserto': 'em_conserto',
  'emprestado': 'emprestado',
  'descartado': 'descartado',
}

const sectionLabelToValue: Record<string, StockSection> = {}
for (const s of stockSections) {
  sectionLabelToValue[s.label.toLowerCase()] = s.value
}

export function mapStockRow(headers: string[], row: string[]): Omit<StockItem, 'id' | 'createdAt' | 'updatedAt'> {
  const map: Record<string, string> = {}
  headers.forEach((h, i) => { map[h.trim()] = (row[i] || '').trim() })

  const sectionLabel = map['Seção']?.toLowerCase() || ''
  const section = sectionLabelToValue[sectionLabel] || 'outros'

  const statusLabel = map['Status']?.toLowerCase() || ''
  const status = statusMap[statusLabel] || 'ativo'

  return {
    name: map['Nome'] || '',
    section,
    subcategory: map['Subcategoria'] || '',
    serialNumber: map['Nº Série'] || '',
    room: map['Sala'] || '',
    status,
    condition: map['Condição'] || 'Bom',
    notes: map['Observações'] || '',
    cableType: map['Tipo Cabo'] || undefined,
    cableLength: map['Comprimento'] || undefined,
    connectorType: map['Conectores'] || undefined,
    outletCount: map['Tomadas'] ? Number(map['Tomadas']) || undefined : undefined,
    linkedPcId: undefined,
    linkedPcLabel: undefined,
  }
}

export function validateRows(rows: string[][], minCols: number): string | null {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length < minCols) {
      return `Linha ${i + 2}: número insuficiente de colunas (${rows[i].length}, esperado ${minCols})`
    }
  }
  return null
}
