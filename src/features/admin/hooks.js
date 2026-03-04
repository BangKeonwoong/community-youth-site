import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInviteCode as createInviteCodeApi,
  deleteModerationPost as deleteModerationPostApi,
  getSignupPolicy as getSignupPolicyApi,
  listInviteCodes,
  listModerationPosts,
  listProfiles,
  revokeInviteCode as revokeInviteCodeApi,
  setNoInviteSignupUntil as setNoInviteSignupUntilApi,
  updateProfileAdminStatus as updateProfileAdminStatusApi,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const INVITE_CODES_QUERY_KEY = ['admin', 'invite-codes']
const SIGNUP_POLICY_QUERY_KEY = ['admin', 'signup-policy']
const ADMIN_PROFILES_QUERY_KEY = ['admin', 'profiles']
const MODERATION_POSTS_QUERY_KEY = ['admin', 'moderation-posts']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useAdminPage() {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const isAdmin = profileQuery.data?.role === 'admin'
  const isEnabled = supabaseStatus.configured && profileQuery.isSuccess && isAdmin

  const inviteCodesQuery = useQuery({
    queryKey: INVITE_CODES_QUERY_KEY,
    queryFn: listInviteCodes,
    enabled: isEnabled,
  })

  const signupPolicyQuery = useQuery({
    queryKey: SIGNUP_POLICY_QUERY_KEY,
    queryFn: getSignupPolicyApi,
    enabled: isEnabled,
  })

  const profilesQuery = useQuery({
    queryKey: ADMIN_PROFILES_QUERY_KEY,
    queryFn: listProfiles,
    enabled: isEnabled,
  })

  const moderationPostsQuery = useQuery({
    queryKey: MODERATION_POSTS_QUERY_KEY,
    queryFn: listModerationPosts,
    enabled: isEnabled,
  })

  const createInviteCodeMutation = useMutation({
    mutationFn: (payload) => createInviteCodeApi(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVITE_CODES_QUERY_KEY })
    },
  })

  const revokeInviteCodeMutation = useMutation({
    mutationFn: revokeInviteCodeApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVITE_CODES_QUERY_KEY })
    },
  })

  const setNoInviteSignupUntilMutation = useMutation({
    mutationFn: (payload) => setNoInviteSignupUntilApi(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SIGNUP_POLICY_QUERY_KEY })
    },
  })

  const updateAdminStatusMutation = useMutation({
    mutationFn: ({ profileId, isAdmin: nextIsAdmin }) =>
      updateProfileAdminStatusApi(profileId, nextIsAdmin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_PROFILES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
    },
  })

  const deleteModerationPostMutation = useMutation({
    mutationFn: ({ type, id }) => deleteModerationPostApi(type, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODERATION_POSTS_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    inviteCodes: inviteCodesQuery.data || [],
    profiles: profilesQuery.data || [],
    posts: moderationPostsQuery.data || [],
    moderationPosts: moderationPostsQuery.data || [],
    isAdmin,
    isLoading:
      profileQuery.isLoading ||
      (isEnabled &&
        ((inviteCodesQuery.isLoading && inviteCodesQuery.fetchStatus !== 'idle') ||
          (signupPolicyQuery.isLoading && signupPolicyQuery.fetchStatus !== 'idle') ||
          (profilesQuery.isLoading && profilesQuery.fetchStatus !== 'idle') ||
          (moderationPostsQuery.isLoading && moderationPostsQuery.fetchStatus !== 'idle'))),
    error:
      profileQuery.error ||
      inviteCodesQuery.error ||
      signupPolicyQuery.error ||
      profilesQuery.error ||
      moderationPostsQuery.error ||
      createInviteCodeMutation.error ||
      revokeInviteCodeMutation.error ||
      setNoInviteSignupUntilMutation.error ||
      updateAdminStatusMutation.error ||
      deleteModerationPostMutation.error ||
      null,
    signupPolicy: signupPolicyQuery.data || null,
    createInviteCode: createInviteCodeMutation.mutateAsync,
    revokeInviteCode: revokeInviteCodeMutation.mutateAsync,
    setNoInviteSignupUntil: setNoInviteSignupUntilMutation.mutateAsync,
    updateProfileAdminStatus: updateAdminStatusMutation.mutateAsync,
    deleteModerationPost: deleteModerationPostMutation.mutateAsync,
    isSubmitting:
      createInviteCodeMutation.isPending ||
      revokeInviteCodeMutation.isPending ||
      setNoInviteSignupUntilMutation.isPending ||
      updateAdminStatusMutation.isPending ||
      deleteModerationPostMutation.isPending,
  }
}
