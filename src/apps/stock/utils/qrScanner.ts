import type { StockItem } from '../types'

export interface QrCodeParseResult {
  section: string
  name: string
}

/**
 * Parse a QR code string into section and name.
 * Format: "section/name" (e.g. "maquinas/Notebook Dell")
 * If no "/" is found, the entire string is treated as the item name.
 */
export function parseQrCode(code: string): QrCodeParseResult {
  const idx = code.indexOf('/')
  if (idx >= 0) {
    return {
      section: code.slice(0, idx).trim(),
      name: code.slice(idx + 1).trim(),
    }
  }
  return { section: '', name: code.trim() }
}

/**
 * Find a stock item that matches the given QR code.
 * Searches by section + name (case-insensitive, exact name match).
 * If section is empty, matches any section.
 */
export function findStockItemByQrCode(
  items: StockItem[],
  code: string,
): StockItem | undefined {
  const { section, name } = parseQrCode(code)
  if (!name) return undefined

  const sectionLower = section.toLowerCase()
  const nameLower = name.toLowerCase()

  return items.find((item) => {
    const matchesSection = !sectionLower || item.section.toLowerCase() === sectionLower
    const matchesName = item.name.toLowerCase() === nameLower
    return matchesSection && matchesName
  })
}
