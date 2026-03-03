import { useMemo, useState } from 'react'
import ErrorBanner from '../common/ErrorBanner'
import Avatar from '../common/Avatar'
import { usePostComments } from '../../features/comments/hooks'

const MAX_INDENT_DEPTH = 10

function isSubmitEnter(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing
}

function formatDateTime(value) {
  if (!value) {
    return '방금 전'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '방금 전'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildCommentTree(comments) {
  const nodeMap = new Map()

  comments.forEach((comment) => {
    nodeMap.set(comment.id, { ...comment, children: [] })
  })

  const roots = []

  nodeMap.forEach((node) => {
    if (node.parentCommentId && nodeMap.has(node.parentCommentId) && node.parentCommentId !== node.id) {
      nodeMap.get(node.parentCommentId).children.push(node)
      return
    }

    roots.push(node)
  })

  const sortFn = (left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return leftTime - rightTime
  }

  const sortRecursive = (nodes) => {
    nodes.sort(sortFn)
    nodes.forEach((node) => sortRecursive(node.children))
  }

  sortRecursive(roots)
  return roots
}

function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
  disabled,
  autoFocus = false,
}) {
  const handleKeyDown = (event) => {
    if (!isSubmitEnter(event)) {
      return
    }

    event.preventDefault()

    if (disabled || !value.trim()) {
      return
    }

    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form className="comments-composer" onSubmit={onSubmit}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        autoFocus={autoFocus}
        required
      />
      <div className="comments-composer-actions">
        {onCancel ? (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={disabled}>
            취소
          </button>
        ) : null}
        <button type="submit" className="btn-primary" disabled={disabled || !value.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function CommentNode({
  node,
  depth,
  profile,
  isSubmitting,
  replyingTo,
  replyDraft,
  onReplyDraftChange,
  onReplyOpen,
  onReplyCancel,
  onReplySubmit,
  editingCommentId,
  editingDraft,
  onEditingDraftChange,
  onEditOpen,
  onEditCancel,
  onEditSubmit,
  onDelete,
}) {
  const indent = Math.min(depth, MAX_INDENT_DEPTH) * 12
  const canManage = Boolean(profile?.role === 'admin' || (profile?.id && node.authorId && profile.id === node.authorId))
  const isReplyOpen = replyingTo === node.id
  const isEditing = editingCommentId === node.id

  return (
    <div className="comment-node" style={{ marginLeft: `${indent}px` }}>
      <div className="comment-node-main" style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
        <Avatar name={node.authorName} size={36} style={{ marginTop: '0.15rem' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '0.6rem' }}>
          <div className="comment-node-meta">
            <span style={{ fontWeight: 600 }}>{node.authorName}</span>
            <span>{formatDateTime(node.createdAt)}</span>
            {node.editedAt ? <span>수정됨</span> : null}
          </div>

          {isEditing ? (
            <CommentComposer
              value={editingDraft}
              onChange={onEditingDraftChange}
              onSubmit={(event) => onEditSubmit(event, node)}
              onCancel={onEditCancel}
              placeholder="댓글을 수정하세요"
              submitLabel={isSubmitting ? '저장 중...' : '수정 저장'}
              disabled={isSubmitting}
              autoFocus
            />
          ) : (
            <p className="comment-node-content">
              {node.isDeleted ? '삭제된 댓글입니다.' : node.content || '삭제된 댓글입니다.'}
            </p>
          )}

          {!isEditing ? (
            <div className="comment-node-actions">
              <button type="button" className="btn-secondary" onClick={() => onReplyOpen(node.id)} disabled={isSubmitting}>
                답글
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onEditOpen(node)}
                  disabled={isSubmitting || node.isDeleted}
                >
                  수정
                </button>
              ) : null}
              {canManage ? (
                <button type="button" className="btn-secondary admin-danger-button" onClick={() => onDelete(node)} disabled={isSubmitting || node.isDeleted}>
                  삭제
                </button>
              ) : null}
            </div>
          ) : null}

          {isReplyOpen ? (
            <CommentComposer
              value={replyDraft}
              onChange={onReplyDraftChange}
              onSubmit={(event) => onReplySubmit(event, node)}
              onCancel={onReplyCancel}
              placeholder="답글을 입력하세요"
              submitLabel={isSubmitting ? '등록 중...' : '답글 등록'}
              disabled={isSubmitting}
              autoFocus
            />
          ) : null}
        </div>
      </div>

      {node.children.length > 0 ? (
        <div className="comment-node-children">
          {node.children.map((childNode) => (
            <CommentNode
              key={childNode.id}
              node={childNode}
              depth={depth + 1}
              profile={profile}
              isSubmitting={isSubmitting}
              replyingTo={replyingTo}
              replyDraft={replyDraft}
              onReplyDraftChange={onReplyDraftChange}
              onReplyOpen={onReplyOpen}
              onReplyCancel={onReplyCancel}
              onReplySubmit={onReplySubmit}
              editingCommentId={editingCommentId}
              editingDraft={editingDraft}
              onEditingDraftChange={onEditingDraftChange}
              onEditOpen={onEditOpen}
              onEditCancel={onEditCancel}
              onEditSubmit={onEditSubmit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PostComments({ postType, postId }) {
  const [isOpen, setIsOpen] = useState(false)
  const [rootDraft, setRootDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [feedback, setFeedback] = useState('')

  const { supabaseStatus, profile, comments, isLoading, error, createComment, updateComment, deleteComment, isSubmitting } =
    usePostComments({
      postType,
      postId,
      enabled: isOpen,
      realtime: isOpen,
    })

  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  const handleRootSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      await createComment({
        postType,
        postId,
        parentCommentId: null,
        content: rootDraft,
      })
      setRootDraft('')
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleReplySubmit = async (event, node) => {
    event.preventDefault()
    setFeedback('')

    try {
      await createComment({
        postType,
        postId,
        parentCommentId: node.id,
        content: replyDraft,
      })
      setReplyDraft('')
      setReplyingTo(null)
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleEditSubmit = async (event, node) => {
    event.preventDefault()
    setFeedback('')

    try {
      await updateComment({ commentId: node.id, content: editingDraft })
      setEditingCommentId(null)
      setEditingDraft('')
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleDelete = async (node) => {
    if (!window.confirm('이 댓글을 삭제하시겠어요? 하위 답글은 유지됩니다.')) {
      return
    }

    setFeedback('')

    try {
      await deleteComment(node.id)
      if (editingCommentId === node.id) {
        setEditingCommentId(null)
        setEditingDraft('')
      }
      if (replyingTo === node.id) {
        setReplyingTo(null)
        setReplyDraft('')
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  return (
    <section className="post-comments-block">
      <div className="post-comments-header">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setIsOpen((prev) => !prev)
            setFeedback('')
          }}
          disabled={!supabaseStatus.configured}
        >
          {isOpen ? '댓글 닫기' : '댓글 열기'}
        </button>
        {isOpen ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{comments.length}개 댓글</span> : null}
      </div>

      {!isOpen ? null : (
        <>
          <ErrorBanner message={error?.message || ''} />
          <ErrorBanner message={feedback} />

          <CommentComposer
            value={rootDraft}
            onChange={setRootDraft}
            onSubmit={handleRootSubmit}
            placeholder="댓글을 입력하세요"
            submitLabel={isSubmitting ? '등록 중...' : '댓글 등록'}
            disabled={!supabaseStatus.configured || isSubmitting}
          />

          {isLoading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>댓글을 불러오는 중입니다...</p>
          ) : commentTree.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>첫 댓글을 남겨보세요.</p>
          ) : (
            <div className="comment-thread-root">
              {commentTree.map((node) => (
                <CommentNode
                  key={node.id}
                  node={node}
                  depth={0}
                  profile={profile}
                  isSubmitting={isSubmitting}
                  replyingTo={replyingTo}
                  replyDraft={replyDraft}
                  onReplyDraftChange={setReplyDraft}
                  onReplyOpen={(commentId) => {
                    setEditingCommentId(null)
                    setEditingDraft('')
                    setReplyingTo(commentId)
                    setReplyDraft('')
                  }}
                  onReplyCancel={() => {
                    setReplyingTo(null)
                    setReplyDraft('')
                  }}
                  onReplySubmit={handleReplySubmit}
                  editingCommentId={editingCommentId}
                  editingDraft={editingDraft}
                  onEditingDraftChange={setEditingDraft}
                  onEditOpen={(target) => {
                    setReplyingTo(null)
                    setReplyDraft('')
                    setEditingCommentId(target.id)
                    setEditingDraft(target.content || '')
                  }}
                  onEditCancel={() => {
                    setEditingCommentId(null)
                    setEditingDraft('')
                  }}
                  onEditSubmit={handleEditSubmit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default PostComments
