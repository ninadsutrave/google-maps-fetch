import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // live tests call Google and need a key: npm run test:live
    exclude: [...configDefaults.exclude, 'test/live/**'],
  },
})
