import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createGracePost,
  deleteGracePost,
  listGracePosts,
  toggleGraceLike,
  updateGracePost,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const GRACE_QUERY_KEY = ['grace-posts']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function useGracePage() {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const postsQuery = useQuery({
    queryKey: [...GRACE_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listGracePosts(profileQuery.data?.id || null),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createGracePost(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRACE_QUERY_KEY })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ postId, payload }) => updateGracePost(postId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRACE_QUERY_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGracePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRACE_QUERY_KEY })
    },
  })

  const likeMutation = useMutation({
    mutationFn: (postId) => toggleGraceLike(postId, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRACE_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    posts: postsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured && postsQuery.isLoading && postsQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      postsQuery.error ||
      createMutation.error ||
      updateMutation.error ||
      deleteMutation.error ||
      likeMutation.error ||
      null,
    createPost: createMutation.mutateAsync,
    updatePost: updateMutation.mutateAsync,
    deletePost: deleteMutation.mutateAsync,
    toggleLike: likeMutation.mutateAsync,
    isSubmitting:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      likeMutation.isPending,
  }
}
