import { defineConfig } from 'vitest/config'

// The `node` environment: every test here drives `run()` from `src/cli.ts` with
// a recording `Io`, a fake `fetch` and a temp-directory credential store. There
// is no browser and no running stack — a CLI whose suite needed either would be
// a CLI nobody could test on a plane.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
})
