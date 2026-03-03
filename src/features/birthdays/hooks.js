import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listUpcomingBirthdays, sendBirthdayMessage as sendBirthdayMessageApi } from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const BIRTHDAYS_QUERY_KEY = ['birthdays', 'upcoming']
const MESSAGES_QUERY_KEY = ['birthday-messages']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useBirthdaysPage(days = 7) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const birthdaysQuery = useQuery({
    queryKey: [...BIRTHDAYS_QUERY_KEY, days],
    queryFn: () => listUpcomingBirthdays(days),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const sendMutation = useMutation({
    mutationFn: ({ receiverId, content }) => sendBirthdayMessageApi(receiverId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BIRTHDAYS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: MESSAGES_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    birthdays: birthdaysQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && birthdaysQuery.isLoading && birthdaysQuery.fetchStatus !== 'idle'),
    error: profileQuery.error || birthdaysQuery.error || sendMutation.error || null,
    sendBirthdayMessage: sendMutation.mutateAsync,
    isSubmitting: sendMutation.isPending,
  }
}
