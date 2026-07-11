import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartContainer } from '../ChartContainer'

describe('ChartContainer', () => {
  it('renderiza título', () => {
    render(<ChartContainer title="Gráfico de Reservas">content</ChartContainer>)
    expect(screen.getByText('Gráfico de Reservas')).toBeInTheDocument()
  })

  it('renderiza subtitle quando fornecida', () => {
    render(
      <ChartContainer title="Test" subtitle="últimos 30 dias">
        content
      </ChartContainer>,
    )
    expect(screen.getByText('últimos 30 dias')).toBeInTheDocument()
  })

  it('não renderiza subtitle quando não fornecida', () => {
    const { container } = render(<ChartContainer title="Test">content</ChartContainer>)
    // Só deve ter um elemento p (o título h3)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  it('renderiza children', () => {
    render(
      <ChartContainer title="Test">
        <div data-testid="chart-child">Chart Content</div>
      </ChartContainer>,
    )
    expect(screen.getByTestId('chart-child')).toHaveTextContent('Chart Content')
  })

  it('aceita prop isMobile', () => {
    render(
      <ChartContainer title="Test" isMobile>
        content
      </ChartContainer>,
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})
