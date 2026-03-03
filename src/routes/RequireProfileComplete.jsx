import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import LoadingState from '../components/common/LoadingState'
import { getCurrentProfile, isProfileComplete } from '../features/profile/api'

const PROFILE_QUERY_KEY = ['profile']

function RequireProfileComplete({ children }) {
  const location = useLocation()
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  if (profileQuery.isLoading) {
    return <LoadingState title="프로필 확인 중..." description="필수 정보를 확인하고 있습니다." />
  }

  if (!isProfileComplete(profileQuery.data)) {
    return <Navigate to="/profile-complete" replace state={{ from: location }} />
  }

  return children ?? <Outlet />
}

export default RequireProfileComplete
