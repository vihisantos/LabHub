import { useCallback } from 'react'
import { useNavigate, type To, type NavigateOptions } from 'react-router-dom'

export function useNavigateWithTransition() {
  const navigate = useNavigate()

  const navigateWithTransition = useCallback(
    (to: To, options?: NavigateOptions) => {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          navigate(to, options)
        })
      } else {
        navigate(to, options)
      }
    },
    [navigate],
  )

  return navigateWithTransition
}
