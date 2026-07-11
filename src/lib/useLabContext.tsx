import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface LabContextValue {
  activeLab: string | null
  setActiveLab: (lab: string | null) => void
}

const LabContext = createContext<LabContextValue>({
  activeLab: null,
  setActiveLab: () => {},
})

export function LabProvider({ children }: { children: ReactNode }) {
  const [activeLab, setActiveLabState] = useState<string | null>(
    () => localStorage.getItem('labhub_active_lab'),
  )

  const setActiveLab = useCallback((lab: string | null) => {
    setActiveLabState(lab)
    if (lab) {
      localStorage.setItem('labhub_active_lab', lab)
    } else {
      localStorage.removeItem('labhub_active_lab')
    }
  }, [])

  return (
    <LabContext.Provider value={{ activeLab, setActiveLab }}>
      {children}
    </LabContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useActiveLab() {
  return useContext(LabContext)
}
