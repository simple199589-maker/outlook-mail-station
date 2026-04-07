import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { getAdminToken } from '@/lib/api'
import { LoginPage } from '@/pages/LoginPage'
import { MailStationPage } from '@/pages/MailStationPage'
import { PublicSharePage } from '@/pages/PublicSharePage'
import { UserManagementPage } from '@/pages/UserManagementPage'

/**
 * AI by zb: 定义新站点的前端路由入口。
 */
function ProtectedApp() {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/admin/auth/status')
      .then((response) => response.json())
      .then((data) => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false))
  }, [])

  if (enabled === null) {
    return null
  }

  if (enabled && !getAdminToken()) {
    return <Navigate to="/login" replace />
  }

  return <Routes>
    <Route path="/" element={<MailStationPage />} />
    <Route path="/users" element={<UserManagementPage />} />
  </Routes>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<ProtectedApp />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<PublicSharePage />} />
      </Routes>
    </BrowserRouter>
  )
}
