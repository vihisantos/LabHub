import type { TicketStatus } from '../types'

export const SOLICITANTE_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Chamado recebido',
  a_caminho: 'Técnico a caminho',
  em_atendimento: 'Em atendimento',
  resolvido: 'Chamado resolvido',
  fechado: 'Atendimento finalizado',
}

export const SOLICITANTE_STATUS_MESSAGES: Record<TicketStatus, string> = {
  aberto: 'Seu chamado foi registrado e está aguardando atendimento da equipe.',
  a_caminho: 'Um técnico está a caminho do local informado.',
  em_atendimento: 'A equipe está trabalhando neste chamado.',
  resolvido: 'Seu chamado foi resolvido. Confira o atendimento e deixe seu feedback.',
  fechado: 'Este atendimento foi finalizado.',
}

export const EMPTY_MY_TICKETS_TITLE = 'Você ainda não abriu nenhum chamado.'
export const EMPTY_MY_TICKETS_BODY = 'Quando precisar de suporte, registre uma solicitação e acompanhe o atendimento por aqui.'

export const ERROR_LOAD_TICKET = 'Não conseguimos carregar seu chamado.'
export const ERROR_LOAD_TICKET_HINT = 'Tente novamente em alguns instantes.'
export const ERROR_SEND_TICKET = 'Não foi possível enviar o chamado.'
export const ERROR_SEND_TICKET_HINT = 'Verifique sua conexão e tente novamente.'
