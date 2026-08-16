import { useAppAccess } from '../../core/permissions/usePermissions'
import { DashboardPage } from './DashboardPage'
import { Launcher } from '../Launcher/Launcher'

/**
 * Tela inicial do app.
 * - Quem tem acesso ao módulo "dashboard" cai direto no Dashboard (métricas,
 *   resumo por módulo e atividade).
 * - Quem não tem, vê a home simples: ações rápidas + cards dos apps
 *   acessíveis (centralizados, sem o dashboard).
 */
export function HomePage() {
  const { canAccessApp } = useAppAccess()
  return canAccessApp('dashboard') ? <DashboardPage /> : <Launcher />
}
