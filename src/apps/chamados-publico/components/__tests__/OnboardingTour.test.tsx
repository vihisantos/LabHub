import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingTour, type TourStep } from '../OnboardingTour'

function makeSteps(): TourStep[] {
  return [
    {
      key: 'a',
      target: () => document.getElementById('campo-a'),
      title: 'Escolha a sala',
      description: 'Selecione onde você está.',
    },
    {
      key: 'b',
      target: () => document.getElementById('campo-b'),
      title: 'Descreva o problema',
      description: 'Quanto mais detalhe, melhor.',
    },
  ]
}

beforeEach(() => {
  localStorage.clear()
})

describe('OnboardingTour', () => {
  it('mostra o primeiro passo', () => {
    document.body.innerHTML = '<div id="campo-a">A</div>'
    render(<OnboardingTour steps={makeSteps()} onClose={() => {}} />)

    expect(screen.getByText('Passo 1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Escolha a sala')).toBeInTheDocument()
    expect(screen.getByText('Próximo')).toBeInTheDocument()
    expect(screen.queryByText('Anterior')).not.toBeInTheDocument()
  })

  it('avança para o próximo passo', () => {
    document.body.innerHTML = '<div id="campo-a">A</div><div id="campo-b">B</div>'
    render(<OnboardingTour steps={makeSteps()} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Próximo'))
    expect(screen.getByText('Passo 2 de 2')).toBeInTheDocument()
    expect(screen.getByText('Descreva o problema')).toBeInTheDocument()
    expect(screen.getByText('Anterior')).toBeInTheDocument()
  })

  it('volta com o botão Anterior', () => {
    document.body.innerHTML = '<div id="campo-a">A</div><div id="campo-b">B</div>'
    render(<OnboardingTour steps={makeSteps()} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Anterior'))
    expect(screen.getByText('Escolha a sala')).toBeInTheDocument()
  })

  it('conclui no último passo e marca o tour como feito', () => {
    document.body.innerHTML = '<div id="campo-a">A</div><div id="campo-b">B</div>'
    const onClose = vi.fn()
    render(<OnboardingTour steps={makeSteps()} onClose={onClose} />)

    fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Entendi'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('labhub_chamados_tour_done')).toBe('1')
  })

  it('fecha pelo botão X', () => {
    document.body.innerHTML = '<div id="campo-a">A</div>'
    const onClose = vi.fn()
    render(<OnboardingTour steps={makeSteps()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Fechar tour'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
