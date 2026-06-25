import { type AnalyticsClient, type ClientConfig, createClient } from './core';
import { shouldTrackPath } from './matchers';

export { shouldTrackPath } from './matchers';

// Minimal structural types — avoids a hard runtime dependency on `next`.
interface NextRequestLike {
  url: string;
  nextUrl: { pathname: string; href: string };
  headers: Headers;
}
interface FetchEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface RequestData {
  url: string;
  path: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
}

export function extractRequestData(req: NextRequestLike): RequestData {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || undefined;
  return {
    url: req.nextUrl.href || req.url,
    path: req.nextUrl.pathname,
    referrer: req.headers.get('referer') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip,
  };
}

export interface MiddlewareConfig extends ClientConfig {
  /** Override the default path matcher. */
  shouldTrack?: (pathname: string) => boolean;
}

/**
 * Returns a fire-and-forget tracker. Call it from your Next middleware:
 *   const track = createAnalyticsMiddleware({ writeKey, domain: 'example.com' });
 *   export function middleware(req, event) { track(req, event); return NextResponse.next(); }
 */
export function createAnalyticsMiddleware(
  config: MiddlewareConfig,
): (req: NextRequestLike, event: FetchEventLike) => void {
  // dispatch rides event.waitUntil — keepalive off, like the Cloudflare adapter
  const client: AnalyticsClient = createClient({ ...config, keepalive: false });
  const matcher = config.shouldTrack ?? shouldTrackPath;

  return (req, event) => {
    try {
      if (!matcher(req.nextUrl.pathname)) return;
      const data = extractRequestData(req);
      event.waitUntil(client.pageView(data));
    } catch {
      // never block the request
    }
  };
}
