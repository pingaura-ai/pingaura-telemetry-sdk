import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/next.ts', 'src/node.ts', 'src/cloudflare.ts'],
  format: ['esm', 'cjs'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  // `next` is an optional peer reached via dynamic import. Keep it external so
  // the emitted specifier stays bare (`next/server`, not a resolved
  // `next/server.js`), the exports-safe form across Next versions.
  external: [/^next(\/|$)/],
});
