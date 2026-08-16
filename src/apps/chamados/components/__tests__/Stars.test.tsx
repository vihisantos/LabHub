import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Stars } from '../Stars'

describe('Stars', () => {
  it('renderiza 5 botões com acessibilidade', () => {
    render(<Stars value={0} />)
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`)).toBeInTheDocument()
    }
  })

  it('preenche as estrelas até o valor informado', () => {
    render(<Stars value={3} />)
    for (let n = 1; n <= 5; n++) {
      const svg = screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`).querySelector('svg')
      const filled = n <= 3
      expect(svg?.getAttribute('class')?.includes('fill-amber-500')).toBe(filled)
    }
  })

  it('dispara onChange ao clicar', () => {
    const onChange = vi.fn()
    render(<Stars value={0} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('4 estrelas'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('desabilita sem onChange', () => {
    render(<Stars value={2} />)
    expect(screen.getByLabelText('1 estrela')).toBeDisabled()
  })

  it('desabilita explicitamente', () => {
    render(<Stars value={2} onChange={() => {}} disabled />)
    expect(screen.getByLabelText('3 estrelas')).toBeDisabled()
  })
})
