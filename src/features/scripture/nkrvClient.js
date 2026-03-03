const BASE_URL = import.meta.env.BASE_URL || '/'
const INDEX_URL = `${BASE_URL}data/nkrv/index.json`
const BOOKS_DIR_URL = `${BASE_URL}data/nkrv/books`

let indexCache = null
const bookCache = new Map()

function toErrorMessage(error) {
  if (!error) {
    return 'NKRV 데이터를 불러오지 못했습니다.'
  }

  const message = String(error.message || '').trim()
  return message || 'NKRV 데이터를 불러오지 못했습니다.'
}

async function fetchJson(url, fallbackMessage) {
  const response = await fetch(url, { cache: 'force-cache' })

  if (!response.ok) {
    throw new Error(fallbackMessage)
  }

  try {
    return await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }
}

function normalizeBookId(bookId) {
  const text = String(bookId ?? '').trim()
  if (!text) {
    return ''
  }

  const digits = text.replace(/[^0-9]/g, '')
  if (!digits) {
    return ''
  }

  return digits.padStart(2, '0')
}

function normalizeBookIndexEntry(entry) {
  return {
    id: normalizeBookId(entry?.id),
    order: Number(entry?.order ?? 0) || 0,
    name: String(entry?.name || '').trim(),
    chapterCount: Number(entry?.chapterCount ?? 0) || 0,
  }
}

function normalizeBookData(bookData) {
  const chapters = Array.isArray(bookData?.chapters)
    ? bookData.chapters
        .map((chapterRow) => ({
          chapter: Number(chapterRow?.chapter ?? 0) || 0,
          verses: Array.isArray(chapterRow?.verses)
            ? chapterRow.verses.map((verseText) => String(verseText ?? ''))
            : [],
        }))
        .filter((chapterRow) => chapterRow.chapter > 0)
        .sort((left, right) => left.chapter - right.chapter)
    : []

  return {
    id: normalizeBookId(bookData?.id),
    order: Number(bookData?.order ?? 0) || 0,
    name: String(bookData?.name || '').trim(),
    chapters,
  }
}

export async function getNkrvBookIndex() {
  if (indexCache) {
    return indexCache
  }

  try {
    const raw = await fetchJson(INDEX_URL, 'NKRV 성경 인덱스 파일을 찾지 못했습니다.')
    const books = Array.isArray(raw?.books) ? raw.books.map(normalizeBookIndexEntry) : []
    indexCache = books.filter((book) => book.id && book.name)
    return indexCache
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function getNkrvBookData(bookId) {
  const normalizedBookId = normalizeBookId(bookId)
  if (!normalizedBookId) {
    throw new Error('성경 권 정보를 찾을 수 없습니다.')
  }

  if (bookCache.has(normalizedBookId)) {
    return bookCache.get(normalizedBookId)
  }

  try {
    const raw = await fetchJson(
      `${BOOKS_DIR_URL}/${normalizedBookId}.json`,
      '선택한 성경 권의 데이터를 찾지 못했습니다.',
    )
    const normalized = normalizeBookData(raw)
    bookCache.set(normalizedBookId, normalized)
    return normalized
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

export function getChapterByNumber(bookData, chapterNumber) {
  if (!bookData?.chapters?.length) {
    return null
  }

  const chapter = Number(chapterNumber)
  if (!Number.isFinite(chapter) || chapter <= 0) {
    return null
  }

  return bookData.chapters.find((row) => row.chapter === chapter) || null
}
