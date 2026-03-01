import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const repoName = globalThis.process?.env?.GITHUB_REPOSITORY?.split('/')[1]
  const base = command === 'serve' ? '/' : repoName ? `/${repoName}/` : '/'

  return {
    plugins: [react()],
    base,
  }
})
