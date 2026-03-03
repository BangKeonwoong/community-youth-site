import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const POST_COMMENTS_TABLE = import.meta.env.VITE_SUPABASE_POST_COMMENTS_TABLE || 'post_comments'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'
const VALID_POST_TYPES = new Set(['meetup', 'grace', 'prayer', 'praise'])

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(error.message || fallbackMessage)
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

function normalizeName(value, fallback = '이름 미상') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function assertPostType(postType) {
  const value = String(postType || '').trim().toLowerCase()
  if (!VALID_POST_TYPES.has(value)) {
    throw new Error('댓글 대상 게시판 유형이 올바르지 않습니다.')
  }

  return value
}

function assertPostId(postId) {
  const value = Number(postId)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('댓글 대상 게시물을 찾을 수 없습니다.')
  }

  return Math.floor(value)
}

function assertContent(content) {
  const value = String(content ?? '').trim()
  if (!value) {
    throw new Error('댓글 내용을 입력해 주세요.')
  }

  if (value.length > 1000) {
    throw new Error('댓글은 1000자 이하로 입력해 주세요.')
  }

  return value
}

function assertProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리할 수 없습니다.')
  }
}

async function fetchProfileNameMap(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))]
  if (ids.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.from(PROFILE_TABLE).select('id, display_name').in('id', ids)

  if (error) {
    throw toError(error, '댓글 작성자 정보를 불러오지 못했습니다.')
  }

  const map = new Map()
  ;(data || []).forEach((row) => {
    map.set(row.id, normalizeName(row.display_name))
  })

  return map
}

function normalizeCommentRow(row, profileMap, currentProfileId) {
  return {
    id: row?.id ?? null,
    postType: row?.post_type ?? null,
    postId: row?.post_id ?? null,
    parentCommentId: row?.parent_comment_id ?? null,
    authorId: row?.author_id ?? null,
    authorName: profileMap.get(row?.author_id) || '이름 미상',
    content: String(row?.content ?? ''),
    isDeleted: Boolean(row?.is_deleted),
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
    editedAt: row?.edited_at ?? null,
    deletedAt: row?.deleted_at ?? null,
    isMine: Boolean(currentProfileId && row?.author_id === currentProfileId),
  }
}

export async function listPostComments({ postType, postId, currentProfileId = null }) {
  requireSupabaseConfigured()

  const safePostType = assertPostType(postType)
  const safePostId = assertPostId(postId)

  const { data, error } = await supabase
    .from(POST_COMMENTS_TABLE)
    .select('*')
    .eq('post_type', safePostType)
    .eq('post_id', safePostId)
    .order('created_at', { ascending: true })

  if (error) {
    throw toError(error, '댓글 목록을 불러오지 못했습니다.')
  }

  const rows = data || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.author_id))

  return rows.map((row) => normalizeCommentRow(row, profileMap, currentProfileId))
}

export async function createPostComment(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const safePostType = assertPostType(payload?.postType)
  const safePostId = assertPostId(payload?.postId)
  const safeContent = assertContent(payload?.content)
  const parentCommentId = payload?.parentCommentId ? Number(payload.parentCommentId) : null

  const { data, error } = await supabase
    .from(POST_COMMENTS_TABLE)
    .insert({
      post_type: safePostType,
      post_id: safePostId,
      parent_comment_id: Number.isFinite(parentCommentId) ? Math.floor(parentCommentId) : null,
      author_id: profile.id,
      content: safeContent,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '댓글 등록에 실패했습니다.')
  }

  return data
}

export async function updatePostComment({ commentId, content }) {
  requireSupabaseConfigured()

  const safeCommentId = Number(commentId)
  if (!Number.isFinite(safeCommentId) || safeCommentId <= 0) {
    throw new Error('수정할 댓글을 찾을 수 없습니다.')
  }

  const safeContent = assertContent(content)

  const { data, error } = await supabase
    .from(POST_COMMENTS_TABLE)
    .update({
      content: safeContent,
      edited_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null,
    })
    .eq('id', Math.floor(safeCommentId))
    .select('*')
    .single()

  if (error) {
    throw toError(error, '댓글 수정에 실패했습니다.')
  }

  return data
}

export async function softDeletePostComment(commentId) {
  requireSupabaseConfigured()

  const safeCommentId = Number(commentId)
  if (!Number.isFinite(safeCommentId) || safeCommentId <= 0) {
    throw new Error('삭제할 댓글을 찾을 수 없습니다.')
  }

  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from(POST_COMMENTS_TABLE)
    .update({
      is_deleted: true,
      deleted_at: nowIso,
      edited_at: nowIso,
      content: '',
    })
    .eq('id', Math.floor(safeCommentId))
    .select('*')
    .single()

  if (error) {
    throw toError(error, '댓글 삭제에 실패했습니다.')
  }

  return data
}

export function subscribePostComments({ postType, postId, onChange }) {
  requireSupabaseConfigured()

  const safePostType = assertPostType(postType)
  const safePostId = assertPostId(postId)
  const channelName = `post-comments:${safePostType}:${safePostId}:${Date.now()}`

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: POST_COMMENTS_TABLE,
        filter: `post_id=eq.${safePostId}`,
      },
      (payload) => {
        const row = payload.new || payload.old
        if (!row) {
          return
        }

        if (String(row.post_type) !== safePostType) {
          return
        }

        onChange?.(payload)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
