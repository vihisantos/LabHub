const LAB_RULES = [
  { regex: /lab\s*0?\s*1/i, normalized: 'LAB01' as const, display: 'Lab 01' },
  { regex: /lab\s*0?\s*2/i, normalized: 'LAB02' as const, display: 'Lab 02' },
]

function matchLab(raw: string): string[] {
  const found: string[] = []
  const s = String(raw).replace(/\s+/g, ' ').trim()
  // Divide "Lab 01 e 02" → ["Lab 01", "02"] pra detectar ambos
  const parts = s.split(/\s*(?:e|,|&|\+|\/| ou | - )\s*/i)
  for (const part of parts) {
    const p = part.trim()
    for (const rule of LAB_RULES) {
      if (rule.regex.test(p) || /^0?\d$/.test(p)) {
        if (!found.includes(rule.normalized)) found.push(rule.normalized)
      }
    }
  }
  return found
}

export function normalizeLabName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const found = matchLab(raw)
  return found.length > 0 ? found[0] : null
}

export function getLabDisplayName(raw: string | null | undefined): string {
  if (!raw) return ''
  const found = matchLab(raw)
  if (found.length > 0) return found.map((n) => LAB_RULES.find((r) => r.normalized === n)?.display || n).join(' e ')
  return raw
}
