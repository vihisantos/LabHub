import { createContext, useContext, useState, type ReactNode } from 'react'

interface FocusModeContextValue {
  focusMode: boolean
  toggleFocusMode: () => void
}

const FocusModeContext = createContext<FocusModeContextValue>({ focusMode: false, toggleFocusMode: () => {} })

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusMode] = useState(false)

  function toggleFocusMode() {
    setFocusMode((prev) => !prev)
  }

  return (
    <FocusModeContext.Provider value={{ focusMode, toggleFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  )
}

export function useFocusMode() {
  return useContext(FocusModeContext)
}
