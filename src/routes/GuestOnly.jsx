import { Navigate, Outlet } from 'react-router-dom'
import LoadingState from '../components/common/LoadingState'
import { useAuth } from '../hooks/useAuth'

function GuestOnly({ children }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingState title="이동 중..." description="인증 상태를 확인하고 있습니다." />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children ?? <Outlet />
}

export default GuestOnly
