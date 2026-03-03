import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listMessageRecipients,
  listMessages,
  markBirthdayMessageRead as markBirthdayMessageReadApi,
  sendMessage as sendMessageApi,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const MESSAGES_QUERY_KEY = ['birthday-messages']
const MESSAGE_RECIPIENTS_QUERY_KEY = ['message-recipients']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

function toScope(value) {
  return value === 'outbox' ? 'outbox' : 'inbox'
}

export function useMessagesPage({ scope = 'inbox', includeAll = false } = {}) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()
  const safeScope = toScope(scope)

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const isAdmin = profileQuery.data?.role === 'admin'
  const shouldIncludeAll = Boolean(includeAll && isAdmin)

  const messagesQuery = useQuery({
    queryKey: [
      ...MESSAGES_QUERY_KEY,
      safeScope,
      shouldIncludeAll,
      shouldIncludeAll ? 'all' : profileQuery.data?.id || 'anonymous',
    ],
    queryFn: () =>
      listMessages({
        scope: safeScope,
        profileId: profileQuery.data?.id || null,
        includeAll: shouldIncludeAll,
        isAdmin,
      }),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const recipientsQuery = useQuery({
    queryKey: [...MESSAGE_RECIPIENTS_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listMessageRecipients({ excludeProfileId: profileQuery.data?.id || null }),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
    staleTime: 2 * 60 * 1000,
  })

  const markReadMutation = useMutation({
    mutationFn: markBirthdayMessageReadApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MESSAGES_QUERY_KEY })
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: (payload) => sendMessageApi(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MESSAGES_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    isAdmin,
    messages: messagesQuery.data || [],
    recipients: recipientsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured &&
        ((messagesQuery.isLoading && messagesQuery.fetchStatus !== 'idle') ||
          (recipientsQuery.isLoading && recipientsQuery.fetchStatus !== 'idle'))),
    error:
      profileQuery.error ||
      messagesQuery.error ||
      recipientsQuery.error ||
      markReadMutation.error ||
      sendMessageMutation.error ||
      null,
    markBirthdayMessageRead: markReadMutation.mutateAsync,
    sendMessage: sendMessageMutation.mutateAsync,
    isSubmitting: markReadMutation.isPending || sendMessageMutation.isPending,
  }
}
