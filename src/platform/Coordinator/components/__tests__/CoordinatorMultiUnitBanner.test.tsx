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

  it('é um link para a rota EXISTENTE da Central do Coordenador (/coordenador)', () => {
    renderBanner()

    const link = screen.getByRole('link', { name: 'Abrir a Central do Coordenador' })
    expect(link).toHaveAttribute('href', '/coordenador')
  })

  it('não introduz hacks de tema (sem filter de cor na arte)', () => {
    renderBanner()

    const img = screen.getByRole('img', { name: 'Central do Coordenador' })
    expect(img.className).not.toMatch(
      /(invert|brightness|saturate|contrast|hue-rotate|grayscale|sepia)/,
    )
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