import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { BackgroundAI } from '../components/BackgroundAI'
import { Navbar } from '../components/Navbar'
import { PushNotificationButton } from '../components/PushNotificationButton'

export function ReservaLabLayout() {
  useEffect(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.remove('dim')
  }, [])

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
