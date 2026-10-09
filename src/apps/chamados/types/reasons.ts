/**
 * Catálogo PREDEFINIDO de motivos de espera/indeferimento (issue #367).
 *
 * Espelha `CHAMADOS_STATUS_REASONS` do backend (`api/app.py`): o cliente envia
 * apenas o `reasonCode`; o rótulo exibido aqui é o mesmo que o backend resolve
 * e grava como `reasonLabel`. Texto livre NUNCA identifica o motivo — a
 * observação (`reasonNote`) é opcional e complementar.
 */

export type TicketReasonCode =
  | 'OUT_OF_SCOPE'
  | 'DUPLICATE'
  | 'NOT_IT_REQUEST'
  | 'INSTITUTIONAL_RESOURCE'
  | 'OTHER_DEPARTMENT'
  | 'INSUFFICIENT_INFORMATION'
  | 'WAITING_REQUESTER'
  | 'WAITING_EQUIPMENT'
  | 'WAITING_VENDOR'
  | 'WAITING_AUTHORIZATION'
  | 'WAITING_SCHEDULE'
  | 'OTHER'

export type ReasonOption = { code: TicketReasonCode; label: string }

export const INDEFERIMENTO_REASONS: readonly ReasonOption[] = [
  { code: 'OUT_OF_SCOPE', label: 'Fora do escopo de atendimento da TI' },
  { code: 'DUPLICATE', label: 'Solicitação duplicada' },
  { code: 'NOT_IT_REQUEST', label: 'Solicitação não caracteriza incidente/requisição de TI' },
  { code: 'INSTITUTIONAL_RESOURCE', label: 'Equipamento ou recurso não pertence à instituição' },
  { code: 'OTHER_DEPARTMENT', label: 'Solicitação deve ser realizada por outro setor' },
  { code: 'INSUFFICIENT_INFORMATION', label: 'Informações insuficientes para atendimento' },
  { code: 'OTHER', label: 'Outro motivo' },
]

export const EM_ESPERA_REASONS: readonly ReasonOption[] = [
  { code: 'WAITING_REQUESTER', label: 'Aguardando retorno do solicitante' },
  { code: 'WAITING_EQUIPMENT', label: 'Aguardando equipamento/peça' },
  { code: 'WAITING_VENDOR', label: 'Aguardando terceiro/fornecedor' },
  { code: 'WAITING_AUTHORIZATION', label: 'Aguardando autorização' },
  { code: 'WAITING_SCHEDULE', label: 'Aguardando agendamento' },
  { code: 'OTHER', label: 'Outro motivo' },
]

/** Motivo é OBRIGATÓRIO nestes status (mesma regra do backend). */
export const REASON_STATUS_OPTIONS: Record<'em_espera' | 'indeferido', readonly ReasonOption[]> = {
  em_espera: EM_ESPERA_REASONS,
  indeferido: INDEFERIMENTO_REASONS,
}

/** Rótulo do motivo a partir do código gravado (backend é a fonte). */
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return ''
  for (const options of Object.values(REASON_STATUS_OPTIONS)) {
    const found = options.find((option) => option.code === code)
    if (found) return found.label
  }
  return code
}
