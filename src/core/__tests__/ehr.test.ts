import { describe, it, expect } from 'vitest'
import { genId } from '../ehr'

describe('genId', () => {
  it('should generate ID with correct prefix', () => {
    const id = genId('own-')
    expect(id.startsWith('own-')).toBe(true)
  })

  it('should generate ID with pac- prefix', () => {
    const id = genId('pac-')
    expect(id.startsWith('pac-')).toBe(true)
  })

  it('should generate ID with cons- prefix', () => {
    const id = genId('cons-')
    expect(id.startsWith('cons-')).toBe(true)
  })

  it('should generate unique IDs', () => {
    const id1 = genId('own-')
    const id2 = genId('own-')
    expect(id1).not.toBe(id2)
  })

  it('should include a timestamp component', () => {
    const id = genId('own-')
    // Format: prefix + timestamp + random chars
    expect(id.length).toBeGreaterThan('own-'.length + 10)
  })
})
