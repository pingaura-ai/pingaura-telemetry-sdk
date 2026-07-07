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

The server adapters (`/next`, `/node`) rebuild each tracked URL's origin from
`domain`, keeping the request's path and query. Behind a proxy the request host
the server sees is its own bind address (`0.0.0.0:3000`), not the host the
browser used; rebuilding from the registered domain keeps tracked URLs and
same-site/visit attribution correct.
In local dev (no `domain`) the request URL is used as-is.

The rebuilt origin is `https://<domain>`, so server-side page views are
attributed to the registered domain even when served from a subdomain (each SDK
instance is configured for one registered site). If you call the lower-level
`capturePageView` directly (instead of the Express middleware), pass `domain`
yourself to get the same rewrite.

## Usage

### Next.js (App Router)

Tracking is server-side and status-accurate: a page_view fires only when a real
page renders, so scanner 404 probes (which render `not-found`) are never counted.
Two pieces: a header-only middleware, and a `<TrackPageView/>` component in the
pages you want tracked.

```ts
// middleware.ts
import { pingauraMiddleware } from '@pingaura/telemetry/next';

// Records the request path for <TrackPageView/>; tracks nothing itself.
export const middleware = pingauraMiddleware();

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
```

```tsx
// app/pricing/page.tsx (add to each page you track, NOT the root layout,
// which also wraps not-found and would re-count 404s)
import { TrackPageView } from '@pingaura/telemetry/next';

export default function Page() {
  return (
    <>
      <TrackPageView domain="example.com" />
      {/* ...page content... */}
    </>
  );
}
```

`<TrackPageView/>` reads request headers, which renders the tracked page
dynamically. Server-side rendering is what lets us count non-JS AI crawlers.
Sites that must stay fully static should track at the edge (see the Cloudflare
adapter) instead.

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

## Install with an AI agent

Prefer to let an AI coding agent (Claude Code, Cursor, Copilot, and similar) do
the wiring? Open your app in the agent and paste the prompt for your stack.
Replace `example.com` with your registered PingAura domain.

### Next.js

```text
Install and wire up the `@pingaura/telemetry` analytics SDK in this Next.js app.

Facts (use these, do not guess the API):
- npm package `@pingaura/telemetry`, entry point `@pingaura/telemetry/next`.
- Requires Node 24+ or a runtime with global `fetch`. Zero runtime dependencies.
- Fire-and-forget: missing config no-ops and warns once, never throws or blocks.

Do:
1. Install `@pingaura/telemetry` with the project's package manager (detect from the lockfile).
2. Create or edit `middleware.ts` at the project root: `export const middleware = pingauraMiddleware()`
   importing pingauraMiddleware from `@pingaura/telemetry/next`, plus a matcher config that skips
   `_next`, static assets, and `api`. If a middleware already exists, compose with
   pingauraRequestHeaders(req): return NextResponse.next({ request: { headers: pingauraRequestHeaders(req) } }).
   Preserve any existing middleware logic.
3. Add `<TrackPageView domain="example.com" />` (from `@pingaura/telemetry/next`) inside each page you
   want tracked, never in the root layout (it also wraps not-found, which would re-count 404s). For a
   shared route group, a `template.tsx` rendering it once covers every page in the group.
4. Add PINGAURA_INGEST_KEY to .env.example and .env.local (no real secret committed); note that the
   key comes from the PingAura dashboard.
5. Never put PII (emails, names, user IDs, raw query strings) in event properties.
6. Note that tracked pages render dynamically (server-side). Run typecheck/build, fix integration
   errors, then summarize files changed and env vars to set.
```

### Node / Express

```text
Install and wire up the `@pingaura/telemetry` analytics SDK in this Node/Express app.

Facts (use these, do not guess the API):
- npm package `@pingaura/telemetry`, entry point `@pingaura/telemetry/node`.
- Requires Node 24+ or a runtime with global `fetch`. Zero runtime dependencies.
- Fire-and-forget: missing config no-ops and warns once, never throws, always calls next().

Do:
1. Install `@pingaura/telemetry` with the project's package manager (detect from the lockfile).
2. Register the middleware early in the chain, before routes:
   app.use(analyticsMiddleware({ writeKey: process.env.PINGAURA_INGEST_KEY, domain: 'example.com' }))
   importing analyticsMiddleware from `@pingaura/telemetry/node`.
3. Add PINGAURA_INGEST_KEY to .env.example and .env (no real secret committed); note that the key
   comes from the PingAura dashboard.
4. Never put PII (emails, names, user IDs, raw query strings) in event properties.
5. Run typecheck/build, fix integration errors, then summarize files changed and env vars to set.
```

### Cloudflare Workers

```text
Install and wire up the `@pingaura/telemetry` analytics SDK in this Cloudflare Worker.

Facts (use these, do not guess the API):
- npm package `@pingaura/telemetry`, entry point `@pingaura/telemetry/cloudflare`.
- Reads only headers, never consumes the body, never throws. Dispatches via ctx.waitUntil.

Do:
1. Install `@pingaura/telemetry` with the project's package manager (detect from the lockfile).
2. In the fetch handler, after `const res = await fetch(request)`, call
   trackEdge(request, res, ctx, { writeKey: env.PINGAURA_INGEST_KEY, domain: env.PINGAURA_DOMAIN })
   and return res unchanged, importing trackEdge from `@pingaura/telemetry/cloudflare`.
3. Add PINGAURA_DOMAIN to [vars] in wrangler.toml, and set the ingest key as a secret with
   `npx wrangler secret put PINGAURA_INGEST_KEY` (do not hardcode it). Bump compatibility_date to a
   current date if needed.
4. Never put PII (emails, names, user IDs, raw query strings) in event properties.
5. Run typecheck/build, fix integration errors, then summarize files changed and the var/secret to set.
```

### Any other JS/TS server

```text
Install and wire up the `@pingaura/telemetry` analytics SDK in this server.

Facts (use these, do not guess the API):
- npm package `@pingaura/telemetry`, generic client export `createClient`.
- Requires Node 24+ or a runtime with global `fetch`. Zero runtime dependencies.
- Fire-and-forget: missing config no-ops and warns once, never throws.

Do:
1. Install `@pingaura/telemetry` with the project's package manager (detect from the lockfile).
2. Create one client at startup:
   const analytics = createClient({ writeKey: process.env.PINGAURA_INGEST_KEY, domain: 'example.com' })
   Call analytics.pageView({ url, path }) in the request handler, and
   analytics.track(name, properties, { url }) for custom events.
3. Add PINGAURA_INGEST_KEY to .env.example and the local env (no real secret committed); note that the
   key comes from the PingAura dashboard.
4. Never put PII (emails, names, user IDs, raw query strings) in event properties.
5. Run typecheck/build, fix integration errors, then summarize files changed and env vars to set.
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
