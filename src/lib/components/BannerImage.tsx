import { useEffect, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Bloco clicável de um banner, alinhado a um CTA já DESENHADO na arte (SVG).
 * As coordenadas são percentuais do viewBox, então o hotspot acompanha o banner
 * em qualquer largura (desktop, tablet, mobile/PWA) sem media query.
 */
export interface BannerHotspotBox {
  to: string
  label: string
  box: { left: number; top: number; width: number; height: number }
}

export interface BannerImageProps {
  src: string
  alt: string
  /** Prioridade de rede (banner acima da dobra). */
  eager?: boolean
  /**
   * Sobreposição clicável alinhada a um CTA já DESENHADO no SVG. Não acrescenta
   * pixel algum: só torna a área do CTA acionável.
   */
  hotspot?: BannerHotspotBox
  /** Duração do crossfade na troca de `src` (ms). */
  fadeMs?: number
  /** Classes extras aplicadas ao contêiner do banner. */
  className?: string
}

const DEFAULT_FADE_MS = 300

/**
 * Renderiza um banner (SVG autocontido) com crossfade na troca de `src`.
 *
 * - Renderização proporcional (`width: 100%`, altura automática) — nunca corta
 *   texto, CTA ou mascote (`object-fit: cover` é proibido aqui).
 * - Camada dupla: o banner atual permanece visível até o novo carregar; quando
 *   pronto, faz fade e assume o lugar da anterior.
 * - A troca SÓ acontece quando `src` muda. Sem carousel, sem autoplay.
 *
 * Extraído de `HomeBanner` para ser reutilizável por outros apps (ex.: Stock)
 * sem duplicar a lógica de crossfade/hotspot.
 */
export function BannerImage({
  src,
  alt,
  eager = false,
  hotspot,
  fadeMs = DEFAULT_FADE_MS,
  className,
}: BannerImageProps) {
  // `base` = banner visível; `top` = próximo banner (carregando por cima).
  const [base, setBase] = useState(src)
  const [top, setTop] = useState<string | null>(null)
  const [topReady, setTopReady] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  // Sincronização durante o render: agenda a troca quando `src` muda.
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
    }, fadeMs + 50)
    return () => clearTimeout(timer)
  }, [top, topReady, fadeMs])

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
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
          style={{ opacity: topReady ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
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
 * por teclado e anunciado por leitores de tela sem duplicar o texto do CTA.
 */
export function BannerHotspot({ to, label, box }: BannerHotspotBox) {
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
