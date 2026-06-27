import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renderiza nada quando fechado', () => {
    render(<Modal open={false} onClose={vi.fn()} title="Modal">Conteúdo</Modal>)
    expect(screen.queryByText('Modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument()
  })

  it('renderiza titulo e children quando aberto', () => {
    render(<Modal open={true} onClose={vi.fn()} title="Título Modal">Conteúdo do modal</Modal>)
    expect(screen.getByText('Título Modal')).toBeInTheDocument()
    expect(screen.getByText('Conteúdo do modal')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no botao fechar', () => {
    const onClose = vi.fn()
    render(<Modal open={true} onClose={onClose} title="Modal">Conteúdo</Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
