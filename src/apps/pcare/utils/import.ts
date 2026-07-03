import * as XLSX from 'xlsx'
import type { PC, Part, OsType, OsEdition, PcTypeLabel } from '../types'
import { PC_TYPE_DOMAIN } from '../types'

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

const osTypeMap: Record<string, OsType> = {
  'windows 10': 'windows10',
  'windows10': 'windows10',
  'windows 11': 'windows11',
  'windows11': 'windows11',
  'linux': 'linux',
  'macos': 'macos',
  'mac os': 'macos',
}

const osEditionMap: Record<string, OsEdition> = {
  'enterprise': 'enterprise',
  'education': 'education',
}

const pcTypeMap: Record<string, PcTypeLabel> = {
  'academico': 'academico',
  'acadêmico': 'academico',
  'acad': 'academico',
  'administrativo': 'administrativo',
  'adm': 'administrativo',
}

export function mapPcRow(headers: string[], row: string[]): Omit<PC, 'id' | 'createdAt' | 'updatedAt'> {
  const map: Record<string, string> = {}
  headers.forEach((h, i) => { map[h.trim()] = (row[i] || '').trim() })

  const statusLabels: Record<string, 'pending' | 'in_progress' | 'done'> = {
    'pendente': 'pending',
    'em andamento': 'in_progress',
    'concluído': 'done',
  }

  const pcType = pcTypeMap[map['Tipo']?.toLowerCase()] || ''

  return {
    labName: map['Laboratório'] || '',
    pcNumber: map['PC'] || '',
    assetTag: map['Patrimônio'] || '',
    roomLocation: map['Localização'] || '',
    specs: {
      cpu: map['CPU'] || '',
      ram: map['RAM'] || '',
      storage: map['Armazenamento'] || '',
    },
    config: {
      osType: osTypeMap[map['Sistema Operacional']?.toLowerCase()] || '',
      osVersion: map['Versão'] || '',
      osEdition: osEditionMap[map['Edição']?.toLowerCase()] || '',
      pcType: pcType,
      domain: pcType ? PC_TYPE_DOMAIN[pcType] : (map['Domínio'] || ''),
    },
    cleaningStatus: statusLabels[map['Limpeza']?.toLowerCase()] || 'pending',
    restorationStatus: statusLabels[map['Restauração']?.toLowerCase()] || 'pending',
    softwareInstalled: map['Softwares'] ? map['Softwares'].split(';').map((s) => s.trim()).filter(Boolean) : [],
    partsReplaced: [],
    observations: map['Observações'] || '',
    photos: [],
    lastIntervention: null,
  }
}

export function mapPartRow(headers: string[], row: string[]): Omit<Part, 'id' | 'createdAt' | 'updatedAt'> {
  const map: Record<string, string> = {}
  headers.forEach((h, i) => { map[h.trim()] = (row[i] || '').trim() })
  return {
    name: map['Nome'] || '',
    category: map['Categoria'] || '',
    quantity: Number(map['Quantidade']) || 0,
    minQuantity: Number(map['Qtd. Mínima']) || 0,
    serialNumber: map['N Série'] || undefined,
    notes: map['Observações'] || undefined,
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
