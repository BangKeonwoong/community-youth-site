import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPostComment,
  listPostComments,
  softDeletePostComment,
  subscribePostComments,
  updatePostComment,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const POST_COMMENTS_QUERY_KEY = ['post-comments']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

function normalizePostType(postType) {
  return String(postType || '').trim().toLowerCase()
}

function normalizePostId(postId) {
  const value = Number(postId)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function getPostCommentsQueryKey(postType, postId) {
  return [...POST_COMMENTS_QUERY_KEY, normalizePostType(postType), normalizePostId(postId)]
}

export function usePostComments({ postType, postId, enabled = true, realtime = true } = {}) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()
  const safePostType = normalizePostType(postType)
  const safePostId = normalizePostId(postId)

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const commentsQueryKey = getPostCommentsQueryKey(safePostType, safePostId)
  const isQueryEnabled =
    Boolean(enabled) &&
    supabaseStatus.configured &&
    profileQuery.isSuccess &&
    Boolean(safePostType) &&
    Boolean(safePostId)

  const commentsQuery = useQuery({
    queryKey: commentsQueryKey,
    queryFn: () =>
      listPostComments({
        postType: safePostType,
        postId: safePostId,
        currentProfileId: profileQuery.data?.id || null,
      }),
    enabled: isQueryEnabled,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createPostComment(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey, exact: true })
    },
  })

  const updateMutation = useMutation({
    mutationFn: updatePostComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey, exact: true })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: softDeletePostComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey, exact: true })
    },
  })

  useEffect(() => {
    if (!supabaseStatus.configured || !realtime || !isQueryEnabled) {
      return undefined
    }

    const unsubscribe = subscribePostComments({
      postType: safePostType,
      postId: safePostId,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: commentsQueryKey, exact: true })
      },
    })

    return () => {
      unsubscribe?.()
    }
  }, [
    commentsQueryKey,
    isQueryEnabled,
    queryClient,
    realtime,
    safePostId,
    safePostType,
    supabaseStatus.configured,
  ])

  return {
    supabaseStatus,
    profile: profileQuery.data,
    comments: commentsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (isQueryEnabled && commentsQuery.isLoading && commentsQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      commentsQuery.error ||
      createMutation.error ||
      updateMutation.error ||
      deleteMutation.error ||
      null,
    createComment: createMutation.mutateAsync,
    updateComment: updateMutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  }
}
