import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createChatRoom,
  deleteChatRoom,
  joinChatRoom,
  leaveChatRoom,
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
const UNKNOWN_AUTHOR_NAME = '이름 미상'
const DEFAULT_SEND_ERROR_MESSAGE = '메시지 전송에 실패했습니다.'

function useSupabaseStatus() {
  return useMemo(() => getSupabaseStatus(), [])
}

function normalizeDisplayName(value, fallback = UNKNOWN_AUTHOR_NAME) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeRoomId(roomId) {
  const value = Number(roomId)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function normalizeMessageId(messageId) {
  if (messageId === null || messageId === undefined) {
    return ''
  }

  return String(messageId)
}

function isSameMessageId(leftId, rightId) {
  return normalizeMessageId(leftId) === normalizeMessageId(rightId)
}

function getChatMessagesQueryKey(roomId) {
  return [...CHAT_MESSAGES_QUERY_KEY, normalizeRoomId(roomId)]
}

function getScopedRoomsQueryKey(profileId) {
  return [...CHAT_ROOMS_QUERY_KEY, profileId || 'anonymous']
}

function getScopedMessagesQueryKey(roomId, profileId) {
  return [...getChatMessagesQueryKey(roomId), profileId || 'anonymous']
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function sortMessages(messages) {
  if (!Array.isArray(messages)) {
    return []
  }

  return [...messages].sort((left, right) => {
    const timestampDelta = toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt)
    if (timestampDelta !== 0) {
      return timestampDelta
    }

    return normalizeMessageId(left?.id).localeCompare(normalizeMessageId(right?.id))
  })
}

function upsertMessage(messages, nextMessage) {
  if (!Array.isArray(messages)) {
    return [nextMessage]
  }

  const index = messages.findIndex((item) => isSameMessageId(item.id, nextMessage.id))
  if (index < 0) {
    return [...messages, nextMessage]
  }

  const nextMessages = [...messages]
  nextMessages[index] = {
    ...nextMessages[index],
    ...nextMessage,
  }
  return nextMessages
}

function updateMessageById(messages, messageId, updater) {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map((item) => (isSameMessageId(item.id, messageId) ? updater(item) : item))
}

function getMessagePreview(message) {
  if (message?.isDeleted) {
    return '삭제된 메시지'
  }

  const text = String(message?.content ?? '').trim()
  return text || '(내용 없음)'
}

function patchRoomLastMessage(rooms, { roomId, message }) {
  if (!Array.isArray(rooms)) {
    return rooms
  }

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    return rooms
  }

  const createdAt = message?.createdAt ?? null
  const preview = getMessagePreview(message)

  return rooms.map((room) => {
    if (normalizeRoomId(room?.id) !== safeRoomId) {
      return room
    }

    return {
      ...room,
      lastMessageAt: createdAt || room.lastMessageAt,
      latestMessagePreview: preview,
    }
  })
}

function patchRoomMembership(rooms, { roomId, isMember, memberRole }) {
  if (!Array.isArray(rooms)) {
    return rooms
  }

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    return rooms
  }

  return rooms.map((room) => {
    if (normalizeRoomId(room?.id) !== safeRoomId) {
      return room
    }

    const rawMemberCount = Number(room?.memberCount ?? 0)
    const currentMemberCount = Number.isFinite(rawMemberCount) ? rawMemberCount : 0
    const isAlreadyMember = Boolean(room?.isMember)
    const nextMemberCount = isMember
      ? isAlreadyMember
        ? currentMemberCount
        : currentMemberCount + 1
      : isAlreadyMember
        ? Math.max(0, currentMemberCount - 1)
        : currentMemberCount

    return {
      ...room,
      isMember,
      memberRole: isMember ? memberRole || room?.memberRole || 'member' : null,
      memberCount: nextMemberCount,
    }
  })
}

function buildOptimisticMessage({ roomId, content, profile, clientId, createdAt }) {
  const safeCreatedAt = createdAt || new Date().toISOString()
  return {
    id: clientId,
    roomId,
    authorId: profile?.id ?? null,
    authorName: normalizeDisplayName(profile?.displayName),
    content,
    isDeleted: false,
    createdAt: safeCreatedAt,
    updatedAt: safeCreatedAt,
    editedAt: null,
    deletedAt: null,
    isMine: true,
    clientId,
    sendState: 'sending',
    sendError: null,
  }
}

function buildServerMessage(row, profile, fallback = null) {
  const authorId = row?.author_id ?? row?.authorId ?? null
  const profileId = profile?.id ?? null
  const isMine = Boolean(profileId && authorId && profileId === authorId)
  const fallbackAuthorName = fallback?.authorName ?? UNKNOWN_AUTHOR_NAME
  const authorName = isMine
    ? normalizeDisplayName(profile?.displayName, fallbackAuthorName)
    : normalizeDisplayName(row?.author_name ?? row?.authorName, fallbackAuthorName)

  return {
    id: row?.id ?? fallback?.id ?? null,
    roomId: row?.room_id ?? row?.roomId ?? fallback?.roomId ?? null,
    authorId,
    authorName,
    content: String(row?.content ?? fallback?.content ?? ''),
    isDeleted: Boolean(row?.is_deleted ?? row?.isDeleted ?? fallback?.isDeleted),
    createdAt: row?.created_at ?? row?.createdAt ?? fallback?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? fallback?.updatedAt ?? null,
    editedAt: row?.edited_at ?? row?.editedAt ?? fallback?.editedAt ?? null,
    deletedAt: row?.deleted_at ?? row?.deletedAt ?? fallback?.deletedAt ?? null,
    isMine: Boolean(isMine || fallback?.isMine),
    clientId: null,
    sendState: 'sent',
    sendError: null,
  }
}

function findKnownAuthorName(messages, authorId) {
  if (!authorId || !Array.isArray(messages)) {
    return null
  }

  const matched = messages.find(
    (message) =>
      message?.authorId === authorId &&
      typeof message?.authorName === 'string' &&
      message.authorName !== UNKNOWN_AUTHOR_NAME,
  )

  return matched?.authorName || null
}

function normalizeDeletePayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      messageId: payload.messageId,
      roomId: normalizeRoomId(payload.roomId),
    }
  }

  return {
    messageId: payload,
    roomId: null,
  }
}

export function useChatPage({ selectedRoomId = null, autoSelectFirstRoom = true } = {}) {
  const queryClient = useQueryClient()
  const supabaseStatus = useSupabaseStatus()
  const safeSelectedRoomId = normalizeRoomId(selectedRoomId)

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const isEnabled = supabaseStatus.configured && profileQuery.isSuccess
  const profileId = profileQuery.data?.id || null
  const roomsQueryKey = useMemo(() => getScopedRoomsQueryKey(profileId), [profileId])

  const roomsQuery = useQuery({
    queryKey: roomsQueryKey,
    queryFn: () => listChatRooms(profileId),
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

    if (!autoSelectFirstRoom) {
      return null
    }

    return normalizeRoomId(rooms[0]?.id)
  }, [autoSelectFirstRoom, rooms, safeSelectedRoomId])
  const activeRoom = useMemo(
    () => rooms.find((room) => normalizeRoomId(room?.id) === activeRoomId) || null,
    [activeRoomId, rooms],
  )
  const canAccessActiveRoom = Boolean(activeRoom?.isMember)

  const messagesQueryKey = useMemo(
    () => getScopedMessagesQueryKey(activeRoomId, profileId),
    [activeRoomId, profileId],
  )
  const messagesQuery = useQuery({
    queryKey: messagesQueryKey,
    queryFn: () =>
      listChatMessages({
        roomId: activeRoomId,
        currentProfileId: profileId,
      }),
    enabled: isEnabled && Boolean(activeRoomId) && canAccessActiveRoom,
  })

  const createRoomMutation = useMutation({
    mutationFn: (payload) => createChatRoom(payload, profileQuery.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
    },
  })

  const deleteRoomMutation = useMutation({
    mutationFn: deleteChatRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_QUERY_KEY })
    },
  })

  const joinRoomMutation = useMutation({
    mutationFn: (roomId) => joinChatRoom(roomId, profileQuery.data),
    onMutate: async (roomId) => {
      const safeRoomId = normalizeRoomId(roomId)
      if (!safeRoomId) {
        return {}
      }

      await queryClient.cancelQueries({ queryKey: roomsQueryKey, exact: true })
      const previousRooms = queryClient.getQueryData(roomsQueryKey)

      queryClient.setQueryData(roomsQueryKey, (current) =>
        patchRoomMembership(current, {
          roomId: safeRoomId,
          isMember: true,
          memberRole: 'member',
        }),
      )

      return {
        safeRoomId,
        previousRooms,
      }
    },
    onError: (_error, _roomId, context) => {
      if (context?.previousRooms !== undefined) {
        queryClient.setQueryData(roomsQueryKey, context.previousRooms)
      }
    },
    onSuccess: (_result, roomId) => {
      const safeRoomId = normalizeRoomId(roomId)
      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
      if (safeRoomId) {
        queryClient.invalidateQueries({ queryKey: getScopedMessagesQueryKey(safeRoomId, profileId), exact: true })
      }
    },
  })

  const leaveRoomMutation = useMutation({
    mutationFn: (roomId) => leaveChatRoom(roomId, profileQuery.data),
    onMutate: async (roomId) => {
      const safeRoomId = normalizeRoomId(roomId)
      if (!safeRoomId) {
        return {}
      }

      await queryClient.cancelQueries({ queryKey: roomsQueryKey, exact: true })
      const previousRooms = queryClient.getQueryData(roomsQueryKey)

      queryClient.setQueryData(roomsQueryKey, (current) =>
        patchRoomMembership(current, {
          roomId: safeRoomId,
          isMember: false,
          memberRole: null,
        }),
      )

      return {
        safeRoomId,
        previousRooms,
      }
    },
    onError: (_error, _roomId, context) => {
      if (context?.previousRooms !== undefined) {
        queryClient.setQueryData(roomsQueryKey, context.previousRooms)
      }
    },
    onSuccess: (_result, roomId) => {
      const safeRoomId = normalizeRoomId(roomId)
      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
      if (safeRoomId) {
        queryClient.removeQueries({ queryKey: getScopedMessagesQueryKey(safeRoomId, profileId), exact: true })
      }
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: ({ roomId, content }) => sendChatMessage({ roomId, content }, profileQuery.data),
    onMutate: async (payload) => {
      const safeRoomId = normalizeRoomId(payload?.roomId)
      const content = String(payload?.content ?? '').trim()
      if (!safeRoomId || !content) {
        return {}
      }

      const scopedMessagesQueryKey = getScopedMessagesQueryKey(safeRoomId, profileId)
      const createdAt = payload?.createdAt || new Date().toISOString()
      const optimisticId =
        payload?.retryMessageId ||
        payload?.clientId ||
        `temp:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

      const optimisticMessage = buildOptimisticMessage({
        roomId: safeRoomId,
        content,
        profile: profileQuery.data,
        clientId: optimisticId,
        createdAt,
      })

      await queryClient.cancelQueries({ queryKey: scopedMessagesQueryKey, exact: true })

      let previousRoomSnapshot = null
      queryClient.setQueryData(scopedMessagesQueryKey, (current) => {
        const baseMessages = Array.isArray(current) ? current : []
        if (payload?.retryMessageId) {
          return sortMessages(
            updateMessageById(baseMessages, payload.retryMessageId, (message) => ({
              ...message,
              content,
              sendState: 'sending',
              sendError: null,
              isDeleted: false,
              deletedAt: null,
            })),
          )
        }

        return sortMessages([...baseMessages, optimisticMessage])
      })

      queryClient.setQueryData(roomsQueryKey, (current) => {
        if (!Array.isArray(current)) {
          return current
        }

        previousRoomSnapshot =
          current.find((room) => normalizeRoomId(room?.id) === safeRoomId) || null

        return patchRoomLastMessage(current, {
          roomId: safeRoomId,
          message: optimisticMessage,
        })
      })

      return {
        scopedMessagesQueryKey,
        optimisticId,
        optimisticMessage,
        roomId: safeRoomId,
        content,
        createdAt,
        previousRoomSnapshot,
      }
    },
    onError: (error, _payload, context) => {
      if (!context?.scopedMessagesQueryKey || !context.optimisticId) {
        return
      }

      const errorMessage = error?.message || DEFAULT_SEND_ERROR_MESSAGE

      queryClient.setQueryData(context.scopedMessagesQueryKey, (current) => {
        const baseMessages = Array.isArray(current) ? current : []
        const hasOptimisticMessage = baseMessages.some((message) =>
          isSameMessageId(message.id, context.optimisticId),
        )

        if (!hasOptimisticMessage && context.optimisticMessage) {
          return sortMessages([
            ...baseMessages,
            {
              ...context.optimisticMessage,
              sendState: 'failed',
              sendError: errorMessage,
            },
          ])
        }

        return sortMessages(
          updateMessageById(baseMessages, context.optimisticId, (message) => ({
            ...message,
            sendState: 'failed',
            sendError: errorMessage,
          })),
        )
      })

      if (!context.previousRoomSnapshot) {
        return
      }

      queryClient.setQueryData(roomsQueryKey, (current) => {
        if (!Array.isArray(current)) {
          return current
        }

        return current.map((room) => {
          if (normalizeRoomId(room?.id) !== context.roomId) {
            return room
          }

          const isStillOptimisticLatest =
            String(room?.latestMessagePreview ?? '') === context.content &&
            String(room?.lastMessageAt ?? '') === String(context.createdAt ?? '')

          if (!isStillOptimisticLatest) {
            return room
          }

          return {
            ...room,
            lastMessageAt: context.previousRoomSnapshot.lastMessageAt ?? null,
            latestMessagePreview: context.previousRoomSnapshot.latestMessagePreview ?? '',
          }
        })
      })
    },
    onSuccess: (row, _payload, context) => {
      if (!context?.scopedMessagesQueryKey) {
        return
      }

      queryClient.setQueryData(context.scopedMessagesQueryKey, (current) => {
        const baseMessages = Array.isArray(current) ? current : []
        const optimisticMessage = baseMessages.find((message) =>
          isSameMessageId(message.id, context.optimisticId),
        )

        const serverMessage = buildServerMessage(row, profileQuery.data, optimisticMessage)
        const filteredMessages = context.optimisticId
          ? baseMessages.filter((message) => !isSameMessageId(message.id, context.optimisticId))
          : baseMessages

        return sortMessages(upsertMessage(filteredMessages, serverMessage))
      })

      queryClient.setQueryData(roomsQueryKey, (current) => {
        const serverMessage = buildServerMessage(row, profileQuery.data)
        return patchRoomLastMessage(current, {
          roomId: serverMessage.roomId,
          message: serverMessage,
        })
      })
    },
  })

  const updateMessageMutation = useMutation({
    mutationFn: ({ messageId, content }) => updateChatMessage({ messageId, content }),
    onMutate: async (payload) => {
      const roomId = normalizeRoomId(payload?.roomId) || activeRoomId
      const scopedMessagesQueryKey = getScopedMessagesQueryKey(roomId, profileId)
      if (!roomId || payload?.messageId === undefined || payload?.messageId === null) {
        return {}
      }

      await queryClient.cancelQueries({ queryKey: scopedMessagesQueryKey, exact: true })

      const previousMessages = queryClient.getQueryData(scopedMessagesQueryKey)
      const nextContent = String(payload?.content ?? '').trim()
      const editedAt = new Date().toISOString()

      queryClient.setQueryData(scopedMessagesQueryKey, (current) =>
        sortMessages(
          updateMessageById(Array.isArray(current) ? current : [], payload.messageId, (message) => ({
            ...message,
            content: nextContent,
            isDeleted: false,
            deletedAt: null,
            editedAt,
            sendState: 'sent',
            sendError: null,
          })),
        ),
      )

      return {
        scopedMessagesQueryKey,
        previousMessages,
      }
    },
    onError: (_error, _payload, context) => {
      if (!context?.scopedMessagesQueryKey) {
        return
      }

      queryClient.setQueryData(context.scopedMessagesQueryKey, context.previousMessages)
    },
    onSuccess: (row, payload, context) => {
      if (!context?.scopedMessagesQueryKey) {
        return
      }

      queryClient.setQueryData(context.scopedMessagesQueryKey, (current) => {
        const baseMessages = Array.isArray(current) ? current : []
        const fallback = baseMessages.find((message) => isSameMessageId(message.id, payload?.messageId))
        const nextMessage = buildServerMessage(row, profileQuery.data, fallback)
        return sortMessages(upsertMessage(baseMessages, nextMessage))
      })

      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
    },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (payload) => {
      const { messageId } = normalizeDeletePayload(payload)
      return softDeleteChatMessage(messageId)
    },
    onMutate: async (payload) => {
      const { messageId, roomId } = normalizeDeletePayload(payload)
      const safeRoomId = roomId || activeRoomId
      const scopedMessagesQueryKey = getScopedMessagesQueryKey(safeRoomId, profileId)
      if (!safeRoomId || messageId === undefined || messageId === null) {
        return {}
      }

      await queryClient.cancelQueries({ queryKey: scopedMessagesQueryKey, exact: true })

      const previousMessages = queryClient.getQueryData(scopedMessagesQueryKey)
      const deletedAt = new Date().toISOString()

      queryClient.setQueryData(scopedMessagesQueryKey, (current) =>
        sortMessages(
          updateMessageById(Array.isArray(current) ? current : [], messageId, (message) => ({
            ...message,
            content: '',
            isDeleted: true,
            deletedAt,
            editedAt: deletedAt,
            sendState: 'sent',
            sendError: null,
          })),
        ),
      )

      return {
        scopedMessagesQueryKey,
        previousMessages,
      }
    },
    onError: (_error, _payload, context) => {
      if (!context?.scopedMessagesQueryKey) {
        return
      }

      queryClient.setQueryData(context.scopedMessagesQueryKey, context.previousMessages)
    },
    onSuccess: (row, payload, context) => {
      if (!context?.scopedMessagesQueryKey) {
        return
      }

      const { messageId } = normalizeDeletePayload(payload)
      queryClient.setQueryData(context.scopedMessagesQueryKey, (current) => {
        const baseMessages = Array.isArray(current) ? current : []
        const fallback = baseMessages.find((message) => isSameMessageId(message.id, messageId))
        const nextMessage = buildServerMessage(row, profileQuery.data, fallback)
        return sortMessages(upsertMessage(baseMessages, nextMessage))
      })

      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
    },
  })

  useEffect(() => {
    if (!supabaseStatus.configured || !isEnabled) {
      return undefined
    }

    const unsubscribe = subscribeChatRooms(() => {
      queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true })
    })

    return () => {
      unsubscribe?.()
    }
  }, [isEnabled, queryClient, roomsQueryKey, supabaseStatus.configured])

  useEffect(() => {
    if (!supabaseStatus.configured || !isEnabled || !activeRoomId || !canAccessActiveRoom) {
      return undefined
    }

    const unsubscribe = subscribeChatMessages({
      roomId: activeRoomId,
      onChange: (payload) => {
        const eventType = payload?.eventType
        const newRow = payload?.new || null
        const oldRow = payload?.old || null

        let shouldRefetchAuthorNames = false

        queryClient.setQueryData(messagesQueryKey, (current) => {
          const baseMessages = Array.isArray(current) ? current : []

          if (eventType === 'INSERT' && newRow) {
            const knownAuthorName = findKnownAuthorName(baseMessages, newRow.author_id)
            const fallbackMessage = {
              id: newRow.id,
              roomId: newRow.room_id,
              authorId: newRow.author_id,
              authorName: knownAuthorName || UNKNOWN_AUTHOR_NAME,
              content: newRow.content,
              isDeleted: Boolean(newRow.is_deleted),
              createdAt: newRow.created_at,
              updatedAt: newRow.updated_at,
              editedAt: newRow.edited_at,
              deletedAt: newRow.deleted_at,
              isMine: Boolean(profileId && newRow.author_id && profileId === newRow.author_id),
              clientId: null,
              sendState: 'sent',
              sendError: null,
            }
            const incomingMessage = buildServerMessage(newRow, profileQuery.data, fallbackMessage)

            if (
              !incomingMessage.isMine &&
              incomingMessage.authorName === UNKNOWN_AUTHOR_NAME
            ) {
              shouldRefetchAuthorNames = true
            }

            return sortMessages(upsertMessage(baseMessages, incomingMessage))
          }

          if (eventType === 'UPDATE' && newRow) {
            const knownAuthorName = findKnownAuthorName(baseMessages, newRow.author_id)
            const fallbackMessage = {
              id: newRow.id,
              roomId: newRow.room_id,
              authorId: newRow.author_id,
              authorName: knownAuthorName || UNKNOWN_AUTHOR_NAME,
              content: newRow.content,
              isDeleted: Boolean(newRow.is_deleted),
              createdAt: newRow.created_at,
              updatedAt: newRow.updated_at,
              editedAt: newRow.edited_at,
              deletedAt: newRow.deleted_at,
              isMine: Boolean(profileId && newRow.author_id && profileId === newRow.author_id),
              clientId: null,
              sendState: 'sent',
              sendError: null,
            }

            return sortMessages(upsertMessage(baseMessages, buildServerMessage(newRow, profileQuery.data, fallbackMessage)))
          }

          if (eventType === 'DELETE' && oldRow) {
            return baseMessages.filter((message) => !isSameMessageId(message.id, oldRow.id))
          }

          return baseMessages
        })

        if (eventType === 'INSERT' && newRow) {
          queryClient.setQueryData(roomsQueryKey, (current) =>
            patchRoomLastMessage(current, {
              roomId: newRow.room_id,
              message: {
                content: String(newRow.content ?? ''),
                isDeleted: Boolean(newRow.is_deleted),
                createdAt: newRow.created_at,
              },
            }),
          )
        }

        if (shouldRefetchAuthorNames) {
          queryClient.invalidateQueries({ queryKey: messagesQueryKey, exact: true })
        }
      },
    })

    return () => {
      unsubscribe?.()
    }
  }, [
    activeRoomId,
    isEnabled,
    messagesQueryKey,
    profileId,
    profileQuery.data,
    queryClient,
    roomsQueryKey,
    supabaseStatus.configured,
    canAccessActiveRoom,
  ])

  const sendMessage = (payload) => {
    const roomId = normalizeRoomId(payload?.roomId) || activeRoomId
    if (!roomId) {
      return Promise.reject(new Error('메시지를 보낼 채팅방을 찾을 수 없습니다.'))
    }

    const targetRoom = rooms.find((room) => normalizeRoomId(room?.id) === roomId) || null
    if (!targetRoom?.isMember) {
      return Promise.reject(new Error('채팅방에 참여한 뒤 메시지를 보낼 수 있습니다.'))
    }

    return sendMessageMutation.mutateAsync(payload)
  }

  const retryFailedMessage = async (messageId) => {
    const roomId = normalizeRoomId(activeRoomId)
    if (!roomId) {
      throw new Error('재전송할 채팅방을 찾을 수 없습니다.')
    }

    if (!canAccessActiveRoom) {
      throw new Error('채팅방에 참여한 뒤 재전송할 수 있습니다.')
    }

    const scopedMessagesQueryKey = getScopedMessagesQueryKey(roomId, profileId)
    const currentMessages = queryClient.getQueryData(scopedMessagesQueryKey)
    const messages = Array.isArray(currentMessages) ? currentMessages : []
    const targetMessage = messages.find((message) => isSameMessageId(message.id, messageId))

    if (!targetMessage) {
      throw new Error('재전송할 메시지를 찾을 수 없습니다.')
    }

    const content = String(targetMessage.content ?? '').trim()
    if (!content) {
      throw new Error('재전송할 메시지 내용이 없습니다.')
    }

    return sendMessageMutation.mutateAsync({
      roomId,
      content,
      retryMessageId: targetMessage.id,
      clientId: targetMessage.clientId || normalizeMessageId(targetMessage.id),
      createdAt: targetMessage.createdAt || new Date().toISOString(),
    })
  }

  const isRoomSubmitting = createRoomMutation.isPending || deleteRoomMutation.isPending
  const isMembershipSubmitting = joinRoomMutation.isPending || leaveRoomMutation.isPending
  const isMessageSending = sendMessageMutation.isPending
  const isMessageMutating = updateMessageMutation.isPending || deleteMessageMutation.isPending

  return {
    supabaseStatus,
    profile: profileQuery.data,
    rooms,
    activeRoomId,
    activeRoom,
    messages: canAccessActiveRoom ? messagesQuery.data || [] : [],
    isLoading:
      profileQuery.isLoading ||
      (isEnabled && roomsQuery.isLoading && roomsQuery.fetchStatus !== 'idle'),
    isMessagesLoading:
      profileQuery.isLoading ||
      (isEnabled &&
        canAccessActiveRoom &&
        Boolean(activeRoomId) &&
        messagesQuery.isLoading &&
        messagesQuery.fetchStatus !== 'idle'),
    error:
      profileQuery.error ||
      roomsQuery.error ||
      messagesQuery.error ||
      createRoomMutation.error ||
      deleteRoomMutation.error ||
      joinRoomMutation.error ||
      leaveRoomMutation.error ||
      sendMessageMutation.error ||
      updateMessageMutation.error ||
      deleteMessageMutation.error ||
      null,
    createRoom: createRoomMutation.mutateAsync,
    deleteRoom: deleteRoomMutation.mutateAsync,
    joinRoom: joinRoomMutation.mutateAsync,
    leaveRoom: leaveRoomMutation.mutateAsync,
    sendMessage,
    retryFailedMessage,
    updateMessage: updateMessageMutation.mutateAsync,
    deleteMessage: deleteMessageMutation.mutateAsync,
    isRoomSubmitting,
    isMembershipSubmitting,
    isMessageSending,
    isMessageMutating,
    isSubmitting: isRoomSubmitting || isMembershipSubmitting || isMessageSending || isMessageMutating,
  }
}
