import type { DeviceConfig } from './config'
import { TvDisplay } from '../apps/tv/pages/TvDisplay'

interface ScreenRendererProps {
  config: DeviceConfig
}

/**
 * Único ponto de decisão da tela do kiosk: a TV Corporativa institucional.
 * Sem polling, sem subscriptions, sem Supabase/backend, sem Chamados e sem timers.
 *
 * Qualquer valor antigo/desconhecido de `screenApp` continua exibindo a TV —
 * a TV nunca fica sem tela e nunca renderiza Chamados.
 */
export function ScreenRenderer({ config }: ScreenRendererProps) {
  return <TvDisplay deviceName={config.name} deviceId={config.deviceId} />
}
