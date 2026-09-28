import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { BackgroundAI } from '../components/BackgroundAI'
import { Navbar } from '../components/Navbar'
import { PushNotificationButton } from '../components/PushNotificationButton'
import { useModuleLevel } from '../../../core/permissions/useModuleVisibility'

export function ReservaLabLayout() {
  const location = useLocation()
  // RBAC 2.0 (F2-D-L): nível do módulo pela nova fonte, com `dash` preservado
  // (`ignoreDisabledApps` mantém o `getLevel` puro do legado; dentro do app o
  // `AppGuard` já tratou módulo desabilitado).
  const { level } = useModuleLevel('reservalab', { ignoreDisabledApps: true })

  // Tema: o sub app NÃO manipula as classes do <html> — o tema escolhido no
  // perfil (dark/dim/light, gerido pelo themeStore no app principal) manda aqui.

  // Cargo com acesso 'dash' vê somente o dashboard (verificação de quantidades)
  if (
    level === 'dash'
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
