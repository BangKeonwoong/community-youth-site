import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const BRAND_TITLE = 'Youth Community'

const PAGE_TITLE_MAP = {
  '/': '홈',
  '/login': '로그인',
  '/invite': '초대 가입',
  '/profile-complete': '프로필 설정',
  '/meetups': '벙개',
  '/schedule': '일정',
  '/grace': '은혜',
  '/prayer': '기도',
  '/praise': '찬양',
  '/birthdays': '생일',
  '/chat': '실시간 채팅',
  '/messages': '메시지',
  '/admin': '관리자',
}

function normalizePath(pathname) {
  const stripped = String(pathname || '/').replace(/\/+$/, '')
  return stripped || '/'
}

function resolveDocumentTitle(pathname) {
  const normalizedPath = normalizePath(pathname)
  const pageTitle = PAGE_TITLE_MAP[normalizedPath]

  if (!pageTitle) {
    return BRAND_TITLE
  }

  return `${pageTitle} | ${BRAND_TITLE}`
}

function DocumentTitleManager() {
  const location = useLocation()

  useEffect(() => {
    document.title = resolveDocumentTitle(location.pathname)
  }, [location.pathname])

  return null
}

export default DocumentTitleManager
