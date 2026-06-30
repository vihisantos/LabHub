import { Outlet } from 'react-router-dom'
import { BackgroundAI } from '../components/BackgroundAI'
import { Navbar } from '../components/Navbar'
import { PushNotificationButton } from '../components/PushNotificationButton'

export function ReservaLabLayout() {
  return (
    <>
      <BackgroundAI />
      <Navbar />
      <main>
        <Outlet />
      </main>
      <PushNotificationButton />
    </>
  )
}
