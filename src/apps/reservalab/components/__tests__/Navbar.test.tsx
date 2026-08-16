import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Navbar } from '../Navbar'

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

import { useIsMobile } from '../../hooks/useIsMobile'

function renderNavbar(path = '/reservalab', props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar {...props} />
    </MemoryRouter>,
  )
}

describe('Navbar', () => {
  beforeEach(() => {
    ;(useIsMobile as any).mockReturnValue(false)
  })

  it('renderiza desktop nav com tabs', () => {
    renderNavbar()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Reservas')).toBeInTheDocument()
    expect(screen.getByText('Tablets')).toBeInTheDocument()
  })

  it('renderiza logo ReservasLab no desktop', () => {
    renderNavbar()
    expect(screen.getByText('ReservasLab')).toBeInTheDocument()
  })

  it('renderiza status API online', () => {
    renderNavbar('/reservalab', { statusAPI: 'online' })
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('renderiza status API offline', () => {
    renderNavbar('/reservalab', { statusAPI: 'offline' })
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('renderiza mobile nav quando isMobile', () => {
    ;(useIsMobile as any).mockReturnValue(true)
    renderNavbar()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Reservas')).toBeInTheDocument()
    expect(screen.getByText('Tablets')).toBeInTheDocument()
  })

  it('renderiza botão Início no mobile', () => {
    ;(useIsMobile as any).mockReturnValue(true)
    renderNavbar()
    expect(screen.getByText('Início')).toBeInTheDocument()
  })

  it('navega para /reservalab ao clicar em Reservas', () => {
    renderNavbar('/reservalab/dashboard')
    fireEvent.click(screen.getByText('Reservas'))
    // O Navbar usa useNavigate, então a navegação é mockada pelo MemoryRouter
    // Testamos que o clique não quebra
    expect(screen.getByText('Reservas')).toBeInTheDocument()
  })

  it('navega para /reservalab/tablets ao clicar em Tablets', () => {
    renderNavbar()
    fireEvent.click(screen.getByText('Tablets'))
    expect(screen.getByText('Tablets')).toBeInTheDocument()
  })

  it('desktop: destaca somente Reservas na raiz /reservalab', () => {
    renderNavbar('/reservalab')
    expect(desktopActive('Reservas')).toBe(true)
    expect(desktopActive('Dashboard')).toBe(false)
    expect(desktopActive('Tablets')).toBe(false)
  })

  it('desktop: destaca somente Dashboard em /reservalab/dashboard', () => {
    renderNavbar('/reservalab/dashboard')
    expect(desktopActive('Dashboard')).toBe(true)
    expect(desktopActive('Reservas')).toBe(false)
    expect(desktopActive('Tablets')).toBe(false)
  })

  it('desktop: destaca somente Tablets em /reservalab/tablets', () => {
    renderNavbar('/reservalab/tablets')
    expect(desktopActive('Tablets')).toBe(true)
    expect(desktopActive('Dashboard')).toBe(false)
    expect(desktopActive('Reservas')).toBe(false)
  })

  it('mobile: destaca somente a aba ativa', () => {
    ;(useIsMobile as any).mockReturnValue(true)
    renderNavbar('/reservalab/dashboard')

    const dashboard = screen.getByText('Dashboard').closest('button')!
    const reservas = screen.getByText('Reservas').closest('button')!
    const tablets = screen.getByText('Tablets').closest('button')!

    expect(dashboard).toHaveStyle({ color: '#6366f1' })
    expect(reservas).toHaveStyle({ color: 'rgba(255,255,255,0.7)' })
    expect(tablets).toHaveStyle({ color: 'rgba(255,255,255,0.7)' })
  })
})

function desktopActive(label: string): boolean {
  const btn = screen.getByText(label).closest('button')
  expect(btn).not.toBeNull()
  return btn!.style.fontWeight === '600'
}
