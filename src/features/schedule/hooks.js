import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCommunityEvent,
  deleteCommunityEvent,
  getScheduleMonthData,
  updateCommunityEvent,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const SCHEDULE_MONTH_QUERY_KEY = ['schedule', 'month']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useSchedulePage({ year, month }) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const scheduleQuery = useQuery({
    queryKey: [...SCHEDULE_MONTH_QUERY_KEY, year, month, profileQuery.data?.id || 'anonymous'],
    queryFn: () => getScheduleMonthData({ year, month }),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const createEventMutation = useMutation({
    mutationFn: (payload) => createCommunityEvent(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULE_MONTH_QUERY_KEY })
    },
  })

  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, payload }) => updateCommunityEvent(eventId, payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULE_MONTH_QUERY_KEY })
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: (eventId) => deleteCommunityEvent(eventId, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULE_MONTH_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    isAdmin: profileQuery.data?.role === 'admin',
    scheduleMonth: scheduleQuery.data || null,
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && scheduleQuery.isLoading && scheduleQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      scheduleQuery.error ||
      createEventMutation.error ||
      updateEventMutation.error ||
      deleteEventMutation.error ||
      null,
    createEvent: createEventMutation.mutateAsync,
    updateEvent: updateEventMutation.mutateAsync,
    deleteEvent: deleteEventMutation.mutateAsync,
    isSubmitting: createEventMutation.isPending || updateEventMutation.isPending || deleteEventMutation.isPending,
  }
}
