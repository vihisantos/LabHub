import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SheetOrDialog } from '../SheetOrDialog'
import type { BreakpointState } from '../useBreakpoint'

const mockUseBreakpoint = vi.hoisted(() => vi.fn())

vi.mock('../useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}))

function setBp(bp: BreakpointState['bp']) {
  mockUseBreakpoint.mockReturnValue({
    bp,
    isCompact: bp === 'compact',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
    isWide: bp === 'wide',
  })
}

function renderSheet(props: Partial<Parameters<typeof SheetOrDialog>[0]> = {}) {
  return render(
    <SheetOrDialog open title="Vincular membro a gestor" onClose={() => {}} {...props}>
      <div>conteudo-unico</div>
    </SheetOrDialog>,
  )
}

describe('SheetOrDialog — mesmo conteúdo, enquadramento por faixa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBp('compact')
  })

  it('compact (jsdom default): BottomSheet com role=dialog e rótulo acessível', () => {
    setBp('compact')
    renderSheet()

    const dialog = screen.getByRole('dialog', { name: 'Vincular membro a gestor' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('conteudo-unico')).toBeInTheDocument()
  })

  it('tablet: mesma variante BottomSheet (mobile-first)', () => {
    setBp('tablet')
    renderSheet()

    expect(screen.getByRole('dialog', { name: 'Vincular membro a gestor' })).toBeInTheDocument()
    expect(screen.getByText('conteudo-unico')).toBeInTheDocument()
  })

  it('desktop: Dialog (Radix) com nome vindo do DialogTitle', () => {
    setBp('desktop')
    renderSheet()

    expect(screen.getByRole('dialog', { name: 'Vincular membro a gestor' })).toBeInTheDocument()
    expect(screen.getByText('conteudo-unico')).toBeInTheDocument()
  })

  it('wide: mesma variante Dialog', () => {
    setBp('wide')
    renderSheet()

    expect(screen.getByRole('dialog', { name: 'Vincular membro a gestor' })).toBeInTheDocument()
    expect(screen.getByText('conteudo-unico')).toBeInTheDocument()
  })

  it('role alertdialog é preservada nas DUAS faixas (destaques destrutivos)', () => {
    setBp('compact')
    const compactView = renderSheet({ role: 'alertdialog', title: 'Suspender membro?' })

    expect(screen.getByRole('alertdialog', { name: 'Suspender membro?' })).toBeInTheDocument()

    compactView.unmount()

    setBp('desktop')
    renderSheet({ role: 'alertdialog', title: 'Suspender membro?' })
    expect(screen.getByRole('alertdialog', { name: 'Suspender membro?' })).toBeInTheDocument()
  })

  it('descrição é exibida apenas na variante diálogo', () => {
    setBp('compact')
    const compactView = render(
      <SheetOrDialog open title="T" description="descricao-somente-desktop" onClose={() => {}}>
        <div>conteudo</div>
      </SheetOrDialog>,
    )
    expect(screen.queryByText('descricao-somente-desktop')).toBeNull()
    compactView.unmount()

    setBp('desktop')
    render(
      <SheetOrDialog open title="T" description="descricao-somente-desktop" onClose={() => {}}>
        <div>conteudo</div>
      </SheetOrDialog>,
    )
    expect(screen.getByText('descricao-somente-desktop')).toBeInTheDocument()
  })

  it('fechado: não renderiza nada em nenhuma faixa', () => {
    setBp('compact')
    renderSheet({ open: false })
    expect(screen.queryByText('conteudo-unico')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})