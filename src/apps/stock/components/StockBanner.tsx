import { BannerImage } from '../../../lib/components/BannerImage'
import { STOCK_BANNERS, type StockBannerSpec } from '../banners'

/**
 * Área de banner do app Estoque.
 *
 * - Opcional: sem conteúdo configurado, retorna `null` — não deixa espaço vazio.
 * - Não é sticky e não cobre filtros/ações/controles: fica no fluxo do conteúdo.
 * - Proporcional em qualquer largura (mobile/PWA, tablet, desktop) porque o
 *   asset define a altura (`width: 100%`, altura automática).
 * - Reutiliza o primitivo compartilhado `BannerImage` (mesmo crossfade e
 *   hotspot da Home), evitando duplicar a lógica e a identidade visual.
 *
 * Para publicar arte, adicione itens em `STOCK_BANNERS` (`../banners`).
 */
export function StockBanner({ banners = STOCK_BANNERS }: { banners?: StockBannerSpec[] }) {
  if (!banners || banners.length === 0) return null

  return (
    <section aria-label="Destaques do Estoque" className="relative z-10 space-y-3">
      {banners.map((banner, index) => (
        <div
          key={banner.src}
          className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-card)]"
        >
          <BannerImage
            src={banner.src}
            alt={banner.alt}
            eager={banner.eager ?? index === 0}
            hotspot={banner.hotspot}
          />
        </div>
      ))}
    </section>
  )
}
