import { defineConfig } from 'tsup'

// ESM only. This package is a binary a person runs (`npx @kleora-io/cli`,
// or an installed `kleora`), never `require`d as a library, so there is no
// CJS consumer to serve and no dual-package hazard to avoid — the same
// reasoning the Kleora MCP server gives for its own single-format build.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // `@napi-rs/keyring` resolves a different native `.node` binding per
  // platform at its own require-time (`@kleora-io/core`'s credential
  // store loads it dynamically for exactly this reason). Bundling it would
  // have esbuild try to statically resolve every platform's binding at build
  // time, on the machine building this package, and fail on whichever ones are
  // not the one it is running on. It is also *optional* by design: a platform
  // with no prebuilt binary must still install and still run, on the 0600 file
  // store.
  external: ['@napi-rs/keyring'],
  banner: {
    // `bin.kleora` expects `dist/index.js` to be directly executable.
    js: '#!/usr/bin/env node',
  },
})
