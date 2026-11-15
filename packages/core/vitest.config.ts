import { defineConfig } from 'vitest/config'

// The `node` environment: everything here talks to a fake `fetch` and a
// temp-directory credential store. No network and no running server.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
})
