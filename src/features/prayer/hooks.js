import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPrayerRequest,
  deletePrayerRequest,
  listPrayerRequests,
  togglePrayerSupport,
  updatePrayerRequest,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const PRAYER_QUERY_KEY = ['prayer-requests']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function usePrayerPage() {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const requestsQuery = useQuery({
    queryKey: [...PRAYER_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listPrayerRequests(profileQuery.data?.id || null),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createPrayerRequest(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAYER_QUERY_KEY })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ requestId, payload }) => updatePrayerRequest(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAYER_QUERY_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePrayerRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAYER_QUERY_KEY })
    },
  })

  const supportMutation = useMutation({
    mutationFn: (requestId) => togglePrayerSupport(requestId, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAYER_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    requests: requestsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && requestsQuery.isLoading && requestsQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      requestsQuery.error ||
      createMutation.error ||
      updateMutation.error ||
      deleteMutation.error ||
      supportMutation.error ||
      null,
    createRequest: createMutation.mutateAsync,
    updateRequest: updateMutation.mutateAsync,
    deleteRequest: deleteMutation.mutateAsync,
    toggleSupport: supportMutation.mutateAsync,
    isSubmitting:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      supportMutation.isPending,
  }
}
