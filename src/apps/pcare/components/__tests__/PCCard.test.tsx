import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PCCard } from '../PCCard'
import type { PC } from '../../types'

const mockPC: PC = {
  id: 'pc-1',
  labName: 'Lab A',
  pcNumber: 'PC-001',
  assetTag: 'TAG-001',
  roomLocation: 'Sala 101',
  specs: { cpu: 'i5', ram: '8GB', storage: '256GB' },
  config: { osType: 'windows11', osVersion: '24H2', osEdition: 'enterprise', pcType: 'academico', domain: 'animaedu.intranet' },
  cleaningStatus: 'done',
  restorationStatus: 'in_progress',
  softwareInstalled: [],
  partsReplaced: [],
  observations: 'Observe',
  photos: [],
  lastIntervention: null,
  createdAt: { seconds: 1000, nanoseconds: 0 } as any,
  updatedAt: { seconds: 1000, nanoseconds: 0 } as any,
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('PCCard', () => {
  it('renderiza dados do PC', () => {
    renderWithRouter(<PCCard pc={mockPC} />)
    expect(screen.getByText('TAG-001')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('i5')).toBeInTheDocument()
  })

  it('renderiza input checkbox em modo selecao', () => {
    renderWithRouter(<PCCard pc={mockPC} selectable={true} selected={false} onToggleSelect={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('renderiza checkbox marcado quando selecionado', () => {
    renderWithRouter(<PCCard pc={mockPC} selectable={true} selected={true} onToggleSelect={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('chama onToggleSelect ao clicar no checkbox', () => {
    const onToggle = vi.fn()
    renderWithRouter(<PCCard pc={mockPC} selectable={true} selected={false} onToggleSelect={onToggle} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('pc-1')
  })
})
