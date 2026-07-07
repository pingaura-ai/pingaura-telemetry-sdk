import { type ClientConfig, createClient } from './core';
import { isTrackableStatus, shouldTrackPath } from './matchers';

// Re-exported for back-compat; the shared definition lives in ./matchers.
export { isTrackableStatus } from './matchers';

// Structural Cloudflare types; no @cloudflare/workers-types runtime dependency.
interface CfRequestLike {
  url: string;
  headers: { get(name: string): string | null };
}
interface CfResponseLike {
  status: number;
  headers: { get(name: string): string | null };
}
interface CfCtxLike {
  waitUntil(promise: Promise<unknown>): void;
}

export type CacheStatus = 'hit' | 'miss' | 'bypass';

/** Map a Cloudflare `cf-cache-status` header to our coarse vocab. */
export function mapCacheStatus(header: string | null): CacheStatus | undefined {
  if (!header) return undefined;
  switch (header.toUpperCase()) {
    case 'HIT':
    case 'REVALIDATED':
      return 'hit';
    case 'MISS':
    case 'EXPIRED':
    case 'STALE':
    case 'UPDATING':
      return 'miss';
    case 'BYPASS':
    case 'DYNAMIC':
      return 'bypass';
    default:
      return undefined;
  }
}

/** True when the response is an HTML document (worth a page_view). */
export function isHtmlResponse(response: {
  headers: { get(name: string): string | null };
}): boolean {
  return (response.headers.get('content-type') ?? '')
    .toLowerCase()
    .includes('text/html');
}

export interface EdgeConfig extends ClientConfig {
  /** Override the default path matcher. */
  shouldTrack?: (pathname: string) => boolean;
}

/**
 * Fire-and-forget edge page_view. Reads only headers; never consumes the body;
 * never throws. Call from a Cloudflare Worker:
 *   const res = await fetch(request);
 *   trackEdge(request, res, ctx, { writeKey: env.PINGAURA_INGEST_KEY, domain: env.PINGAURA_DOMAIN });
 *   return res;
 */
export function trackEdge(
  request: CfRequestLike,
  response: CfResponseLike,
  ctx: CfCtxLike,
  config: EdgeConfig,
): void {
  try {
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return; // malformed url, skip
    }

    const matcher = config.shouldTrack ?? shouldTrackPath;
    if (
      !matcher(pathname) ||
      !isTrackableStatus(response.status) ||
      !isHtmlResponse(response)
    )
      return;

    // Workers use ctx.waitUntil for fire-and-forget; keepalive off.
    const client = createClient({ ...config, keepalive: false });
    const cacheStatus = mapCacheStatus(response.headers.get('cf-cache-status'));

    ctx.waitUntil(
      client.pageView({
        url: request.url,
        path: pathname,
        referrer: request.headers.get('referer') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        ip: request.headers.get('cf-connecting-ip') ?? undefined,
        properties: cacheStatus ? { cache_status: cacheStatus } : undefined,
      }),
    );
  } catch {
    // never throw into the request path
  }
}
