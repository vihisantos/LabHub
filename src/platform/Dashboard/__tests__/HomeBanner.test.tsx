import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ThemeVariant } from '../../../core/auth/types'
import { HomeBanner, HomeBannerSecondary } from '../HomeBanner'
import { COORDINATOR_HOME_BANNER, HOME_BANNERS_BY_THEME, homeBannersFor } from '../homeBanners'

const mockTheme = vi.hoisted(() => vi.fn<() => ThemeVariant>(() => 'dark'))
const mockIsCoordinatorMultiUnit = vi.hoisted(() => vi.fn<() => boolean>(() => false))

vi.mock('../../../lib/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme(), accent: 'blue', setTheme: vi.fn(), setAccent: vi.fn(), toggle: vi.fn() }),
}))

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => ({
    units: [],
    loading: false,
    failed: false,
    refresh: vi.fn(),
    isCoordinator: mockIsCoordinatorMultiUnit(),
    isCoordinatorMultiUnit: mockIsCoordinatorMultiUnit(),
  }),
}))

function bannerSrcs(): string[] {
  return Array.from(document.querySelectorAll('img[src^="/banners/"]')).map(
    (img) => img.getAttribute('src') ?? '',
  )
}

beforeEach(() => {
  mockTheme.mockReturnValue('dark')
  mockIsCoordinatorMultiUnit.mockReturnValue(false)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('homeBannersFor — mapeamento theme_variant → par de banners', () => {
  it('cada tema global resolve o seu par de SVGs (fonte única de configuração)', () => {
    expect(homeBannersFor('light')).toEqual({
      main: '/banners/tema-1/principal.svg',
      secondary: '/banners/tema-1/secundario.svg',
    })
    expect(homeBannersFor('dim')).toEqual({
      main: '/banners/tema-2/principal.svg',
      secondary: '/banners/tema-2/secundario.svg',
    })
    expect(homeBannersFor('dark')).toEqual({
      main: '/banners/tema-3/principal.svg',
      secondary: '/banners/tema-3/secundario.svg',
    })
  })

  it('os três pares são distintos (nenhum tema reaproveita o par de outro)', () => {
    const mains = Object.values(HOME_BANNERS_BY_THEME).map((p) => p.main)
    expect(new Set(mains).size).toBe(3)
    const secondaries = Object.values(HOME_BANNERS_BY_THEME).map((p) => p.secondary)
    expect(new Set(secondaries).size).toBe(3)
  })

  it('valor inválido cai no tema padrão (Escuro)', () => {
    expect(homeBannersFor('invalido' as ThemeVariant)).toEqual(HOME_BANNERS_BY_THEME.dark)
  })
})

describe('HomeBanner + HomeBannerSecondary', () => {
  it.each([
    ['dark', 'tema-3'],
    ['dim', 'tema-2'],
    ['light', 'tema-1'],
  ] as const)('tema %s renderiza o par %s (principal + secundário)', (theme, folder) => {
    mockTheme.mockReturnValue(theme as ThemeVariant)
    render(
      <>
        <HomeBanner />
        <HomeBannerSecondary />
      </>,
    )
    const srcs = bannerSrcs()
    expect(srcs).toContain(`/banners/${folder}/principal.svg`)
    expect(srcs).toContain(`/banners/${folder}/secundario.svg`)
  })

  it('principal e secundário NUNCA ficam com temas diferentes', () => {
    for (const theme of ['dark', 'dim', 'light'] as const) {
      mockTheme.mockReturnValue(theme)
      const { unmount } = render(
        <>
          <HomeBanner />
          <HomeBannerSecondary />
        </>,
      )
      const srcs = bannerSrcs()
      expect(srcs.length).toBe(2)
      const folders = new Set(srcs.map((s) => s.split('/')[2]))
      expect(folders.size).toBe(1)
      unmount()
    }
  })

  it('troca de tema no Perfil agrega o novo par na Home (sem seleção local)', () => {
    mockTheme.mockReturnValue('dark')
    const { rerender } = render(
      <>
        <HomeBanner />
        <HomeBannerSecondary />
      </>,
    )
    expect(bannerSrcs()).toContain('/banners/tema-3/principal.svg')

    // Usuário troca o tema global no Perfil → context notifica → Home reage.
    mockTheme.mockReturnValue('light')
    rerender(
      <>
        <HomeBanner />
        <HomeBannerSecondary />
      </>,
    )
    const srcs = bannerSrcs()
    expect(srcs).toContain('/banners/tema-1/principal.svg')
    expect(srcs).toContain('/banners/tema-1/secundario.svg')
    // Camada base antiga permanece visível até a nova carregar (crossfade).
    expect(srcs).toContain('/banners/tema-3/principal.svg')
  })

  it('sem carousel/autoplay: os srcs não mudam sozinhos com o tempo', () => {
    vi.useFakeTimers()
    try {
      render(
        <>
          <HomeBanner />
          <HomeBannerSecondary />
        </>,
      )
      const antes = bannerSrcs()
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(bannerSrcs()).toEqual(antes)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('HomeBanner — Coordenador Multiunidade (exceção ao tema)', () => {
  it('coordenador vê /banners/coordenador.svg como principal nos TRÊS temas', () => {
    mockIsCoordinatorMultiUnit.mockReturnValue(true)
    for (const theme of ['light', 'dim', 'dark'] as const) {
      mockTheme.mockReturnValue(theme)
      const { unmount } = render(
        <>
          <HomeBanner />
          <HomeBannerSecondary />
        </>,
      )
      const srcs = bannerSrcs()
      // Principal: sempre o banner do Coordenador, independente do tema.
      expect(srcs).toContain('/banners/coordenador.svg')
      // Secundário: continua no par do tema global (não recebe a exceção).
      const { secondary } = homeBannersFor(theme)
      expect(srcs).toContain(secondary)
      // O principal do tema NÃO aparece para o coordenador.
      expect(srcs).not.toContain(homeBannersFor(theme).main)
      expect(srcs.length).toBe(2)
      unmount()
    }
  })

  it('constante aponta para o asset oficial /banners/coordenador.svg', () => {
    expect(COORDINATOR_HOME_BANNER).toBe('/banners/coordenador.svg')
  })

  it('usuário comum (sem o cargo) continua no par do tema — sem vazamento da exceção', () => {
    mockIsCoordinatorMultiUnit.mockReturnValue(false)
    mockTheme.mockReturnValue('dim')
    render(
      <>
        <HomeBanner />
        <HomeBannerSecondary />
      </>,
    )
    const srcs = bannerSrcs()
    expect(srcs).not.toContain('/banners/coordenador.svg')
    expect(srcs).toContain('/banners/tema-2/principal.svg')
  })
})

describe('Assets dos 6 SVGs (paths corretos e completos)', () => {
  const urls = Object.values(HOME_BANNERS_BY_THEME).flatMap((p) => [p.main, p.secondary])

  it.each(urls)('%s existe e é um SVG autocontido', (url) => {
    const content = readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')), 'utf8')
    expect(content).toMatch(/<svg[^>]*viewBox="/)
    // Assets completos (fundo/personagem/textos embutidos) — não reconstruídos.
    expect(content).toContain('base64')
    expect(content).not.toMatch(/<image[^>]*href="http/)
  })

  it('tema-3 principal: paths renderizáveis possuem fill válido (correção do export)', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'public/banners/tema-3/principal.svg'),
      'utf8',
    )
    // O gradiente correto (branco → #6057B7) foi definido e aplicado.
    expect(content).toContain('id="home_t3_title"')
    expect(content).toContain('fill="url(#home_t3_title)" data-figma-gradient-fill=')
    // Fora de <clipPath>, nenhum path sem fill (o efeito era texto invisível).
    const semClip = content.replace(/<clipPath[\s\S]*?<\/clipPath>/g, '')
    const paths = semClip.match(/<path\b[^>]*\/>/g) ?? []
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p).toContain('fill="')
    }
  })

  it('coordenador.svg existe e é um SVG autocontido (asset oficial, não reconstruído)', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'public/banners/coordenador.svg'),
      'utf8',
    )
    expect(content).toMatch(/<svg[^>]*viewBox="/)
    expect(content).toContain('base64')
    expect(content).not.toMatch(/<image[^>]*href="http/)
    expect(content.trimEnd().endsWith('</svg>')).toBe(true)
  })
})
