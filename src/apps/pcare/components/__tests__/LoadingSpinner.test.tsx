import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renderiza texto Carregando', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('renderiza div com spinner', () => {
    const { container } = render(<LoadingSpinner />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})
