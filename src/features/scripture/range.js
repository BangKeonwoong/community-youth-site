import { getChapterByNumber } from './nkrvClient'

function toPositiveInteger(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.floor(parsed)
}

export function normalizeScriptureRange(rawRange) {
  const range = {
    startChapter: toPositiveInteger(rawRange?.startChapter),
    startVerse: toPositiveInteger(rawRange?.startVerse),
    endChapter: toPositiveInteger(rawRange?.endChapter),
    endVerse: toPositiveInteger(rawRange?.endVerse),
  }

  if (!range.startChapter || !range.startVerse || !range.endChapter || !range.endVerse) {
    return null
  }

  const invalidOrder =
    range.endChapter < range.startChapter ||
    (range.endChapter === range.startChapter && range.endVerse < range.startVerse)

  if (invalidOrder) {
    return null
  }

  return range
}

export function formatScriptureReference({
  bookName,
  startChapter,
  startVerse,
  endChapter,
  endVerse,
}) {
  const safeBookName = String(bookName || '').trim()

  if (!safeBookName) {
    return ''
  }

  if (startChapter === endChapter && startVerse === endVerse) {
    return `${safeBookName} ${startChapter}:${startVerse}`
  }

  if (startChapter === endChapter) {
    return `${safeBookName} ${startChapter}:${startVerse}-${endVerse}`
  }

  return `${safeBookName} ${startChapter}:${startVerse}-${endChapter}:${endVerse}`
}

export function extractScriptureRange(bookData, rawRange) {
  const range = normalizeScriptureRange(rawRange)
  if (!range) {
    return []
  }

  const verses = []

  for (let chapterNumber = range.startChapter; chapterNumber <= range.endChapter; chapterNumber += 1) {
    const chapter = getChapterByNumber(bookData, chapterNumber)
    if (!chapter) {
      return []
    }

    const startVerse = chapterNumber === range.startChapter ? range.startVerse : 1
    const endVerse = chapterNumber === range.endChapter ? range.endVerse : chapter.verses.length

    if (startVerse > chapter.verses.length || endVerse > chapter.verses.length) {
      return []
    }

    for (let verseNumber = startVerse; verseNumber <= endVerse; verseNumber += 1) {
      const verseText = String(chapter.verses[verseNumber - 1] ?? '').trim()
      if (!verseText) {
        continue
      }

      verses.push({
        chapter: chapterNumber,
        verse: verseNumber,
        text: verseText,
      })
    }
  }

  return verses
}

export function stringifyScriptureVerses(verses) {
  if (!Array.isArray(verses) || verses.length === 0) {
    return ''
  }

  return verses.map((verse) => `${verse.chapter}:${verse.verse} ${verse.text}`).join('\n')
}
