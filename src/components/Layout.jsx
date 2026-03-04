import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  CalendarDays,
  Users,
  Heart,
  BookOpen,
  Music,
  Cake,
  MessageSquare,
  LogOut,
  ShieldCheck,
  Menu,
} from 'lucide-react'
import ErrorBanner from './common/ErrorBanner'
import { getCurrentProfile } from '../features/profile/api'
import { useAuth } from '../hooks/useAuth'
import MobileMenu from './MobileMenu'

const PROFILE_QUERY_KEY = ['profile']
const BASE_NAV_ITEMS = [
  { name: '홈', path: '/', icon: Home },
  { name: '일정', path: '/schedule', icon: CalendarDays },
  { name: '생일', path: '/birthdays', icon: Cake },
  { name: '채팅', path: '/chat', icon: MessageSquare },
  { name: '메시지', path: '/messages', icon: MessageSquare },
  { name: '벙개', path: '/meetups', icon: Users },
  { name: '은혜', path: '/grace', icon: Heart },
  { name: '기도', path: '/prayer', icon: BookOpen },
  { name: '찬양', path: '/praise', icon: Music },
]

function Layout() {
  const location = useLocation()
  const { signOut } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const navItems =
    profileQuery.data?.role === 'admin'
      ? [...BASE_NAV_ITEMS, { name: '관리', path: '/admin', icon: ShieldCheck }]
      : BASE_NAV_ITEMS

  const handleSignOut = async () => {
    setLogoutError('')
    setIsSigningOut(true)

    const { error } = await signOut()
    if (error) {
      setLogoutError(error.message)
    }

    setIsSigningOut(false)
  }

  const PRIMARY_MOBILE_PATHS = ['/', '/schedule', '/chat', '/meetups']
  const mobilePrimaryItems = PRIMARY_MOBILE_PATHS.map((path) => navItems.find((item) => item.path === path)).filter(
    Boolean,
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <aside className="sidebar">
        <div style={{ marginBottom: '2rem', padding: '0 1rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--accent-primary)' }}>
            Youth
            <br />
            Community
          </h1>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon

            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive ? 'var(--accent-light)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <Icon size={20} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
          {logoutError && <ErrorBanner message={logoutError} />}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              color: 'var(--text-secondary)',
              fontWeight: '500',
              borderRadius: 'var(--radius-md)',
              opacity: isSigningOut ? 0.7 : 1,
            }}
          >
            <LogOut size={20} />
            {isSigningOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {mobilePrimaryItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon

          return (
            <Link key={item.path} to={item.path} className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={24} />
              <span>{item.name}</span>
            </Link>
          )
        })}
        <button className="bottom-nav-item" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu size={24} />
          <span>메뉴</span>
        </button>
      </nav>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navItems={navItems}
        isSigningOut={isSigningOut}
        handleSignOut={handleSignOut}
        logoutError={logoutError}
      />
    </div>
  )
}

export default Layout
