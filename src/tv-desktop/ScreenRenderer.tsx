import type { DeviceConfig } from './config'
import { resolveScreenApp } from './config'
import { TvDisplay } from '../apps/tv/pages/TvDisplay'
import { CallsDashboardScreen } from '../apps/chamados-dashboard/pages/CallsDashboardScreen'

interface ScreenRendererProps {
  config: DeviceConfig
}

/**
 * Único ponto de decisão de qual aplicação de tela o kiosk executa.
 * Apenas decide qual componente renderizar: sem polling, sem subscriptions,
 * sem acesso a Supabase/backend, sem timers.
 *
 * Valores desconhecidos caem na TV Corporativa — a TV nunca fica sem tela.
 */
export function ScreenRenderer({ config }: ScreenRendererProps) {
  const screenApp = resolveScreenApp(config)

  if (screenApp === 'chamados-dashboard') {
    return <CallsDashboardScreen />
  }

  return <TvDisplay deviceName={config.name} />
}
