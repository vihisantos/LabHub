const LAB_RULES = [
  { regex: /lab\s*0?\s*1/i, normalized: 'LAB01', display: 'Lab 01' },
  { regex: /lab\s*0?\s*2/i, normalized: 'LAB02', display: 'Lab 02' },
]

export function normalizeLabName(raw) {
  if (!raw) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  for (const rule of LAB_RULES) {
    if (rule.regex.test(s)) return rule.normalized
  }
  return null
}

export function getLabDisplayName(raw) {
  if (!raw) return ''
  const s = String(raw).replace(/\s+/g, ' ').trim()
  for (const rule of LAB_RULES) {
    if (rule.regex.test(s)) return rule.display
  }
  return raw
}
