import { Calendar, Heart, BookOpen, Music } from 'lucide-react'
import { useDashboardPage } from '../features/dashboard/hooks'

function formatDate(value) {
  if (!value) {
    return '날짜 미정'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '날짜 미정'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function InfoBanner({ message }) {
  return (
    <div
      className="glass"
      style={{
        marginBottom: '1.5rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid #f59e0b',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    </div>
  )
}

function DashboardContent() {
  const { supabaseStatus, profile, dashboard, isLoading, error } = useDashboardPage()

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>이번 주 우리들</h1>
        <p style={{ color: 'var(--text-secondary)' }}>최근 올라온 글과 모임을 한눈에 확인하세요.</p>
        {profile ? (
          <p style={{ marginTop: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            접속 프로필: {profile.displayName} ({profile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      {error ? (
        <div className="glass" style={{ padding: '1rem 1.25rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>대시보드를 불러오지 못했습니다.</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error.message}</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>최신 소식을 불러오는 중입니다...</p>
        </div>
      ) : null}

      {dashboard && !isLoading ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <SummaryCard icon={<Calendar size={20} />} label="모임" count={dashboard.totals.meetups} />
            <SummaryCard icon={<Heart size={20} />} label="은혜 나눔" count={dashboard.totals.gracePosts} />
            <SummaryCard
              icon={<BookOpen size={20} />}
              label="기도제목"
              count={dashboard.totals.prayerRequests}
            />
            <SummaryCard
              icon={<Music size={20} />}
              label="찬양 추천"
              count={dashboard.totals.praiseRecommendations}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <SectionCard
              title="최근 벙개 ✨"
              rows={dashboard.recentMeetups.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: `${formatDate(item.eventAt)} • ${item.location || '장소 미정'} • ${item.participantCount}명 참여`,
              }))}
            />
            <SectionCard
              title="은혜 나눔 💖"
              rows={dashboard.recentGracePosts.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: `${item.authorName} • 좋아요 ${item.likeCount}`,
              }))}
            />
            <SectionCard
              title="기도제목 🙏"
              rows={dashboard.recentPrayerRequests.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: `${item.authorName} • 기도할게 ${item.prayerCount}`,
              }))}
            />
            <SectionCard
              title="찬양 추천 🎵"
              rows={dashboard.recentPraiseRecommendations.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: `${item.artist || '아티스트 미정'} • 좋아요 ${item.likeCount}`,
              }))}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function SummaryCard({ icon, label, count }) {
  return (
    <div
      className="glass"
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '999px',
          backgroundColor: 'var(--accent-light)',
          color: 'var(--accent-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</p>
        <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{count}</p>
      </div>
    </div>
  )
}

function SectionCard({ title, rows }) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{title}</h2>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>아직 등록된 항목이 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              <p style={{ fontWeight: 600 }}>{row.title}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{row.subtitle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  return <DashboardContent />
}

export default Dashboard
