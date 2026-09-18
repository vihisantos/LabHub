import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResponsiveGrid } from '../ResponsiveGrid'

describe('ResponsiveGrid — grade responsiva auto-ajustável', () => {
  it('por padrão usa auto-fit com mínimo overflow-safe (min(_, 100%))', () => {
    render(
      <ResponsiveGrid minWidth={380} data-testid="grid">
        <div>conteudo</div>
      </ResponsiveGrid>,
    )
    const grid = screen.getByTestId('grid')
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(380px, 100%), 1fr))')
  })

  it('com maxWidth, o tamanho máximo da coluna também é limitado por min(_, 100%)', () => {
    render(
      <ResponsiveGrid minWidth={380} maxWidth={560} data-testid="grid">
        <div>conteudo</div>
      </ResponsiveGrid>,
    )
    const grid = screen.getByTestId('grid')
    expect(grid.style.gridTemplateColumns).toBe(
      'repeat(auto-fit, minmax(min(380px, 100%), min(560px, 100%)))',
    )
  })

  it('aplica gap e renderiza os itens', () => {
    render(
      <ResponsiveGrid minWidth={256} maxWidth={400} gap={12} data-testid="grid">
        <div>um</div>
        <div>dois</div>
      </ResponsiveGrid>,
    )
    const grid = screen.getByTestId('grid')
    expect(grid.style.gap).toBe('12px')
    expect(screen.getByText('um')).toBeInTheDocument()
    expect(screen.getByText('dois')).toBeInTheDocument()
  })
})