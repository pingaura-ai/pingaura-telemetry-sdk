# @pingaura/telemetry

[![npm](https://img.shields.io/npm/v/@pingaura/telemetry.svg)](https://www.npmjs.com/package/@pingaura/telemetry)
[![CI](https://github.com/pingaura-ai/pingaura-telemetry-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/pingaura-ai/pingaura-telemetry-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@pingaura/telemetry.svg)](./LICENSE)

First-party, privacy-respecting analytics SDK for server and edge runtimes. It
sends page views and custom events to the PingAura collector from your own
infrastructure, with no client-side script and no third-party cookies.

- **Zero runtime dependencies.**
- **Fire-and-forget.** Tracking never blocks, alters, or fails a request.
- **First-class entry points** for Next.js, Node/Express, and Cloudflare
  Workers, plus a generic client for any other JavaScript or TypeScript server.
- **ESM and CommonJS**, with bundled TypeScript types.

## Install

```bash
npm install @pingaura/telemetry
# or: pnpm add @pingaura/telemetry / yarn add @pingaura/telemetry
```

Requires Node.js 24+ (or any runtime with a global `fetch`).

## Configuration

Every entry point takes the same two required fields:

| Field      | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `writeKey` | Your ingest key, e.g. from `process.env.PINGAURA_INGEST_KEY`. |
| `domain`   | The site domain registered in PingAura, e.g. `"example.com"`. |

If either is missing or empty, the SDK becomes a no-op and warns once; it never
throws. Optional fields: `endpoint`, `timeoutMs`, `debug`, `keepalive`,
`fetchImpl`, `onWarn`.

## Usage

### Next.js middleware

```ts
// middleware.ts
import { createAnalyticsMiddleware } from '@pingaura/telemetry/next';
import { NextResponse } from 'next/server';

const track = createAnalyticsMiddleware({
  writeKey: process.env.PINGAURA_INGEST_KEY,
  domain: 'example.com',
});

export function middleware(req, event) {
  track(req, event);
  return NextResponse.next();
}
```

### Node / Express

```ts
import { analyticsMiddleware } from '@pingaura/telemetry/node';

app.use(
  analyticsMiddleware({
    writeKey: process.env.PINGAURA_INGEST_KEY,
    domain: 'example.com',
  }),
);
```

### Cloudflare Worker

```ts
import { trackEdge } from '@pingaura/telemetry/cloudflare';

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    trackEdge(request, response, ctx, {
      writeKey: env.PINGAURA_INGEST_KEY,
      domain: env.PINGAURA_DOMAIN,
    });
    return response;
  },
};
```

See [`examples/cloudflare-worker`](./examples/cloudflare-worker) for a complete,
deployable worker.

### Generic client

```ts
import { createClient } from '@pingaura/telemetry';

const client = createClient({
  writeKey: process.env.PINGAURA_INGEST_KEY,
  domain: 'example.com',
});

await client.pageView({ url: 'https://example.com/pricing', path: '/pricing' });
await client.track(
  'signup_completed',
  { plan: 'pro' },
  { url: 'https://example.com/welcome' },
);
```

## Event properties and PII

Custom `properties` are archived verbatim. **Never put PII in them**: no emails,
names, user IDs, or raw query strings. The collector rejects events whose values
look like PII. Use opaque or aggregate values only.

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # tsdown → dist/
```

## License

[Apache-2.0](./LICENSE) © PingAura AI
