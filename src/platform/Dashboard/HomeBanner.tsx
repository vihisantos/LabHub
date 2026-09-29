import { useEffect, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/ThemeContext'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { COORDINATOR_HOME_BANNER, HOME_THEME_LABELS, homeBannersFor } from './homeBanners'

const FADE_MS = 300

interface BannerImageProps {
  src: string
  alt: string
  /** Prioridade de rede (banner acima da dobra). */
  eager?: boolean
  /**
   * Sobreposição clicável alinhada a um CTA já DESENHADO no SVG. Não acrescenta
   * pixel algum: só torna a área do CTA acionável. As coordenadas são
   * percentuais do viewBox, então o hotspot acompanha o banner em qualquer
   * largura (desktop, tablet, mobile/PWA) sem media query.
   */
  hotspot?: { to: string; label: string; box: { left: number; top: number; width: number; height: number } }
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
function BannerImage({ src, alt, eager = false, hotspot }: BannerImageProps) {
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
      {hotspot && <BannerHotspot {...hotspot} />}
    </div>
  )
}

/**
 * Link transparente sobre o CTA desenhado no SVG do banner.
 *
 * O `<a>` é real (navegação do SPA via `useNavigate`, com fallback para o
 * `href` se o clique não for tratado) e tem `aria-label`, então é alcançável
 * por teclado e anunciado por leitores de tela sem duplicar o texto "Entrar"
 * nem desenhar um botão por cima da arte.
 */
function BannerHotspot({ to, label, box }: NonNullable<BannerImageProps['hotspot']>) {
  const navigate = useNavigate()

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Modificador/teclas de navegação: deixa o browser tratar (abrir em nova aba).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }

  return (
    <a
      href={to}
      onClick={onClick}
      aria-label={label}
      className="absolute cursor-pointer rounded-[999px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
    />
  )
}

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
