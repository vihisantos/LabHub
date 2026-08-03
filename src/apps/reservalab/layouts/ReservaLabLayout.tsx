import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { BackgroundAI } from '../components/BackgroundAI'
import { Navbar } from '../components/Navbar'
import { PushNotificationButton } from '../components/PushNotificationButton'
import { useAppAccess } from '../../../core/permissions/usePermissions'

export function ReservaLabLayout() {
  const location = useLocation()
  const { getLevel } = useAppAccess()

  useEffect(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.remove('dim')
  }, [])

  // Cargo com acesso 'dash' vê somente o dashboard (verificação de quantidades)
  if (
    getLevel('reservalab') === 'dash'
    && (location.pathname === '/reservalab' || location.pathname === '/reservalab/')
  ) {
    return <Navigate to="/reservalab/dashboard" replace />
  }

  return (
    <>
      <BackgroundAI />
      <Navbar />
      <main style={{ overflowX: 'hidden' }}>
        <Outlet />
      </main>
      <PushNotificationButton />
    </>
  )
}
