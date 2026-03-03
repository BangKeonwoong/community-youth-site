import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import AdminPage from './pages/AdminPage'
import Birthdays from './pages/Birthdays'
import Dashboard from './pages/Dashboard'
import GraceSharing from './pages/GraceSharing'
import Login from './pages/Login'
import Meetups from './pages/Meetups'
import Messages from './pages/Messages'
import PrayerRequests from './pages/PrayerRequests'
import ProfileComplete from './pages/ProfileComplete'
import PraiseRecommendations from './pages/PraiseRecommendations'
import Schedule from './pages/Schedule'
import SetPassword from './pages/SetPassword'
import GuestOnly from './routes/GuestOnly'
import RequireAdmin from './routes/RequireAdmin'
import RequireAuth from './routes/RequireAuth'
import RequireProfileComplete from './routes/RequireProfileComplete'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<SetPassword />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Layout />}>
            <Route path="profile-complete" element={<ProfileComplete />} />
            <Route element={<RequireProfileComplete />}>
              <Route index element={<Dashboard />} />
              <Route path="meetups" element={<Meetups />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="grace" element={<GraceSharing />} />
              <Route path="prayer" element={<PrayerRequests />} />
              <Route path="praise" element={<PraiseRecommendations />} />
              <Route path="birthdays" element={<Birthdays />} />
              <Route path="messages" element={<Messages />} />
              <Route
                path="admin"
                element={
                  <RequireAdmin>
                    <AdminPage />
                  </RequireAdmin>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
