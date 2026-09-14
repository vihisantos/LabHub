import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    form: ({ children, ...p }: any) => <form {...p}>{children}</form>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../../lib/components/ui', () => {
  const Passthrough = ({ children, ...p }: any) => <span {...p}>{children}</span>
  return {
    TooltipProvider: Passthrough,
    TooltipRoot: ({ children, ...p }: any) => <span {...p}>{children}</span>,
    TooltipTrigger: Passthrough,
    TooltipContent: Passthrough,
    AlertDialog: ({ children, ...p }: any) => <span data-testid="alert-dialog" {...p}>{children}</span>,
    AlertDialogContent: Passthrough,
    AlertDialogHeader: Passthrough,
    AlertDialogFooter: Passthrough,
    AlertDialogTitle: Passthrough,
    AlertDialogDescription: Passthrough,
    AlertDialogAction: Passthrough,
    AlertDialogCancel: Passthrough,
  }
})

import { EventManager } from '../EventManager'
import type { TvDevice, TvEvent } from '../../types'

function device(name: string): TvDevice {
  return {
    id: `tv-${name}`,
    name,
    workspace_id: 'ws-1',
    user_id: null,
    last_seen: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makeEvent(overrides: Partial<TvEvent> = {}): TvEvent {
  return {
    id: 'ev-1',
    title: 'Evento A',
    description: null,
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

function renderManager(devices: TvDevice[], events: TvEvent[]) {
  render(
    <EventManager
      devices={devices}
      events={events}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}

describe('EventManager with devices', () => {
  it('mostra o nome da TV de destino no badge do evento', () => {
    const dev = device('TV do Lab 3')
    renderManager([dev], [makeEvent({ device_id: dev.id })])

    expect(screen.getByText('TV do Lab 3')).toBeInTheDocument()
  })

  it('mostra "Todo o campus" quando o evento não tem device_id', () => {
    renderManager([device('TV do Lab 3')], [makeEvent({ device_id: null })])

    expect(screen.getByText('Todo o campus')).toBeInTheDocument()
  })

  describe('readOnly (RBAC TV — nível `read`)', () => {
    it('oculta o botão "Novo Evento" e as ações de edição/exclusão', () => {
      render(
        <EventManager
          devices={[]}
          events={[makeEvent()]}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          readOnly
        />,
      )

      expect(screen.getByText('Evento A')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Novo Evento/ })).not.toBeInTheDocument()
      expect(document.querySelector('.lucide-pencil')).toBeNull()
      expect(document.querySelector('.lucide-trash-2')).toBeNull()
      expect(document.querySelector('.lucide-chevron-up')).toBeNull()
      expect(document.querySelector('.lucide-chevron-down')).toBeNull()
    })

    it('não abre formulário reordenando na auto-abertura nem mostra "Criar primeiro evento"', () => {
      render(
        <EventManager
          devices={[]}
          events={[]}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          readOnly
        />,
      )

      expect(screen.getByText('Nenhum evento cadastrado')).toBeInTheDocument()
      expect(screen.queryByText('Criar primeiro evento')).not.toBeInTheDocument()
    })
  })
})