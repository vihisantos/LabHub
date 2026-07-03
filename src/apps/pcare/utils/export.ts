import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PC, Part, OsType, OsEdition, PcTypeLabel } from '../types'
import { OS_TYPE_LABELS, OS_EDITION_LABELS, PC_TYPE_LABELS } from '../types'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCSV(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

export function exportXLSX(headers: string[], rows: string[][], filename: string, sheetName = 'Dados') {
  const data = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportPDF(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(title, 14, 20)
  doc.setFontSize(8)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 34,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.save(`${filename}.pdf`)
}

export function pcToRows(pcs: PC[]): { headers: string[]; rows: string[][] } {
  const headers = [
    'Laboratório', 'PC', 'Localização', 'CPU', 'RAM',
    'Armazenamento', 'Sistema Operacional', 'Versão', 'Edição',
    'Tipo', 'Domínio', 'Limpeza', 'Restauração',
    'Softwares', 'Peças Trocadas', 'Observações',
  ]

  const rows = pcs.map((pc) => [
    pc.labName,
    pc.pcNumber,
    pc.roomLocation,
    pc.specs.cpu,
    pc.specs.ram,
    pc.specs.storage,
    pc.config?.osType ? (OS_TYPE_LABELS[pc.config.osType as OsType] || pc.config.osType) : '',
    pc.config?.osVersion || '',
    pc.config?.osEdition ? (OS_EDITION_LABELS[pc.config.osEdition as OsEdition] || pc.config.osEdition) : '',
    pc.config?.pcType ? (PC_TYPE_LABELS[pc.config.pcType as PcTypeLabel] || pc.config.pcType) : '',
    pc.config?.domain || '',
    pc.cleaningStatus === 'done' ? 'Concluído' : pc.cleaningStatus === 'in_progress' ? 'Em andamento' : 'Pendente',
    pc.restorationStatus === 'done' ? 'Concluído' : pc.restorationStatus === 'in_progress' ? 'Em andamento' : 'Pendente',
    pc.softwareInstalled.join('; '),
    pc.partsReplaced.map((p) => `${p.partName} (${p.quantity}x)`).join('; '),
    pc.observations,
  ])

  return { headers, rows }
}

export function partToRows(parts: Part[]): { headers: string[]; rows: string[][] } {
  const headers = ['Nome', 'Categoria', 'Quantidade', 'Qtd. Mínima', 'N Série', 'Observações']

  const rows = parts.map((part) => [
    part.name,
    part.category,
    String(part.quantity),
    String(part.minQuantity),
    part.serialNumber || '',
    part.notes || '',
  ])

  return { headers, rows }
}
