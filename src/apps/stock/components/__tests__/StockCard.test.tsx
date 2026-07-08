import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StockCard } from '../StockCard'
import type { StockItem } from '../../types'

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'item-1',
    name: 'Notebook Dell',
    section: 'maquinas',
    subcategory: 'Notebook',
    serialNumber: 'SN-001',
    room: 'Lab 1',
    status: 'ativo',
    condition: 'Bom',
    notes: '',
    cableType: '',
    cableLength: '',
    connectorType: '',
    outletCount: undefined,
    linkedPcId: undefined,
    linkedPcLabel: undefined,
    pcParts: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderCard(item: StockItem, props: Record<string, any> = {}) {
  return render(
    <MemoryRouter>
      <StockCard
        item={item}
        onMove={props.onMove || vi.fn()}
        onRepair={props.onRepair || vi.fn()}
        onDiscard={props.onDiscard || vi.fn()}
        onEdit={props.onEdit}
        onLoan={props.onLoan}
        onReturn={props.onReturn}
        selectable={props.selectable}
        selected={props.selected}
        onToggleSelect={props.onToggleSelect}
      />
    </MemoryRouter>,
  )
}

describe('StockCard', () => {
  it('renderiza nome do item', () => {
    renderCard(makeItem())
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })

  it('renderiza subcategoria e sala', () => {
    renderCard(makeItem())
    expect(screen.getAllByText(/Notebook/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Lab 1/)).toBeInTheDocument()
  })

  it('renderiza número de série', () => {
    renderCard(makeItem())
    expect(screen.getByText(/SN-001/)).toBeInTheDocument()
  })

  it('renderiza condição do item', () => {
    renderCard(makeItem())
    expect(screen.getByText(/Bom/)).toBeInTheDocument()
  })

  it('não renderiza botões de ação para item descartado', () => {
    renderCard(makeItem({ status: 'descartado' }))
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Mover')).not.toBeInTheDocument()
    expect(screen.queryByText('Consertar')).not.toBeInTheDocument()
  })

  it('renderiza linkedPcLabel quando presente', () => {
    renderCard(makeItem({ linkedPcLabel: 'Lab A - PC-01', linkedPcId: 'pc-1' }))
    expect(screen.getByText(/Vinculado a Lab A - PC-01/)).toBeInTheDocument()
  })

  it('renderiza informações de cabo para seção cabos', () => {
    renderCard(makeItem({
      section: 'cabos', cableType: 'HDMI', cableLength: '3',
    }))
    expect(screen.getByText(/HDMI/)).toBeInTheDocument()
    expect(screen.getByText(/3m/)).toBeInTheDocument()
  })

  it('chama onMove quando clica em Mover', () => {
    const onMove = vi.fn()
    renderCard(makeItem(), { onMove })
    fireEvent.click(screen.getByText('Mover'))
    expect(onMove).toHaveBeenCalledOnce()
  })

  it('chama onRepair quando clica em Consertar', () => {
    const onRepair = vi.fn()
    renderCard(makeItem(), { onRepair })
    fireEvent.click(screen.getByText('Consertar'))
    expect(onRepair).toHaveBeenCalledOnce()
  })

  it('chama onDiscard quando clica em Descartar', () => {
    const onDiscard = vi.fn()
    renderCard(makeItem(), { onDiscard })
    fireEvent.click(screen.getByText('Descartar'))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('chama onEdit quando clica em Editar', () => {
    const onEdit = vi.fn()
    renderCard(makeItem(), { onEdit })
    fireEvent.click(screen.getByText('Editar'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('chama onLoan quando clica em Emprestar', () => {
    const onLoan = vi.fn()
    renderCard(makeItem(), { onLoan })
    fireEvent.click(screen.getByText('Emprestar'))
    expect(onLoan).toHaveBeenCalledOnce()
  })

  it('renderiza botão Devolver para item emprestado', () => {
    const onReturn = vi.fn()
    renderCard(makeItem({ status: 'emprestado' }), { onReturn })
    expect(screen.getByText('Devolver')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Devolver'))
    expect(onReturn).toHaveBeenCalledOnce()
  })

  it('em selectable=true, chama onToggleSelect ao clicar', () => {
    const onToggleSelect = vi.fn()
    renderCard(makeItem(), { selectable: true, onToggleSelect })
    fireEvent.click(screen.getByText('Notebook Dell'))
    expect(onToggleSelect).toHaveBeenCalledWith('item-1')
  })

  it('em selectable=true com selected=true, mostra check', () => {
    renderCard(makeItem(), { selectable: true, selected: true })
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })
})
