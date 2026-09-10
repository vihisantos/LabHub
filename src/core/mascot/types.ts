export type MascotState =
  | 'idle'
  | 'loading'
  | 'thinking'
  | 'waiting'
  | 'approved'
  | 'celebration'
  | 'error'
  | 'notification'
  | 'sleeping'

export type MascotEvent =
  | 'blink'
  | 'glance'
  | 'breath'
  | 'sleep'
  | 'wake'
  | 'celebrate'
  | 'bounce'
  | 'lookDown'

/** Contrato consumido pelo ApprovalWaitingPage e por qualquer tela que use o mascote. */
export interface MascotProps {
  state?: MascotState
  size?: number
  className?: string
  'aria-label'?: string
}