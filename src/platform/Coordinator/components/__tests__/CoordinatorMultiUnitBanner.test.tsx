import { describe, it, expect } from 'vitest'
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