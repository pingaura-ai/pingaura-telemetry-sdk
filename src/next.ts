import { type AnalyticsClient, type ClientConfig, createClient } from './core';
import { shouldTrackPath } from './matchers';
import { applyOrigin, domainOrigin } from './origin';

export { shouldTrackPath } from './matchers';

// Minimal structural types; avoids a hard runtime dependency on `next`.
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

export function extractRequestData(
  req: NextRequestLike,
  domain?: string,
): RequestData {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || undefined;
  // req.nextUrl.href carries the correct path/query but, behind a proxy, the
  // bind-address host (0.0.0.0:3000). Rebuild the origin from the registered
  // domain when we have one; otherwise keep the request url (correct in dev).
  const requestUrl = req.nextUrl.href || req.url;
  const origin = domainOrigin(domain);
  return {
    url: origin ? applyOrigin(requestUrl, origin) : requestUrl,
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
  // dispatch rides event.waitUntil; keepalive off, like the Cloudflare adapter
  const client: AnalyticsClient = createClient({ ...config, keepalive: false });
  const matcher = config.shouldTrack ?? shouldTrackPath;

  return (req, event) => {
    try {
      if (!matcher(req.nextUrl.pathname)) return;
      const data = extractRequestData(req, config.domain);
      event.waitUntil(client.pageView(data));
    } catch {
      // never block the request
    }
  };
}
