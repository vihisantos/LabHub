import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge', () => {
  it('renderiza status ativo', () => {
    render(<StatusBadge status="ativo" />)
    expect(screen.getByText('Ativo')).toBeInTheDocument()
  })

  it('renderiza status em_conserto', () => {
    render(<StatusBadge status="em_conserto" />)
    expect(screen.getByText('Em Conserto')).toBeInTheDocument()
  })

  it('renderiza status descartado', () => {
    render(<StatusBadge status="descartado" />)
    expect(screen.getByText('Descartado')).toBeInTheDocument()
  })

  it('renderiza status emprestado', () => {
    render(<StatusBadge status="emprestado" />)
    expect(screen.getByText('Emprestado')).toBeInTheDocument()
  })

  it('possui a classe de cor correta para cada status', () => {
    const { container } = render(<StatusBadge status="ativo" />)
    const span = container.firstChild as HTMLElement
    expect(span.className).toContain('bg-emerald')
  })
})
