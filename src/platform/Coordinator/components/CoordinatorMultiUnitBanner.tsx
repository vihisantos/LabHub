import { Link } from 'react-router-dom'

/**
 * Banner horizontal da Central do Coordenador na Home.
 *
 * Integra o SVG OFICIAL (`public/coord-banner.svg`, 1900×1106) via `<img>` —
 * o navegador carrega o arquivo integral, preservando paths, `<defs>`,
 * patterns e imagens base64 embutidas 1:1. Nada é reconstruído em JSX/CSS.
 *
 * As cores internas do banner são identidade fixa da arte e NÃO respondem ao
 * tema — nenhum filter/currentColor é aplicado (nada de invert/brightness).
 *
 * Componente 100% apresentacional: não consulta banco. A regra de visibilidade
 * (cargo "Coordenador Multiunidade" — `isCoordinatorMultiUnit`) vive no consumidor
 * (DashboardPage), via `useCoordinator()` (escopo RBAC 2.0 fail-closed).
 */
const COORDINATOR_BANNER_SRC = '/coord-banner.svg'

export function CoordinatorMultiUnitBanner() {
  return (
    <Link
      to="/coordenador"
      aria-label="Abrir a Central do Coordenador"
      data-testid="coordinator-multi-unit-banner"
      className="block w-full cursor-pointer transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
    >
      <img
        src={COORDINATOR_BANNER_SRC}
        alt="Central do Coordenador"
        className="block h-auto w-full"
        decoding="async"
      />
    </Link>
  )
}