import { UpcomingReservationPopup } from '../../apps/reservalab/components/UpcomingReservationPopup'
import { HomeView } from './HomeView'

/**
 * Tela inicial do app — COMPOSIÇÃO ÚNICA da nova Home.
 *
 * Antes o `/` bifurcava visualmente (DashboardPage para quem acessava o
 * módulo `dashboard` vs Launcher para os demais). Agora a apresentação
 * converge para `HomeView` (saudação, banner do tema global, ações rápidas,
 * resumo por módulo e banner secundário) — a diferença de ACESSO continua
 * existindo nas rotas: as métricas (`MetricCard`/`ActivityFeed`) seguem em
 * `/dashboard`, protegidas por `AuthGuard` + `AppGuard appId="dashboard"`
 * (`useModuleLevel`), e a área do Coordenador continua em `/coordenador`
 * (`LeadershipAreaGuard` + `useCoordinator`).
 *
 * O tema exibido nos banners é o `theme_variant` global do usuário
 * (`ThemeContext`/`themeStore`) — sem preferência separada, sem seletor
 * de banner nesta tela.
 */
export function HomePage() {
  return (
    <>
      {/* Aviso de reserva chegando para quem tem acesso full ao ReservaLab. */}
      <UpcomingReservationPopup />
      <HomeView />
    </>
  )
}
