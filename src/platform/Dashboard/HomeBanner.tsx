import { useEffect, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { COORDINATOR_HOME_BANNER, HOME_THEME_LABELS, homeBannersFor } from './homeBanners'

const FADE_MS = 300

interface BannerImageProps {
  src: string
  alt: string
  /** Prioridade de rede (banner acima da dobra). */
  eager?: boolean
}

/**
 * Renderiza um banner completo (SVG autocontido) com crossfade na troca.
 *
 * - Renderização proporcional (`width: 100%`, height automático) — nunca
 *   corta texto, CTA ou mascote (`object-fit: cover` é proibido aqui).
 * - Camada dupla: o banner atual permanece visível até o novo carregar;
 *   quando pronto, faz fade e assume o lugar da anterior.
 * - A troca SÓ acontece quando `src` muda — ou seja, quando o `theme_variant`
 *   global muda no Perfil. Sem carousel, sem autoplay, sem controle na Home.
 */
function BannerImage({ src, alt, eager = false }: BannerImageProps) {
  // `base` = banner visível; `top` = próximo banner (carregando por cima).
  const [base, setBase] = useState(src)
  const [top, setTop] = useState<string | null>(null)
  const [topReady, setTopReady] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  // Sincronização durante o render: agenda a troca quando `src` muda
  // (tema alterado no Perfil) — o banner só muda por aqui, nunca sozinho.
  if (src !== prevSrc) {
    setPrevSrc(src)
    if (src === base) {
      // Tema voltou ao valor atual antes de a nova imagem carregar: descarta.
      setTop(null)
      setTopReady(false)
    } else if (src !== top) {
      setTop(src)
      setTopReady(false)
    }
  }

  // Depois do crossfade, promove a nova camada a camada base.
  useEffect(() => {
    if (!top || !topReady) return
    const timer = setTimeout(() => {
      setBase(top)
      setTop(null)
      setTopReady(false)
    }, FADE_MS + 50)
    return () => clearTimeout(timer)
  }, [top, topReady])

  return (
    <div className="relative overflow-hidden">
      <img
        src={base}
        alt={alt}
        className="block w-full"
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
      />
      {top && (
        <img
          src={top}
          alt=""
          aria-hidden="true"
          onLoad={() => setTopReady(true)}
          className="absolute inset-x-0 top-0 block w-full transition-opacity motion-reduce:transition-none"
          style={{ opacity: topReady ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        />
      )}
    </div>
  )
}

/**
 * Banner principal da Home — SVG completo do tema global ativo.
 * O tema é lido da infraestrutura existente (`ThemeContext`/`theme_variant`);
 * não existe seletor de banner na Home.
 *
 * EXCEÇÃO (sem nova RBAC): Coordenador Multiunidade (`isCoordinatorMultiUnit`
 * da fonte já existente `useCoordinator`) vê `/banners/coordenador.svg` em
 * QUALQUER tema — o asset não varia com Claro/Sutil/Escuro neste momento.
 * Usuários comuns continuam no par do `theme_variant` (light/dim/dark → 1/2/3).
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
