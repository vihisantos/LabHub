import { describe, it, expect } from 'vitest'
import { buildUserEmail } from '../LoginPage'

describe('buildUserEmail', () => {
  it('mantém o ponto no username', () => {
    expect(buildUserEmail('vitor.santos')).toBe('vitor.santos@labhub.com')
  })

  it('mantém hífen e remove caracteres inválidos', () => {
    expect(buildUserEmail('maria-ana!@#')).toBe('maria-ana@labhub.com')
  })

  it('normaliza para minúsculas', () => {
    expect(buildUserEmail('VITOR.Santos')).toBe('vitor.santos@labhub.com')
  })

  it('aceita username simples', () => {
    expect(buildUserEmail('campuspira')).toBe('campuspira@labhub.com')
  })
})
