import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPraiseRecommendation,
  deletePraiseRecommendation,
  listPraiseRecommendations,
  togglePraiseLike,
  updatePraiseRecommendation,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const PRAISE_QUERY_KEY = ['praise-recommendations']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

export function usePraisePage() {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const recommendationsQuery = useQuery({
    queryKey: [...PRAISE_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listPraiseRecommendations(profileQuery.data?.id || null),
    enabled: supabaseStatus.configured && profileQuery.isSuccess,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createPraiseRecommendation(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAISE_QUERY_KEY })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ recommendationId, payload }) => updatePraiseRecommendation(recommendationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAISE_QUERY_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePraiseRecommendation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAISE_QUERY_KEY })
    },
  })

  const likeMutation = useMutation({
    mutationFn: (recommendationId) => togglePraiseLike(recommendationId, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAISE_QUERY_KEY })
    },
  })

  return {
    supabaseStatus,
    profile: profileQuery.data,
    recommendations: recommendationsQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (supabaseStatus.configured &&
        recommendationsQuery.isLoading &&
        recommendationsQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      recommendationsQuery.error ||
      createMutation.error ||
      updateMutation.error ||
      deleteMutation.error ||
      likeMutation.error ||
      null,
    createRecommendation: createMutation.mutateAsync,
    updateRecommendation: updateMutation.mutateAsync,
    deleteRecommendation: deleteMutation.mutateAsync,
    toggleLike: likeMutation.mutateAsync,
    isSubmitting:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      likeMutation.isPending,
  }
}
