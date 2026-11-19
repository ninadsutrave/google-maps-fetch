import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/live/**/*.test.ts'],
    // reads GOOGLE_MAPS_KEY from .env.local
    env: loadEnv('', process.cwd(), ''),
    testTimeout: 20_000,
    // one file at a time, so the run stays inside per-minute quotas
    fileParallelism: false,
  },
})
