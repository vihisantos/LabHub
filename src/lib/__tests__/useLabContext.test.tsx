import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabProvider, useActiveLab } from '../useLabContext'

function TestHarness() {
  const { activeLab } = useActiveLab()
  return <span data-testid="active-lab">{activeLab ?? 'null'}</span>
}

function renderProvider() {
  return render(
    <LabProvider>
      <TestHarness />
    </LabProvider>,
  )
}

describe('useLabContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renderiza children', () => {
    renderProvider()
    expect(screen.getByTestId('active-lab')).toHaveTextContent('null')
  })

  it('lê activeLab do localStorage como estado inicial', () => {
    localStorage.setItem('labhub_active_lab', 'lab-fisica')
    renderProvider()
    expect(screen.getByTestId('active-lab')).toHaveTextContent('lab-fisica')
  })

  it('não quebra quando localStorage lança SecurityError no initializer', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Failed to read localStorage', 'SecurityError')
    })

    expect(() => renderProvider()).not.toThrow()
    expect(screen.getByTestId('active-lab')).toHaveTextContent('null')

    spy.mockRestore()
  })

  it('não quebra quando localStorage lança SecurityError no setActiveLab', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Failed to write localStorage', 'SecurityError')
    })

    expect(() => renderProvider()).not.toThrow()

    spy.mockRestore()
  })
})
