import { Navigate, Outlet, useLocation } from 'react-router-dom'
import LoadingState from '../components/common/LoadingState'
import { useAuth } from '../hooks/useAuth'

function RequireAuth({ children }) {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingState title="인증 확인 중..." description="잠시만 기다려주세요." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children ?? <Outlet />
}

export default RequireAuth
