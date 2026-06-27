import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge', () => {
  it('renderiza status pending', () => {
    render(<StatusBadge status="pending" />)
    const badge = screen.getByText('Pendente')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toMatch(/slate/)
  })

  it('renderiza status in_progress', () => {
    render(<StatusBadge status="in_progress" />)
    const badge = screen.getByText('Em andamento')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toMatch(/amber/)
  })

  it('renderiza status done', () => {
    render(<StatusBadge status="done" />)
    const badge = screen.getByText('Concluído')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toMatch(/emerald/)
  })
})
