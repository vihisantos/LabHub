import type { ThemeVariant } from '../../core/auth/types'

/** Par de banners (principal + secundário) de um tema visual da Home. */
export interface HomeBannerPair {
  main: string
  secondary: string
}

/**
 * ÚNICA fonte de configuração do mapeamento
 * `theme_variant` (preferência global do usuário) → par de banners da Home.
 *
 * Não existir "Tema da Home" como preferência separada: o mesmo tema que
 * controla a aparência global do LabHub (classes `dark`/`dim`/`light`) também
 * escolhe o conjunto de banners exibido na Home.
 *
 * Correspondência verificada pela composição de cada SVG (textos/artes batem
 * com os mockups de referência):
 * - `light` (Claro)  → tema-1 (arte clara, "Central do LabHub")
 * - `dim`   (Sutil)  → tema-2 (fundo lilás suave)
 * - `dark`  (Escuro) → tema-3 (arte escura, textos brancos)
 *
 * Os nomes "Tema 1/2/3" existem apenas na organização dos arquivos em
 * `public/banners/`; no produto o usuário vê Escuro/Sutil/Claro.
 */
export const HOME_BANNERS_BY_THEME: Record<ThemeVariant, HomeBannerPair> = {
  light: {
    main: '/banners/tema-1/principal.svg',
    secondary: '/banners/tema-1/secundario.svg',
  },
  dim: {
    main: '/banners/tema-2/principal.svg',
    secondary: '/banners/tema-2/secundario.svg',
  },
  dark: {
    main: '/banners/tema-3/principal.svg',
    secondary: '/banners/tema-3/secundario.svg',
  },
}

/** Rótulo legível de cada tema global (textos alternativos/acessibilidade). */
export const HOME_THEME_LABELS: Record<ThemeVariant, string> = {
  dark: 'Escuro',
  dim: 'Sutil',
  light: 'Claro',
}

/**
 * Banner principal EXCLUSIVO do Coordenador Multiunidade — exceção contextual
 * à regra por tema. Quando `isCoordinatorMultiUnit` (fonte RBAC 2.0 existente,
 * `useCoordinator`) é verdadeiro, a Home exibe este asset em QUALQUER tema
 * (Claro/Sutil/Escuro). O banner secundário continua seguindo o tema global.
 * Não existe variante por tema deste banner neste momento.
 */
export const COORDINATOR_HOME_BANNER = '/banners/coordenador.svg'

/**
 * Resolve o par de banners do tema global ativo.
 * Valor inválido/ausente cai no tema padrão do LabHub (Escuro).
 */
export function homeBannersFor(theme: ThemeVariant): HomeBannerPair {
  return HOME_BANNERS_BY_THEME[theme] ?? HOME_BANNERS_BY_THEME.dark
}
