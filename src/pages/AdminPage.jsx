import { useState } from 'react'
import { ShieldCheck, UserCog, Ticket, Trash2 } from 'lucide-react'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import { useAdminPage } from '../features/admin/hooks'

const TABS = [
  { id: 'invite', label: '초대코드', icon: Ticket },
  { id: 'roles', label: '사용자권한', icon: UserCog },
  { id: 'moderation', label: '게시물운영', icon: ShieldCheck },
]

function getDefaultInviteExpiresAt() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  date.setSeconds(0, 0)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function createInitialInviteForm() {
  return {
    inviteLabel: '',
    note: '',
    maxUses: 100,
    expiresAt: getDefaultInviteExpiresAt(),
    code: '',
  }
}

const TYPE_LABELS = {
  meetup: '벙개',
  meetups: '벙개',
  grace: '은혜',
  prayer: '기도',
  praise: '찬양',
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function toErrorMessage(error) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error.message === 'string') {
    return error.message
  }

  return '요청 처리 중 오류가 발생했습니다.'
}

function toPositiveInteger(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }

  return 1
}

function toNonNegativeInteger(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed)
    }
  }

  return 0
}

function formatDateTime(value, emptyText = '없음') {
  if (!value) {
    return emptyText
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return emptyText
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function resolveAction(target, keys) {
  for (const key of keys) {
    const value = target?.[key]
    if (typeof value === 'function') {
      return value
    }

    if (value && typeof value.mutateAsync === 'function') {
      return value.mutateAsync
    }
  }

  return null
}

async function invokeAction(action, primaryArg, fallbackArgs = []) {
  if (typeof action !== 'function') {
    throw new Error('요청을 처리할 관리자 액션을 찾지 못했습니다.')
  }

  const candidates = [primaryArg, ...fallbackArgs]
  let lastError = null

  for (const candidate of candidates) {
    try {
      if (typeof candidate === 'undefined') {
        return await action()
      }
      return await action(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('요청 처리에 실패했습니다.')
}

function normalizeRole(profile) {
  if (!profile) {
    return 'member'
  }

  if (typeof profile.isAdmin === 'boolean') {
    return profile.isAdmin ? 'admin' : 'member'
  }

  if (typeof profile.is_admin === 'boolean') {
    return profile.is_admin ? 'admin' : 'member'
  }

  return profile.role === 'admin' ? 'admin' : 'member'
}

function normalizeInvite(invite) {
  const id = invite?.id ?? invite?.code ?? invite?.inviteId
  const inviteLabel = String(
    invite?.inviteLabel ?? invite?.invitedName ?? invite?.invited_name ?? invite?.label ?? ''
  ).trim()
  const used = toNonNegativeInteger(
    invite?.used,
    invite?.usedCount,
    invite?.usageUsed,
    invite?.redeemedCount,
    invite?.isRedeemed ? 1 : 0,
    invite?.is_redeemed ? 1 : 0,
    0
  )

  return {
    id,
    code: invite?.code || 'AUTO',
    used,
    maxUses: toPositiveInteger(invite?.maxUses, invite?.max_uses, invite?.usageLimit, 1),
    expiresAt: invite?.expiresAt ?? invite?.expires_at ?? null,
    creator:
      invite?.creatorName ||
      invite?.createdByName ||
      invite?.creator?.displayName ||
      invite?.createdBy?.displayName ||
      invite?.created_by_name ||
      '이름 미상',
    inviteLabel,
    isRevoked: Boolean(invite?.isRevoked || invite?.is_revoked || invite?.revokedAt || invite?.revoked_at),
  }
}

function normalizeProfile(profile) {
  return {
    id: profile?.id ?? profile?.userId ?? profile?.profileId,
    displayName: profile?.displayName || profile?.display_name || profile?.name || '이름 미상',
    email: profile?.email || profile?.userEmail || '',
    role: normalizeRole(profile),
  }
}

function normalizeModerationItem(item) {
  const rawType = String(item?.type || item?.postType || item?.category || item?.source || '').toLowerCase()
  const type = TYPE_LABELS[rawType] ? rawType : 'etc'

  return {
    id: item?.id ?? item?.postId ?? item?.contentId,
    type,
    typeLabel: TYPE_LABELS[type] || '기타',
    title: item?.title || item?.subject || item?.name || '(제목 없음)',
    author: item?.authorName || item?.author || item?.createdByName || item?.author_name || '이름 미상',
    createdAt: item?.createdAt ?? item?.created_at ?? null,
  }
}

function InfoBanner({ message }) {
  if (!message) {
    return null
  }

  return (
    <div
      className="glass"
      style={{
        marginBottom: '1rem',
        padding: '0.9rem 1rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid #f59e0b',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  )
}

function FeedbackBanner({ tone = 'neutral', message }) {
  if (!message) {
    return null
  }

  const isError = tone === 'error'

  return (
    <div
      className="glass"
      style={{
        marginBottom: '1rem',
        padding: '0.8rem 1rem',
        borderRadius: 'var(--radius-md)',
        border: isError ? '1px solid #fecaca' : '1px solid var(--border-color)',
      }}
    >
      <p style={{ fontSize: '0.9rem', color: isError ? '#b91c1c' : 'var(--text-secondary)' }}>{message}</p>
    </div>
  )
}

function AdminPage() {
  const adminPage = useAdminPage()
  const [activeTab, setActiveTab] = useState('invite')
  const [inviteForm, setInviteForm] = useState(createInitialInviteForm)
  const [feedback, setFeedback] = useState({ tone: 'neutral', message: '' })
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [pendingInviteId, setPendingInviteId] = useState(null)
  const [pendingProfileId, setPendingProfileId] = useState(null)
  const [pendingModerationId, setPendingModerationId] = useState(null)

  const supabaseStatus = adminPage?.supabaseStatus || { configured: true, message: '' }
  const currentProfile = normalizeProfile(adminPage?.currentProfile || adminPage?.profile || adminPage?.me || null)
  const invites = asArray(
    adminPage?.invites ||
    adminPage?.inviteCodes ||
    adminPage?.inviteList ||
    adminPage?.data?.invites ||
    adminPage?.data?.inviteCodes
  ).map(normalizeInvite)
  const profiles = asArray(
    adminPage?.profiles ||
    adminPage?.profileList ||
    adminPage?.users ||
    adminPage?.members ||
    adminPage?.data?.profiles ||
    adminPage?.data?.users
  ).map(normalizeProfile)
  const moderationItems = asArray(
    adminPage?.moderationItems ||
    adminPage?.moderationPosts ||
    adminPage?.moderationList ||
    adminPage?.posts ||
    adminPage?.contents ||
    adminPage?.data?.moderationItems
  ).map(normalizeModerationItem)

  const isLoading = Boolean(
    adminPage?.isLoading ||
    adminPage?.loading ||
    adminPage?.isPending ||
    adminPage?.isFetching ||
    adminPage?.isRefetching
  )
  const pageErrorMessage = toErrorMessage(
    adminPage?.error || adminPage?.pageError || adminPage?.listError || adminPage?.fetchError
  )

  const createInviteAction = resolveAction(adminPage, [
    'createInvite',
    'createInviteCode',
    'createInviteMutation',
    'createInviteCodeMutation',
  ])
  const revokeInviteAction = resolveAction(adminPage, [
    'revokeInvite',
    'revokeInviteCode',
    'revokeInviteMutation',
    'deleteInvite',
  ])
  const updateRoleAction = resolveAction(adminPage, [
    'updateProfileAdminStatus',
    'setProfileRole',
    'updateProfileRole',
    'toggleProfileRole',
    'toggleAdminRole',
    'updateRole',
    'updateRoleMutation',
  ])
  const hardDeleteAction = resolveAction(adminPage, [
    'hardDeletePost',
    'deleteModerationPost',
    'hardDeleteMutation',
    'deletePostHard',
    'removeModerationItem',
  ])

  const handleInviteInputChange = (field, value) => {
    setInviteForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateInvite = async (event) => {
    event.preventDefault()
    setFeedback({ tone: 'neutral', message: '' })

    const payload = {
      inviteLabel: inviteForm.inviteLabel.trim() || null,
      note: inviteForm.note.trim() || null,
      maxUses: Math.max(1, toPositiveInteger(inviteForm.maxUses, 100)),
      expiresAt: inviteForm.expiresAt ? new Date(inviteForm.expiresAt).toISOString() : null,
      code: inviteForm.code.trim() || null,
    }

    try {
      setIsCreatingInvite(true)
      await invokeAction(createInviteAction, payload)
      setInviteForm(createInitialInviteForm())
      setFeedback({ tone: 'success', message: '초대코드가 생성되었습니다.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: toErrorMessage(error) })
    } finally {
      setIsCreatingInvite(false)
    }
  }

  const handleRevokeInvite = async (invite) => {
    if (!window.confirm('이 초대코드를 철회하시겠어요?')) {
      return
    }

    setFeedback({ tone: 'neutral', message: '' })
    try {
      setPendingInviteId(invite.id)
      await invokeAction(
        revokeInviteAction,
        invite.id,
        [{ id: invite.id, code: invite.code }, invite.code]
      )
      setFeedback({ tone: 'success', message: '초대코드를 철회했습니다.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: toErrorMessage(error) })
    } finally {
      setPendingInviteId(null)
    }
  }

  const handleToggleRole = async (profile) => {
    const nextRole = profile.role === 'admin' ? 'member' : 'admin'
    const isSelfAdminDemotion =
      profile.role === 'admin' && currentProfile?.id && profile.id && currentProfile.id === profile.id

    if (isSelfAdminDemotion) {
      return
    }

    if (!window.confirm(`${profile.displayName} 님을 ${nextRole === 'admin' ? '관리자' : '멤버'}로 변경할까요?`)) {
      return
    }

    setFeedback({ tone: 'neutral', message: '' })
    try {
      setPendingProfileId(profile.id)
      await invokeAction(
        updateRoleAction,
        {
          profileId: profile.id,
          id: profile.id,
          role: nextRole,
          nextRole,
          isAdmin: nextRole === 'admin',
        },
        [
          { id: profile.id, role: nextRole },
          { profile: profile.id, nextRole },
          profile.id,
          profile,
        ]
      )
      setFeedback({ tone: 'success', message: '사용자 권한을 변경했습니다.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: toErrorMessage(error) })
    } finally {
      setPendingProfileId(null)
    }
  }

  const handleHardDelete = async (item) => {
    if (!window.confirm('정말로 이 게시물을 영구 삭제하시겠어요? 이 작업은 되돌릴 수 없습니다.')) {
      return
    }

    setFeedback({ tone: 'neutral', message: '' })
    try {
      setPendingModerationId(item.id)
      await invokeAction(
        hardDeleteAction,
        { id: item.id, type: item.type },
        [{ postId: item.id, id: item.id, type: item.type }, item.id, item]
      )
      setFeedback({ tone: 'success', message: '게시물을 영구 삭제했습니다.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: toErrorMessage(error) })
    } finally {
      setPendingModerationId(null)
    }
  }

  return (
    <div className="animate-fade-in admin-page">
      <header style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>관리자 콘솔</h1>
        <p style={{ color: 'var(--text-secondary)' }}>초대코드, 권한, 게시물 운영을 한곳에서 관리합니다.</p>
        {currentProfile?.id ? (
          <p style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            접속 프로필: {currentProfile.displayName} ({currentProfile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}
      <ErrorBanner message={pageErrorMessage} />
      <FeedbackBanner tone={feedback.tone} message={feedback.message} />

      <div className="glass admin-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={`admin-tab-button ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {activeTab === 'invite' ? (
        <section className="admin-section">
          <div className="glass admin-card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>공개 초대코드 생성</h2>
            <form onSubmit={handleCreateInvite} className="admin-form-grid">
              <div className="admin-form-field">
                <label htmlFor="admin-invite-label">코드명 (선택)</label>
                <input
                  id="admin-invite-label"
                  value={inviteForm.inviteLabel}
                  onChange={(event) => handleInviteInputChange('inviteLabel', event.target.value)}
                  className="admin-input"
                  placeholder="예: 2026 상반기 공개 초대"
                />
              </div>

              <div className="admin-form-field">
                <label htmlFor="admin-max-uses">최대 사용 횟수</label>
                <input
                  id="admin-max-uses"
                  type="number"
                  min={1}
                  value={inviteForm.maxUses}
                  onChange={(event) => handleInviteInputChange('maxUses', event.target.value)}
                  className="admin-input"
                />
              </div>

              <div className="admin-form-field">
                <label htmlFor="admin-expires-at">만료 일시</label>
                <input
                  id="admin-expires-at"
                  type="datetime-local"
                  value={inviteForm.expiresAt}
                  onChange={(event) => handleInviteInputChange('expiresAt', event.target.value)}
                  className="admin-input"
                />
              </div>

              <div className="admin-form-field">
                <label htmlFor="admin-code">코드 수동 지정 (선택)</label>
                <input
                  id="admin-code"
                  value={inviteForm.code}
                  onChange={(event) => handleInviteInputChange('code', event.target.value.toUpperCase())}
                  className="admin-input"
                  placeholder="비우면 자동 생성"
                />
              </div>

              <div className="admin-form-field admin-note-field">
                <label htmlFor="admin-note">메모</label>
                <textarea
                  id="admin-note"
                  value={inviteForm.note}
                  onChange={(event) => handleInviteInputChange('note', event.target.value)}
                  className="admin-input"
                  rows={3}
                  placeholder="관리 메모를 남기세요."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-primary" type="submit" disabled={!supabaseStatus.configured || isCreatingInvite}>
                  {isCreatingInvite ? '생성 중...' : '초대코드 생성'}
                </button>
              </div>
            </form>
          </div>

          <div className="glass admin-card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>초대코드 목록</h2>
            {isLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>초대코드를 불러오는 중입니다...</p>
            ) : invites.length === 0 ? (
              <EmptyState title="생성된 초대코드가 없습니다." description="새 초대코드를 먼저 생성해 주세요." />
            ) : (
              <div className="admin-list">
                {invites.map((invite) => (
                  <div key={`${invite.code}-${invite.id || 'item'}`} className="admin-list-row">
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <p style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700 }}>
                        {invite.code}
                      </p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        사용량: {invite.used}/{invite.maxUses}
                      </p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        만료: {formatDateTime(invite.expiresAt, '만료 없음')}
                      </p>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                        생성자: {invite.creator}
                      </p>
                      {invite.inviteLabel ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                          코드명: {invite.inviteLabel}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleRevokeInvite(invite)}
                      disabled={
                        !supabaseStatus.configured ||
                        pendingInviteId === invite.id ||
                        !invite.id ||
                        invite.isRevoked
                      }
                    >
                      {invite.isRevoked ? '철회됨' : pendingInviteId === invite.id ? '처리 중...' : '철회'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'roles' ? (
        <section className="admin-section">
          <div className="glass admin-card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>사용자 권한</h2>
            {isLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>사용자 목록을 불러오는 중입니다...</p>
            ) : profiles.length === 0 ? (
              <EmptyState title="조회된 사용자가 없습니다." description="프로필 데이터가 생성되면 여기에 표시됩니다." />
            ) : (
              <div className="admin-list">
                {profiles.map((profile) => {
                  const isAdmin = profile.role === 'admin'
                  const isSelfAdminDemotion =
                    isAdmin && currentProfile?.id && profile.id && currentProfile.id === profile.id

                  return (
                    <div key={profile.id || profile.displayName} className="admin-list-row">
                      <div style={{ display: 'grid', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span className={`admin-role-badge ${isAdmin ? 'admin' : 'member'}`}>
                            {isAdmin ? 'ADMIN' : 'MEMBER'}
                          </span>
                          <p style={{ fontWeight: 600 }}>{profile.displayName}</p>
                        </div>
                        {profile.email ? (
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{profile.email}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleToggleRole(profile)}
                        disabled={
                          !supabaseStatus.configured ||
                          pendingProfileId === profile.id ||
                          !profile.id ||
                          isSelfAdminDemotion
                        }
                        title={isSelfAdminDemotion ? '자기 자신의 관리자 권한은 해제할 수 없습니다.' : ''}
                      >
                        {pendingProfileId === profile.id ? '처리 중...' : isAdmin ? '멤버로 변경' : '관리자로 변경'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'moderation' ? (
        <section className="admin-section">
          <div className="glass admin-card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>게시물 운영</h2>
            {isLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>게시물 목록을 불러오는 중입니다...</p>
            ) : moderationItems.length === 0 ? (
              <EmptyState
                title="운영 대상 게시물이 없습니다."
                description="벙개/은혜/기도/찬양 게시물이 여기에 통합 표시됩니다."
              />
            ) : (
              <div className="admin-list">
                {moderationItems.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="admin-list-row">
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="admin-type-badge">{item.typeLabel}</span>
                        <p style={{ fontWeight: 600 }}>{item.title}</p>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        작성자: {item.author}
                      </p>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                        작성일: {formatDateTime(item.createdAt, '날짜 미상')}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary admin-danger-button"
                      onClick={() => handleHardDelete(item)}
                      disabled={!supabaseStatus.configured || pendingModerationId === item.id || !item.id}
                    >
                      <Trash2 size={16} />
                      <span>{pendingModerationId === item.id ? '삭제 중...' : '영구 삭제'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default AdminPage
