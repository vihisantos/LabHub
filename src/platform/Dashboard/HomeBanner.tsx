import { useTheme } from '../../lib/ThemeContext'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { BannerImage } from '../../lib/components/BannerImage'
import { COORDINATOR_HOME_BANNER, HOME_THEME_LABELS, homeBannersFor } from './homeBanners'

/**
 * Área do CTA "Entrar" em `coordenador.svg`, em % do viewBox 3723×1845.
 *
 * Origem: a pílula do CTA no asset é o `<rect x="279" y="1458" width="1407"
 * height="202" rx="101">`. Convertido para porcentagem, o hotspot cobre
 * exatamente a pílula — e só a pílula, sem invadir a arte ao redor.
 */
const COORDINATOR_CTA_BOX = { left: 7.49, top: 79.02, width: 37.79, height: 10.95 } as const

/**
 * Banner principal da Home — SVG completo do tema global ativo.
 * O tema é lido da infraestrutura existente (`ThemeContext`/`theme_variant`);
 * não existe seletor de banner na Home.
 *
 * EXCEÇÃO (sem nova RBAC): Coordenador Multiunidade (`isCoordinatorMultiUnit`
 * da fonte já existente `useCoordinator`) vê `/banners/coordenador.svg` em
 * QUALQUER tema — o asset não varia com Claro/Sutil/Escuro neste momento.
 * Usuários comuns continuam no par do `theme_variant` (light/dim/dark → 1/2/3).
 *
 * Nesse banner, o próprio CTA "Entrar" da arte leva para `/coordenador` — é o
 * único ponto de acesso à área de Coordenação na Home. A condição é a MESMA
 * que já decide a exibição do asset (`isCoordinatorMultiUnit`); nenhuma regra
 * de acesso é criada ou alterada aqui.
 */
export function HomeBanner() {
  const { theme } = useTheme()
  const { isCoordinatorMultiUnit } = useCoordinator()

  if (isCoordinatorMultiUnit) {
    return (
      <BannerImage
        src={COORDINATOR_HOME_BANNER}
        alt="Banner principal da Home — Coordenador Multiunidade"
        eager
        hotspot={{
          to: '/coordenador',
          label: 'Entrar na área de Coordenação',
          box: COORDINATOR_CTA_BOX,
        }}
      />
    )
  }

  const { main } = homeBannersFor(theme)
  const label = HOME_THEME_LABELS[theme] ?? 'Escuro'
  return <BannerImage src={main} alt={`Banner principal da Home — tema ${label}`} eager />
}

/**
 * Banner secundário (rodapé do conteúdo) — sempre o par do tema global ativo.
 * Nunca pode exibir um tema diferente do banner principal.
 * (NÃO recebe a exceção do Coordenador: segue o `theme_variant`.)
 */
export function HomeBannerSecondary() {
  const { theme } = useTheme()
  const { secondary } = homeBannersFor(theme)
  const label = HOME_THEME_LABELS[theme] ?? 'Escuro'
  return <BannerImage src={secondary} alt={`Banner de apoio da Home — tema ${label}`} />
}
