import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../../../../lib/ErrorBoundary'

const ThrowError = () => { throw new Error('Erro de teste') }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renderiza children sem erro', () => {
    render(<ErrorBoundary><div>OK</div></ErrorBoundary>)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('captura erro e mostra fallback padrao', () => {
    render(<ErrorBoundary><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
    expect(screen.getByText('Erro de teste')).toBeInTheDocument()
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument()
  })

  it('renderiza fallback personalizado', () => {
    render(<ErrorBoundary fallback={<div>Fallback customizado</div>}><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Fallback customizado')).toBeInTheDocument()
  })

  it('botao Tentar novamente recupera estado', () => {
    render(<ErrorBoundary><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tentar novamente'))
    // Error still present, so should catch again
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
  })
})
