import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoordinatorMultiUnitBanner } from '../CoordinatorMultiUnitBanner'

function renderBanner() {
  return render(
    <MemoryRouter>
      <CoordinatorMultiUnitBanner />
    </MemoryRouter>,
  )
}

describe('CoordinatorMultiUnitBanner — integração 1:1 do SVG oficial', () => {
  it('renderiza o SVG oficial via <img> (mesma arte, sem reconstrução de paths/patterns)', () => {
    renderBanner()

    const img = screen.getByRole('img', { name: 'Central do Coordenador' })
    expect(img).toHaveAttribute('src', '/coord-banner.svg')
  })

  it('não introduz hacks de tema (sem filter de cor na arte)', () => {
    renderBanner()

    const img = screen.getByRole('img', { name: 'Central do Coordenador' })
    expect(img.className).not.toMatch(
      /(invert|brightness|saturate|contrast|hue-rotate|grayscale|sepia)/,
    )
  })
})

describe('CoordinatorMultiUnitBanner — interação: só o botão “Entrar” é clicável', () => {
  it('existe um link CTA para /coordenador com data-testid e aria-label corretos', () => {
    renderBanner()

    const cta = screen.getByTestId('coordinator-multi-unit-banner-cta')
    expect(cta.tagName).toBe('A')
    expect(cta).toHaveAttribute('href', '/coordenador')
    expect(cta).toHaveAttribute('aria-label', 'Abrir a Central do Coordenador')
  })

  it('o banner inteiro não é o link (container div, sem href e fora de qualquer <a>)', () => {
    renderBanner()

    const container = screen.getByTestId('coordinator-multi-unit-banner')
    expect(container.tagName).toBe('DIV')
    expect(container).not.toHaveAttribute('href')
    expect(container.closest('a')).toBeNull()
  })

  it('o <img> NÃO está dentro de um <a>', () => {
    renderBanner()

    const img = screen.getByRole('img', { name: 'Central do Coordenador' })
    expect(img.closest('a')).toBeNull()
  })

  it('o CTA é um hotspot irmão do <img> dentro do container relativo (não envolve o <img>)', () => {
    renderBanner()

    const container = screen.getByTestId('coordinator-multi-unit-banner')
    const img = screen.getByRole('img', { name: 'Central do Coordenador' })
    const cta = screen.getByTestId('coordinator-multi-unit-banner-cta')

    expect(img.parentElement).toBe(container)
    expect(cta.parentElement).toBe(container)
    expect(cta.contains(img)).toBe(false)
  })

  it('posiciona o hotspot responsivo sobre a região do botão “Entrar” (percentuais do viewBox 1900×1106)', () => {
    renderBanner()

    const cta = screen.getByTestId('coordinator-multi-unit-banner-cta')
    expect(cta.style.left).toBe('13.82%')
    expect(cta.style.top).toBe('58%')
    expect(cta.style.width).toBe('21.58%')
    expect(cta.style.height).toBe('8.32%')
  })
})

describe('CoordinatorMultiUnitBanner — asset (public/coord-banner.svg)', () => {
  const asset = readFileSync(resolve(process.cwd(), 'public/coord-banner.svg'), 'utf8')

  it('não possui mais o fundo externo sólido #1E1E1E (área externa transparente)', () => {
    expect(asset).not.toMatch(/<rect width="1900" height="1106"[^>]*fill="#1E1E1E"/i)
    expect(asset).not.toContain('#1E1E1E')
  })

  it('preserva dimensões, composição e as fotografias embutidas', () => {
    expect(asset).toContain('viewBox="0 0 1900 1106"')
    expect(asset.match(/xlink:href="data:image\//g) ?? []).toHaveLength(4)
  })
})