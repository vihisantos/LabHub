import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingOverlay, hasCompletedOnboarding, completeOnboarding } from '../OnboardingOverlay'

describe('OnboardingOverlay', () => {
  it('renderiza o primeiro passo com o nome do usuário', () => {
    render(<OnboardingOverlay open userName="Vitor Santos" onFinish={vi.fn()} />)
    expect(screen.getByText(/Olá, Vitor!/)).toBeInTheDocument()
    expect(screen.getByText('Continuar')).toBeInTheDocument()
  })

  it('não renderiza quando fechado', () => {
    render(<OnboardingOverlay open={false} userName="Vitor" onFinish={vi.fn()} />)
    expect(screen.queryByText('Pular')).not.toBeInTheDocument()
  })

  it('avança entre passos e finaliza no último', () => {
    const onFinish = vi.fn()
    render(<OnboardingOverlay open userName="Vitor" onFinish={onFinish} />)
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText('Continuar'))
    }
    expect(screen.getByText('Começar!')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Começar!'))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('completa via onFinish e registra no storage', () => {
    localStorage.clear()
    expect(hasCompletedOnboarding('user-1')).toBe(false)
    completeOnboarding('user-1')
    expect(hasCompletedOnboarding('user-1')).toBe(true)
  })
})
