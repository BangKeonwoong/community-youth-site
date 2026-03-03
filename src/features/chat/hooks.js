import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createChatRoom,
  deleteChatRoom,
  listChatMessages,
  listChatRooms,
  sendChatMessage,
  softDeleteChatMessage,
  subscribeChatMessages,
  subscribeChatRooms,
  updateChatMessage,
} from './api'
import { getCurrentProfile, getSupabaseStatus } from '../profile/api'

const PROFILE_QUERY_KEY = ['profile']
const CHAT_ROOMS_QUERY_KEY = ['chat-rooms']
const CHAT_MESSAGES_QUERY_KEY = ['chat-messages']

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

function normalizeRoomId(roomId) {
  const value = Number(roomId)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function getChatMessagesQueryKey(roomId) {
  return [...CHAT_MESSAGES_QUERY_KEY, normalizeRoomId(roomId)]
}

export function useChatPage({ selectedRoomId = null } = {}) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()
  const safeSelectedRoomId = normalizeRoomId(selectedRoomId)

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const isEnabled = supabaseStatus.configured && profileQuery.isSuccess

  const roomsQuery = useQuery({
    queryKey: [...CHAT_ROOMS_QUERY_KEY, profileQuery.data?.id || 'anonymous'],
    queryFn: () => listChatRooms(profileQuery.data?.id || null),
    enabled: isEnabled,
  })

  const rooms = useMemo(() => roomsQuery.data || [], [roomsQuery.data])
  const activeRoomId = useMemo(() => {
    if (rooms.length === 0) {
      return null
    }

    if (safeSelectedRoomId && rooms.some((room) => room.id === safeSelectedRoomId)) {
      return safeSelectedRoomId
    }

    return normalizeRoomId(rooms[0]?.id)
  }, [rooms, safeSelectedRoomId])

  const messagesQueryKey = getChatMessagesQueryKey(activeRoomId)
  const messagesQuery = useQuery({
    queryKey: [...messagesQueryKey, profileQuery.data?.id || 'anonymous'],
    queryFn: () =>
      listChatMessages({
        roomId: activeRoomId,
        currentProfileId: profileQuery.data?.id || null,
      }),
    enabled: isEnabled && Boolean(activeRoomId),
  })

  const createRoomMutation = useMutation({
    mutationFn: (payload) => createChatRoom(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
    },
  })

  const deleteRoomMutation = useMutation({
    mutationFn: deleteChatRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: (payload) => sendChatMessage(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
    },
  })

  const updateMessageMutation = useMutation({
    mutationFn: updateChatMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
    },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: softDeleteChatMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
    },
  })

  useEffect(() => {
    if (!supabaseStatus.configured || !isEnabled) {
      return undefined
    }

    const unsubscribe = subscribeChatRooms(() => {
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
    })

    return () => {
      unsubscribe?.()
    }
  }, [isEnabled, queryClient, supabaseStatus.configured])

  useEffect(() => {
    if (!supabaseStatus.configured || !isEnabled || !activeRoomId) {
      return undefined
    }

    const unsubscribe = subscribeChatMessages({
      roomId: activeRoomId,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
        queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
      },
    })

    return () => {
      unsubscribe?.()
    }
  }, [activeRoomId, isEnabled, queryClient, supabaseStatus.configured])

  return {
    supabaseStatus,
    profile: profileQuery.data,
    rooms,
    activeRoomId,
    messages: messagesQuery.data || [],
    isLoading:
      profileQuery.isLoading ||
      (isEnabled && roomsQuery.isLoading && roomsQuery.fetchStatus !== 'idle'),
    isMessagesLoading:
      profileQuery.isLoading ||
      (isEnabled && Boolean(activeRoomId) && messagesQuery.isLoading && messagesQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      roomsQuery.error ||
      messagesQuery.error ||
      createRoomMutation.error ||
      deleteRoomMutation.error ||
      sendMessageMutation.error ||
      updateMessageMutation.error ||
      deleteMessageMutation.error ||
      null,
    createRoom: createRoomMutation.mutateAsync,
    deleteRoom: deleteRoomMutation.mutateAsync,
    sendMessage: sendMessageMutation.mutateAsync,
    updateMessage: updateMessageMutation.mutateAsync,
    deleteMessage: deleteMessageMutation.mutateAsync,
    isSubmitting:
      createRoomMutation.isPending ||
      deleteRoomMutation.isPending ||
      sendMessageMutation.isPending ||
      updateMessageMutation.isPending ||
      deleteMessageMutation.isPending,
  }
}
