import { type AnalyticsClient, type PageViewInput, createClient } from './core';
import { domainOrigin } from './origin';

// Next.js App Router integration. A page_view fires only when a real page
// renders: middleware records the path, <TrackPageView/> emits from the page.
// A 404 renders not-found (no component), so it is never counted. Reading the
// path renders the page dynamically, which is what lets it count server-side,
// including non-JS crawlers. Fully-static sites should use the Cloudflare adapter.

// Minimal structural type; avoids a hard runtime dependency on `next`.
interface NextRequestLike {
  nextUrl: { pathname: string; search: string };
  headers: Headers;
}

/** Anything with a `.get()`: the standard `Headers` or Next's `ReadonlyHeaders`. */
interface HeadersLike {
  get(name: string): string | null;
}

// `next` is an optional peer, imported lazily. Use literal specifiers
// (`import('next/server')`); the edge-middleware runtime rejects variable ones.

/** Request header the middleware sets and <TrackPageView/> reads to learn its path. */
export const PINGAURA_PATH_HEADER = 'x-pa-path';

/**
 * Clone the request headers with the current path recorded, so a server-rendered
 * `<TrackPageView/>` can read it (Next doesn't expose the pathname to Server
 * Components). Overwrites any client-supplied value. Use when composing with an
 * existing middleware:
 *   return NextResponse.next({ request: { headers: pingauraRequestHeaders(req) } });
 */
export function pingauraRequestHeaders(req: NextRequestLike): Headers {
  const headers = new Headers(req.headers);
  headers.set(PINGAURA_PATH_HEADER, req.nextUrl.pathname + req.nextUrl.search);
  return headers;
}

/**
 * Standalone Next.js middleware. Records the request path for `<TrackPageView/>`;
 * it does NOT track anything itself.
 *   // middleware.ts
 *   export const middleware = pingauraMiddleware();
 *   export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'] };
 */
export function pingauraMiddleware(): (
  req: NextRequestLike,
) => Promise<Response> {
  return async (req) => {
    const { NextResponse } = await import('next/server');
    return NextResponse.next({
      request: { headers: pingauraRequestHeaders(req) },
    });
  };
}

/**
 * Build a page_view from request headers (path from the header set by
 * `pingauraMiddleware`). Returns null when that header is missing or not a
 * relative path, so nothing fires.
 */
export function buildPageViewFromHeaders(
  headers: HeadersLike,
  config: { domain?: string },
): PageViewInput | null {
  const rel = headers.get(PINGAURA_PATH_HEADER);
  if (!rel || !rel.startsWith('/')) return null;

  const path = rel.split('?')[0] || '/';
  const origin = domainOrigin(config.domain);
  let url: string;
  if (origin) {
    url = `${origin}${rel}`;
  } else {
    // dev / no registered domain: rebuild from the request host if we have one
    const host = headers.get('host');
    const proto = headers.get('x-forwarded-proto') ?? 'https';
    url = host ? `${proto}://${host}${rel}` : rel;
  }

  const xff = headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || undefined;

  return {
    url,
    path,
    referrer: headers.get('referer') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
    ip,
  };
}

export interface TrackPageViewProps {
  /** Defaults to `process.env.PINGAURA_INGEST_KEY`. */
  writeKey?: string;
  /** Defaults to `process.env.PINGAURA_TELEMETRY_DOMAIN` / `PINGAURA_DOMAIN`. */
  domain?: string;
  /** Override the ingest endpoint (region/dev/testing). */
  endpoint?: string;
  /** Extra properties archived with the view. Never pass PII. */
  properties?: Record<string, unknown>;
}

interface ResolvedConfig {
  writeKey?: string;
  domain?: string;
  endpoint?: string;
}

function resolveConfig(props: TrackPageViewProps): ResolvedConfig {
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    string | undefined
  >;
  return {
    writeKey: props.writeKey ?? env.PINGAURA_INGEST_KEY,
    domain:
      props.domain ?? env.PINGAURA_TELEMETRY_DOMAIN ?? env.PINGAURA_DOMAIN,
    endpoint: props.endpoint ?? env.PINGAURA_ENDPOINT,
  };
}

// One client per (key, domain, endpoint); avoids rebuilding and re-warning per render.
const clientCache = new Map<string, AnalyticsClient>();
function getClient(config: ResolvedConfig): AnalyticsClient {
  const cacheKey = `${config.writeKey}|${config.domain}|${config.endpoint ?? ''}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = createClient({
      writeKey: config.writeKey,
      domain: config.domain,
      endpoint: config.endpoint,
      keepalive: false,
    });
    clientCache.set(cacheKey, client);
  }
  return client;
}

/**
 * Async Server Component that records one page_view for the page it renders in.
 * Put it in pages you track, never the root layout (it wraps not-found, which
 * would re-count 404s). Needs `pingauraMiddleware` for the path. Emits via
 * `after()`; renders nothing. Reading the path renders the page dynamically.
 *
 *   import { TrackPageView } from '@pingaura/telemetry/next';
 *   export default function Page() {
 *     return (<><TrackPageView />{/* ... *\/}</>);
 *   }
 */
export async function TrackPageView(
  props: TrackPageViewProps = {},
): Promise<null> {
  const config = resolveConfig(props);
  // No key/domain: render nothing and skip headers() so the page stays static.
  if (!config.writeKey || !config.domain) return null;

  // The import can fail outside a Next runtime (e.g. tests); that's all we guard.
  let readHeaders: () => Promise<HeadersLike> | HeadersLike;
  try {
    ({ headers: readHeaders } = await import('next/headers'));
  } catch {
    return null;
  }

  // Read headers() OUTSIDE try/catch: the throw is Next's dynamic-render signal
  // and must propagate. Swallowing it would freeze the page static.
  const headerBag = await readHeaders();

  // Guard our own send path: a tracking failure must never break render.
  try {
    const data = buildPageViewFromHeaders(headerBag, config);
    if (!data) return null;
    if (props.properties) data.properties = props.properties;

    const client = getClient(config);
    // after() defers the send off the response critical path (Next 15+).
    const { after } = await import('next/server');
    after(() => client.pageView(data));
  } catch {
    // never break the page render
  }
  return null;
}
