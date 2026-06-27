beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
