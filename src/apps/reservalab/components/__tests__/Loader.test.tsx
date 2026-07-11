import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Loader } from '../Loader'

describe('Loader', () => {
  it('renderiza texto "Carregando..."', () => {
    render(<Loader />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('renderiza com tamanho customizado', () => {
    const { container } = render(<Loader size={64} />)
    const svgContainer = container.querySelector('[style*="width: 64px"]')
    expect(svgContainer).toBeTruthy()
  })

  it('quando fullScreen=false não renderiza overlay fixed', () => {
    const { container } = render(<Loader fullScreen={false} />)
    expect(container.querySelector('[style*="position: fixed"]')).toBeNull()
  })

  it('quando fullScreen=true (padrão) renderiza overlay fixed', () => {
    const { container } = render(<Loader />)
    expect(container.querySelector('[style*="position: fixed"]')).toBeTruthy()
  })
})
