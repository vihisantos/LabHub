/** Converte 'DD/MM/YYYY' em 'YYYY-MM-DD' (formato aceito por date/date[] do RPC). */
export function brDateToIso(value: string): string {
  const parts = value.split('/')
  if (parts.length !== 3) return value
  const [dia, mes, ano] = parts
  if (dia.length !== 2 || mes.length !== 2 || ano.length !== 4) return value
  return `${ano}-${mes}-${dia}`
}

/** Converte 'YYYY-MM-DD' em 'DD/MM/YYYY' para exibição. */
export function isoToBrDate(value: string): string {
  const parts = value.split('-')
  if (parts.length !== 3) return value
  const [ano, mes, dia] = parts
  if (ano.length !== 4 || mes.length !== 2 || dia.length !== 2) return value
  return `${dia}/${mes}/${ano}`
}

/** Minutos desde meia-noite → 'HH:MM' (ou null se inválido). */
export function minutesToTime(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  const h = Math.floor(value / 60)
  const m = value % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 'HH:MM' → minutos desde meia-noite (ou null se inválido). */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const parts = value.split(':')
  if (parts.length !== 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/**
 * Mapeia erros do RPC tv_reserve_event_upsert para mensagens amigáveis,
 * sempre sem vazar detalhes internos do banco/PostgREST.
 */
export function mapReserveError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  if (message.includes('TV_WORKSPACE_FULL_REQUIRED')) {
    return 'Você precisa de acesso completo (full) ao app TV deste campus para criar eventos.'
  }
  if (message.includes('TV_DEVICE_WRITE_FORBIDDEN')) {
    return 'Esta operação não é permitida para a TV.'
  }
  if (message.includes('RESERVATION_DATE_REQUIRED')) {
    return 'Informe a data da reserva.'
  }
  if (message.includes('INVALID_RESERVATION_TIMES')) {
    return 'O horário precisa de início e fim juntos.'
  }
  if (message.includes('RESERVATION_TIME_AFTER_END')) {
    return 'O horário final não pode ser menor que o inicial.'
  }
  if (message.includes('ADDITIONAL_DATE_BEFORE_RESERVATION')) {
    return 'As datas adicionais não podem ser anteriores à data da reserva.'
  }
  if (message.includes('NULL_DEVICE_ID')) {
    return 'Selecione ao menos uma TV.'
  }
  if (message.includes('DEVICE_WORKSPACE_MISMATCH')) {
    return 'Todas as TVs devem pertencer a este campus.'
  }
  if (message.includes('EVENT_NOT_FOUND')) {
    return 'O evento da TV não foi encontrado.'
  }
  if (code === '42501') {
    return 'Você precisa de permissão para criar eventos na TV deste campus.'
  }
  return 'Não foi possível criar o evento na TV. Tente novamente.'
}