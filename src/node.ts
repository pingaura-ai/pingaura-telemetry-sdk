import { type AnalyticsClient, type ClientConfig, createClient } from './core';
import {
  isTrackableMethod,
  isTrackableStatus,
  shouldTrackPath,
} from './matchers';
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
  method?: string;
  protocol: string;
  headers: HeaderBag;
  get(name: string): string | undefined;
}
interface ServerResponseLike {
  statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
}
type NextFn = () => void;

export interface NodeMiddlewareConfig extends ClientConfig {
  /**
   * Override the default path + method gating and decide for yourself. Return
   * true to count something the defaults skip — e.g. a POST that renders a page
   * someone actually reads. The method is passed so you can still turn away
   * HEAD probes, which Express answers from the matching GET route.
   * Status gating still applies on top of this.
   */
  shouldTrack?: (pathname: string, request: { method: string }) => boolean;
}

/** Express/connect middleware. Fire-and-forget; always calls next(). */
export function analyticsMiddleware(
  config: NodeMiddlewareConfig,
): (req: ExpressReqLike, res: ServerResponseLike, next: NextFn) => void {
  const client = createClient(config);

  return (req, res, next) => {
    try {
      const pathname = req.originalUrl.split('?')[0] ?? '/';
      // A custom shouldTrack owns the path + method call entirely, so a consumer
      // can count something the defaults skip.
      const method = req.method ?? 'GET';
      const tracked = config.shouldTrack
        ? config.shouldTrack(pathname, { method })
        : shouldTrackPath(pathname) && isTrackableMethod(method);

      if (tracked) {
        const host = req.get('host') ?? 'localhost';
        const url = `${req.protocol}://${host}${req.originalUrl}`;
        const headers = req.headers;
        // Wait for the response to finish so we can gate on status:
        // non-2xx (scanner 404s, etc.) must not count.
        res.on('finish', () => {
          try {
            if (!isTrackableStatus(res.statusCode)) return;
            // fire-and-forget; swallow send errors, never surface to the request
            void capturePageView(client, {
              headers,
              url,
              domain: config.domain,
            }).catch(() => {});
          } catch {
            // never break the response
          }
        });
      }
    } catch {
      // never block the request
    }
    next();
  };
}
