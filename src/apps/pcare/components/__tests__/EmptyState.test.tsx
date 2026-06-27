import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renderiza titulo e descricao', () => {
    render(<EmptyState title="Nada aqui" description="Adicione algo" />)
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
    expect(screen.getByText('Adicione algo')).toBeInTheDocument()
  })

  it('renderiza icone padrao (Inbox) quando nao fornecido', () => {
    const { container } = render(<EmptyState title="Vazio" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renderiza botao de acao quando fornecido', () => {
    const onClick = vi.fn()
    render(<EmptyState title="Vazio" action={{ label: 'Adicionar', onClick }} />)
    const btn = screen.getByText('Adicionar')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('nao renderiza botao quando sem action', () => {
    render(<EmptyState title="Vazio" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renderiza com accentColor diferente', () => {
    render(<EmptyState title="Teste" accentColor="emerald" action={{ label: 'OK', onClick: vi.fn() }} />)
    expect(screen.getByText('Teste')).toBeInTheDocument()
  })
})
