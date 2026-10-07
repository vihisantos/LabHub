import type { TicketStatus } from '../types'

export const SOLICITANTE_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Chamado recebido',
  a_caminho: 'TÚcnico a caminho',
  em_atendimento: 'Em atendimento',
  resolvido: 'Chamado resolvido',
  fechado: 'Atendimento finalizado',
}

export const SOLICITANTE_STATUS_MESSAGES: Record<TicketStatus, string> = {
  aberto: 'Seu chamado foi registrado e estß aguardando atendimento da equipe.',
  a_caminho: 'Um tÚcnico estß a caminho do local informado.',
  em_atendimento: 'A equipe estß trabalhando neste chamado.',
  resolvido: 'Seu chamado foi resolvido. Confira o atendimento e deixe seu feedback.',
  fechado: 'Este atendimento foi finalizado.',
}

export const EMPTY_MY_TICKETS_TITLE = 'VocÛ ainda nÒo abriu nenhum chamado.'
export const EMPTY_MY_TICKETS_BODY = 'Quando precisar de suporte, registre uma solicitaþÒo e acompanhe o atendimento por aqui.'

export const ERROR_LOAD_TICKET = 'NÒo conseguimos carregar seu chamado.'
export const ERROR_LOAD_TICKET_HINT = 'Tente novamente em alguns instantes.'
export const ERROR_SEND_TICKET = 'NÒo foi possÝvel enviar o chamado.'
export const ERROR_SEND_TICKET_HINT = 'Verifique sua conexÒo e tente novamente.'
