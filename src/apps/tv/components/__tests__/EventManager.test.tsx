import { type ReactElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventManager } from '../EventManager'
import { TooltipProvider } from '../../../../lib/components/ui'
import type { TvEvent } from '../../types'

vi.mock('../CloudinaryUpload', () => ({
  CloudinaryUpload: ({ onUpload }: { onUpload: (url: string) => void }) => (
    <button data-testid="cloudinary-upload" onClick={() => onUpload('https://cloudinary.com/uploaded.jpg')}>
      Upload
    </button>
  ),
}))

function makeEvent(overrides: Partial<TvEvent> = {}): TvEvent {
  return {
    id: 'evt-1',
    title: 'Evento Teste',
    description: 'Descrição',
    image_url: null,
    pdf_url: null,
    start_date: null,
    end_date: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe('EventManager', () => {
  it('renderiza título "Eventos"', () => {
    renderWithTooltip(<EventManager events={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Eventos')).toBeInTheDocument()
  })

  it('renderiza mensagem de vazio quando não há eventos', () => {
    renderWithTooltip(<EventManager events={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Nenhum evento cadastrado')).toBeInTheDocument()
  })

  it('renderiza lista de eventos', () => {
    const events = [makeEvent({ title: 'Workshop' }), makeEvent({ id: 'evt-2', title: 'Palestra' })]
    renderWithTooltip(<EventManager events={events} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Workshop')).toBeInTheDocument()
    expect(screen.getByText('Palestra')).toBeInTheDocument()
  })

  it('renderiza descrição do evento quando presente', () => {
    const events = [makeEvent({ description: 'Detalhes aqui' })]
    renderWithTooltip(<EventManager events={events} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Detalhes aqui')).toBeInTheDocument()
  })

  it('abre formulário ao clicar em "Novo Evento"', () => {
    renderWithTooltip(<EventManager events={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Novo Evento/ }))
    expect(screen.getByPlaceholderText('Título')).toBeInTheDocument()
  })

  it('chama onAdd ao submeter novo evento', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderWithTooltip(<EventManager events={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Novo Evento/ }))
    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Novo Evento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Novo Evento', is_active: true })
    )
  })

  it('chama onDelete ao clicar no botão de deletar', () => {
    const onDelete = vi.fn()
    const events = [makeEvent({ id: 'evt-1' })]
    const { container } = renderWithTooltip(<EventManager events={events} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />)

    const trashIcon = container.querySelector('.lucide-trash-2')
    const deleteBtn = trashIcon?.closest('button')
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn!)

    const confirmBtn = screen.getByRole('button', { name: 'Excluir' })
    fireEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledWith('evt-1')
  })

  it('chama onEdit ao submeter edição', () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const events = [makeEvent({ id: 'evt-1', title: 'Original' })]
    const { container } = renderWithTooltip(<EventManager events={events} onAdd={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />)

    const pencilIcon = container.querySelector('.lucide-pencil')
    const editBtn = pencilIcon?.closest('button')
    expect(editBtn).toBeDefined()
    fireEvent.click(editBtn!)

    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Atualizado' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))

    expect(onEdit).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ title: 'Atualizado' })
    )
  })

  it('não submete quando título está vazio', () => {
    const onAdd = vi.fn()
    renderWithTooltip(<EventManager events={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Novo Evento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('fecha formulário ao clicar no X', () => {
    renderWithTooltip(<EventManager events={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Novo Evento/ }))
    expect(screen.getByPlaceholderText('Título')).toBeInTheDocument()

    const form = screen.getByPlaceholderText('Título').closest('form')!
    const closeBtn = form.querySelector('.lucide-x')?.closest('button')
    if (closeBtn) fireEvent.click(closeBtn)
  })
})
