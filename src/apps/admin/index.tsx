import { Routes, Route } from 'react-router-dom'
import { AdminLayout } from './layouts/AdminLayout'
import { AdminDashboard } from './pages/AdminDashboard'
import { UsersPage } from './pages/UsersPage'
import { RolesPage } from './pages/RolesPage'
import { WorkspacesPage } from './pages/WorkspacesPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProfilePage } from './pages/ProfilePage'
import { NotificationsPage } from './pages/NotificationsPage'
import { BackupsPage } from './pages/BackupsPage'

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
