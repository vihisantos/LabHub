import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import { StockBanner } from '../StockBanner'
import { STOCK_BANNERS, type StockBannerSpec } from '../../banners'

const BANNERS: StockBannerSpec[] = [
  { src: '/banners/stock/principal.svg', alt: 'Banner principal do Estoque' },
  {
    src: '/banners/stock/secundario.svg',
    alt: 'Banner secundário do Estoque',
    hotspot: { to: '/stock/items', label: 'Ir para Materiais', box: { left: 5, top: 60, width: 30, height: 12 } },
  },
]

describe('StockBanner', () => {
  it('não renderiza nada (sem espaço reservado) quando não há banners', () => {
    const { container } = renderWithProviders(<StockBanner banners={[]} />, { initialEntries: ['/stock'] })

    expect(container).toBeEmptyDOMElement()
  })

  it('a configuração padrão do Estoque está vazia nesta etapa (fundação)', () => {
    expect(STOCK_BANNERS).toHaveLength(0)
  })

  it('renderiza a arte com texto alternativo quando há banners', () => {
    renderWithProviders(<StockBanner banners={BANNERS} />, { initialEntries: ['/stock'] })

    expect(screen.getByAltText('Banner principal do Estoque')).toBeInTheDocument()
    expect(screen.getByAltText('Banner secundário do Estoque')).toBeInTheDocument()
  })

  it('expõe o hotspot como link acessível quando configurado', () => {
    renderWithProviders(<StockBanner banners={BANNERS} />, { initialEntries: ['/stock'] })

    const link = screen.getByRole('link', { name: 'Ir para Materiais' })
    expect(link).toHaveAttribute('href', '/stock/items')
  })

  it('intercepta o clique do hotspot para navegação SPA', () => {
    renderWithProviders(<StockBanner banners={BANNERS} />, { initialEntries: ['/stock'] })

    const link = screen.getByRole('link', { name: 'Ir para Materiais' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    link.dispatchEvent(event)

    // preventDefault = a navegação é tratada pelo router, sem reload da página.
    expect(event.defaultPrevented).toBe(true)
  })
})
