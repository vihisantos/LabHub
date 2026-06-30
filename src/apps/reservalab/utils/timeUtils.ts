import type { ParsedHorario } from '../types'

export const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

export function getPeriodo(horario: string | null | undefined): string {
  if (!horario) return 'noite'
  const h = horario.toLowerCase()
  if (h.includes('man') || h.includes('07') || h.includes('08') || h.includes('09') || h.includes('10') || h.includes('11')) return 'manhã'
  if (h.includes('tard') || h.includes('12') || h.includes('13') || h.includes('14') || h.includes('15') || h.includes('16') || h.includes('17')) return 'tarde'
  return 'noite'
}

export function parseHorario(horario: string | null | undefined): ParsedHorario {
  if (!horario) return { inicio: null, fim: null }
  try {
    let h = horario.toString().trim()
    h = h.replace(/(\d)h(\d)/gi, '$1:$2').replace(/h/gi, '').trim()

    const match = h.match(/(\d{1,2}):?(\d{2})?\s*(?:às|as|até|ate|-|à|ateh|ate)\s*(\d{1,2}):?(\d{2})?/i)
    if (match) {
      const hi = parseInt(match[1])
      const mi = match[2] ? parseInt(match[2]) : 0
      const hf = match[3] ? parseInt(match[3]) : hi + 2
      const mf = match[4] ? parseInt(match[4]) : 0
      return { inicio: hi * 60 + mi, fim: hf * 60 + mf }
    }

    const onlyNum = h.match(/(\d{1,2})/)
    if (onlyNum) {
      const hora = parseInt(onlyNum[1])
      return { inicio: hora * 60, fim: (hora + 2) * 60 }
    }
  } catch { }
  return { inicio: null, fim: null }
}

export function isReservaAtiva(horario: string | null | undefined): boolean {
  const p = parseHorario(horario)
  if (p.inicio === null) return false
  const now = new Date()
  const agora = now.getHours() * 60 + now.getMinutes()
  return agora >= p.inicio - 5 && (p.fim === null || agora < p.fim)
}

export function isReservaEmBreve(horario: string | null | undefined): boolean {
  const p = parseHorario(horario)
  if (p.inicio === null) return false
  const now = new Date()
  const agora = now.getHours() * 60 + now.getMinutes()
  return agora >= p.inicio - 30 && agora < p.inicio - 5
}

export function isReservaEncerrada(horario: string | null | undefined): boolean {
  const p = parseHorario(horario)
  if (p.fim === null) return false
  const now = new Date()
  const agora = now.getHours() * 60 + now.getMinutes()
  return agora >= p.fim + 10
}
