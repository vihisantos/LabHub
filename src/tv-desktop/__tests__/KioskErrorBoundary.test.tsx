import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KioskErrorBoundary } from '../KioskErrorBoundary'

function Bomb() {
  throw new Error('boom')
  return null
}

describe('KioskErrorBoundary', () => {
  it('captura erro e mostra fallback de recuperação', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <KioskErrorBoundary recoverMs={10} fallback={<span>fallback</span>}>
        <Bomb />
      </KioskErrorBoundary>,
    )
    expect(screen.getByText('fallback')).toBeTruthy()
    spy.mockRestore()
  })
})