import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import LoadingState from '../components/common/LoadingState'
import { getCurrentProfile } from '../features/profile/api'

const PROFILE_QUERY_KEY = ['profile']

function RequireAdmin({ children }) {
  const location = useLocation()
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  if (profileQuery.isLoading) {
    return <LoadingState title="권한 확인 중..." description="관리자 권한을 확인하고 있습니다." />
  }

  if (profileQuery.data?.role !== 'admin') {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  return children ?? <Outlet />
}

export default RequireAdmin
