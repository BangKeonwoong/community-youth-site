import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMeetup,
  deleteMeetup,
  listMeetups,
  toggleMeetupParticipation,
  updateMeetup,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const MEETUPS_QUERY_KEY = ['meetups']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useMeetupsPage() {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const meetupsQuery = useQuery({
    queryKey: [...MEETUPS_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listMeetups(profileQuery.data?.id || null),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createMeetup(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETUPS_QUERY_KEY })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ meetupId, payload }) => updateMeetup(meetupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETUPS_QUERY_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMeetup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETUPS_QUERY_KEY })
    },
  })

  const participationMutation = useMutation({
    mutationFn: (meetupId) => toggleMeetupParticipation(meetupId, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETUPS_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    meetups: meetupsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && meetupsQuery.isLoading && meetupsQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      meetupsQuery.error ||
      createMutation.error ||
      updateMutation.error ||
      deleteMutation.error ||
      participationMutation.error ||
      null,
    createMeetup: createMutation.mutateAsync,
    updateMeetup: updateMutation.mutateAsync,
    deleteMeetup: deleteMutation.mutateAsync,
    toggleParticipation: participationMutation.mutateAsync,
    isSubmitting:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      participationMutation.isPending,
  }
}
