import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TicketEventHistory } from '../TicketEventHistory'
import type { TicketEvent } from '../../types'

const event = (id: string, data: Partial<TicketEvent> = {}): TicketEvent => ({
  id, type: 'comentario', author: 'Técnico', content: 'Registro ' + id,
  createdAt: '2026-06-25T12:00:00Z', photos: [], ...data,
})

describe('TicketEventHistory (#462)', () => {
  it('preserves received order, distinguishes all event types and exposes author/time', () => {
    render(<TicketEventHistory onPhotoClick={vi.fn()} events={[
      event('1', { type: 'status', author: 'Sistema' }),
      event('2', { type: 'atribuicao' }),
      event('3', { type: 'comentario' }),
      event('4', { type: 'prioridade' }),
      event('5', { type: 'foto' }),
    ]} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    for (const [i, label] of ['Alteração de status', 'Atribuição', 'Comentário', 'Alteração de prioridade', 'Foto'].entries()) {
      expect(within(rows[i]).getByText(label)).toBeInTheDocument()
      expect(within(rows[i]).getByText('Registro ' + (i + 1))).toBeInTheDocument()
    }
    expect(within(rows[0]).getByText('Evento do sistema', { exact: false })).toBeInTheDocument()
    expect(within(rows[1]).getByText('Técnico')).toBeInTheDocument()
    expect(rows[0].querySelector('time')).toHaveAttribute('datetime', '2026-06-25T12:00:00.000Z')
  })
  it('does not invent missing author/date and preserves reason, content and photos', () => {
    const onPhotoClick = vi.fn()
    render(<TicketEventHistory onPhotoClick={onPhotoClick} events={[
      event('1', { author: '', createdAt: 'invalid', reasonLabel: 'Aguardando peça', photos: ['https://example.com/photo.jpg'] }),
    ]} />)
    expect(screen.getByText('Autor não informado')).toBeInTheDocument()
    expect(screen.getByText('Data e horário não informados')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Aguardando peça')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Foto do evento 1' }))
    expect(onPhotoClick).toHaveBeenCalledWith('https://example.com/photo.jpg')
  })
})
