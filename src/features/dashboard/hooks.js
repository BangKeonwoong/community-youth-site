import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardData } from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const DASHBOARD_QUERY_KEY = ['dashboard']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useDashboardPage() {
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const dashboardQuery = useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => getDashboardData(profileQuery.data?.id || null),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    dashboard: dashboardQuery.data || null,
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && dashboardQuery.isLoading && dashboardQuery.fetchStatus !== 'idle'),
    error: profileQuery.error || dashboardQuery.error || null,
  }
}
