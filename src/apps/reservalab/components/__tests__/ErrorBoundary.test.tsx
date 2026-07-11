import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message)
}

beforeEach(() => {
  // Evitar que o erro não tratado no console atrapalhe os testes
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ErrorBoundary', () => {
  it('renderiza children quando não há erro', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('Content')
  })

  it('renderiza fallback padrão quando child lança erro', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Algo deu errado" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Erro ao carregar componente')).toBeInTheDocument()
  })

  it('renderiza fallback customizado quando child lança erro', () => {
    render(
      <ErrorBoundary fallback="Fallback customizado">
        <ThrowError message="Algo deu errado" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Fallback customizado')).toBeInTheDocument()
  })

  it('exibe mensagem do erro', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Mensagem específica do erro" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Mensagem específica do erro')).toBeInTheDocument()
  })
})
