import { Link } from 'react-router-dom'

/**
 * Banner horizontal da Central do Coordenador na Home.
 *
 * Integra o SVG OFICIAL (`public/coord-banner.svg`, 1900×1106) via `<img>` —
 * o navegador carrega o arquivo integral, preservando paths, `<defs>`,
 * patterns e imagens base64 embutidas 1:1. Nada é reconstruído em JSX/CSS.
 *
 * A arte é 100% visual: o banner inteiro não é clicável. Nenhum `<Link>` envolve
 * o `<img>`. A navegação para `/coordenador` acontece somente através de um
 * hotspot `<Link>` transparente, absolutamente posicionado (percentuais relativos
 * ao viewBox 1900×1106) sobre a região EXATA do botão visual "Entrar" da arte
 * (`rect x=262.5 y=641.5 w=410 h=92` → 13.82% / 58% / 21.58% / 8.32%).
 *
 * Sem filters de cor na arte (nada de invert/brightness).
 *
 * Componente 100% apresentacional: não consulta banco. A regra de visibilidade
 * (cargo "Coordenador Multiunidade" — `isCoordinatorMultiUnit`) vive no consumidor
 * (DashboardPage), via `useCoordinator()` (escopo RBAC 2.0 fail-closed).
 */
const COORDINATOR_BANNER_SRC = '/coord-banner.svg'

const ENTRAR_CTA = {
  left: '13.82%',
  top: '58%',
  width: '21.58%',
  height: '8.32%',
}

export function CoordinatorMultiUnitBanner() {
  return (
    <div data-testid="coordinator-multi-unit-banner" className="relative block w-full">
      <img
        src={COORDINATOR_BANNER_SRC}
        alt="Central do Coordenador"
        className="block h-auto w-full"
        decoding="async"
      />
      <Link
        to="/coordenador"
        aria-label="Abrir a Central do Coordenador"
        data-testid="coordinator-multi-unit-banner-cta"
        style={ENTRAR_CTA}
        className="absolute block cursor-pointer rounded-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
      />
    </div>
  )
}