import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/next.ts', 'src/node.ts', 'src/cloudflare.ts'],
  format: ['esm', 'cjs'],
  target: 'node24',
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
});
