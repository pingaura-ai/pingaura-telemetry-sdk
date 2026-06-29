import { type AnalyticsClient, type ClientConfig, createClient } from './core';
import { shouldTrackPath } from './matchers';
import { applyOrigin, domainOrigin } from './origin';

type HeaderBag = Record<string, string | string[] | undefined>;

function header(headers: HeaderBag, name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export interface CaptureInput {
  headers: HeaderBag;
  url: string;
  /**
   * Registered site domain (e.g. "example.com"). Behind a proxy the request
   * host is the bind address, not the public host, so the URL origin is rebuilt
   * from this when provided. See `domainOrigin`.
   */
  domain?: string;
}

/** Framework-agnostic page_view capture from a request-like object. */
export async function capturePageView(
  client: AnalyticsClient,
  input: CaptureInput,
): Promise<void> {
  const xff = header(input.headers, 'x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || undefined;
  const origin = domainOrigin(input.domain);
  let url = input.url;
  let path: string;
  try {
    path = new URL(input.url).pathname;
    // absolute url, but the host may be the bind address, so prefer the origin
    if (origin) url = applyOrigin(input.url, origin);
  } catch {
    // bare path (e.g. "/pricing"); rebuild an absolute URL, else the collector rejects the batch
    path = input.url.split('?')[0] ?? '/';
    const host = header(input.headers, 'host');
    const base =
      origin ??
      (host
        ? `${header(input.headers, 'x-forwarded-proto') ?? 'https'}://${host}`
        : undefined);
    if (base) url = `${base}${input.url}`;
  }
  await client.pageView({
    url,
    path,
    referrer: header(input.headers, 'referer'),
    userAgent: header(input.headers, 'user-agent'),
    ip,
  });
}

interface ExpressReqLike {
  originalUrl: string;
  protocol: string;
  headers: HeaderBag;
  get(name: string): string | undefined;
}
type NextFn = () => void;

export interface NodeMiddlewareConfig extends ClientConfig {
  shouldTrack?: (pathname: string) => boolean;
}

/** Express/connect middleware. Fire-and-forget; always calls next(). */
export function analyticsMiddleware(
  config: NodeMiddlewareConfig,
): (req: ExpressReqLike, _res: unknown, next: NextFn) => void {
  const client = createClient(config);
  const matcher = config.shouldTrack ?? shouldTrackPath;

  return (req, _res, next) => {
    try {
      const pathname = req.originalUrl.split('?')[0] ?? '/';
      if (matcher(pathname)) {
        const host = req.get('host') ?? 'localhost';
        const url = `${req.protocol}://${host}${req.originalUrl}`;
        // catch the build/send rejection so a voided promise never becomes a fatal unhandled rejection
        void capturePageView(client, {
          headers: req.headers,
          url,
          domain: config.domain,
        }).catch(() => {
          // never block the request
        });
      }
    } catch {
      // never block the request
    }
    next();
  };
}
