#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_SOURCE_DIR = '/mnt/c/Users/MiniPC/Documents/Obsidian Vault/기본 데이터/역본/NKRV'
const SOURCE_DIR = process.env.NKRV_SOURCE_DIR || DEFAULT_SOURCE_DIR
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/nkrv')
const OUTPUT_BOOKS_DIR = path.join(OUTPUT_ROOT, 'books')

const BOOK_DIR_PATTERN = /^(\d+)-(.+)$/
const CHAPTER_FILE_PATTERN = /^(\d+)\.md$/i
const VERSE_LINE_PATTERN = /^(\d+)\.\s*(.+)$/

async function listDirectories(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function parseChapterMarkdown(markdown, chapterNumber) {
  const lines = String(markdown || '').split(/\r?\n/)
  const collected = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const matched = trimmed.match(VERSE_LINE_PATTERN)
    if (!matched) {
      continue
    }

    const verseNumber = toPositiveInteger(matched[1])
    if (!verseNumber) {
      continue
    }

    const verseText = String(matched[2] || '').trim()
    if (!verseText) {
      continue
    }

    collected.push({ verseNumber, verseText })
  }

  if (collected.length === 0) {
    throw new Error(`절 데이터를 찾지 못했습니다: chapter=${chapterNumber}`)
  }

  const maxVerseNumber = Math.max(...collected.map((entry) => entry.verseNumber))
  const verses = Array.from({ length: maxVerseNumber }, () => '')

  for (const row of collected) {
    verses[row.verseNumber - 1] = row.verseText
  }

  return verses
}

async function buildBookData(bookDirectoryName) {
  const matched = bookDirectoryName.match(BOOK_DIR_PATTERN)
  if (!matched) {
    return null
  }

  const order = toPositiveInteger(matched[1])
  const bookName = String(matched[2] || '').trim()

  if (!order || !bookName) {
    return null
  }

  const bookId = String(order).padStart(2, '0')
  const sourceBookDir = path.join(SOURCE_DIR, bookDirectoryName)
  const chapterEntries = await fs.readdir(sourceBookDir, { withFileTypes: true })

  const chapterFiles = chapterEntries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const chapterMatched = entry.name.match(CHAPTER_FILE_PATTERN)
      if (!chapterMatched) {
        return null
      }

      const chapterNumber = toPositiveInteger(chapterMatched[1])
      if (!chapterNumber) {
        return null
      }

      return {
        chapterNumber,
        filename: entry.name,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.chapterNumber - right.chapterNumber)

  if (chapterFiles.length === 0) {
    throw new Error(`장 파일을 찾지 못했습니다: ${sourceBookDir}`)
  }

  const chapters = []

  for (const chapterFile of chapterFiles) {
    const chapterPath = path.join(sourceBookDir, chapterFile.filename)
    const markdown = await fs.readFile(chapterPath, 'utf8')
    const verses = parseChapterMarkdown(markdown, chapterFile.chapterNumber)

    chapters.push({
      chapter: chapterFile.chapterNumber,
      verses,
    })
  }

  return {
    id: bookId,
    order,
    name: bookName,
    chapters,
  }
}

async function ensureDirectory(pathname) {
  await fs.mkdir(pathname, { recursive: true })
}

async function main() {
  const sourceStat = await fs.stat(SOURCE_DIR).catch(() => null)
  if (!sourceStat?.isDirectory()) {
    throw new Error(`NKRV 소스 경로를 찾을 수 없습니다: ${SOURCE_DIR}`)
  }

  await ensureDirectory(OUTPUT_BOOKS_DIR)

  const bookDirectories = (await listDirectories(SOURCE_DIR)).sort((left, right) =>
    left.localeCompare(right, 'ko-KR', { numeric: true }),
  )

  const builtBooks = []

  for (const directoryName of bookDirectories) {
    const built = await buildBookData(directoryName)
    if (!built) {
      continue
    }

    builtBooks.push(built)

    const outputPath = path.join(OUTPUT_BOOKS_DIR, `${built.id}.json`)
    await fs.writeFile(outputPath, JSON.stringify(built), 'utf8')
  }

  if (builtBooks.length === 0) {
    throw new Error('생성된 NKRV 권 데이터가 없습니다.')
  }

  const index = {
    version: 1,
    source: 'NKRV',
    generatedAt: new Date().toISOString(),
    books: builtBooks.map((book) => ({
      id: book.id,
      order: book.order,
      name: book.name,
      chapterCount: book.chapters.length,
    })),
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, 'index.json'), JSON.stringify(index), 'utf8')

  const chapterCount = builtBooks.reduce((sum, book) => sum + book.chapters.length, 0)
  const verseCount = builtBooks.reduce(
    (sum, book) => sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.verses.length, 0),
    0,
  )

  console.log(`NKRV 데이터 생성 완료: books=${builtBooks.length}, chapters=${chapterCount}, verses=${verseCount}`)
  console.log(`source=${SOURCE_DIR}`)
  console.log(`output=${OUTPUT_ROOT}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
