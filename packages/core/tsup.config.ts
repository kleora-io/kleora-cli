import { defineConfig } from 'tsup'

// ESM only, like the two tools that consume this library: the CLI and the MCP
// server are both ESM binaries, so there is no CommonJS consumer to serve.
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
  // platform when it is loaded, which is why the credential store imports it
  // dynamically. It is an optional dependency: a platform with no prebuilt
  // binary still installs and runs, on the 0600 file store.
  external: ['@napi-rs/keyring'],
})
