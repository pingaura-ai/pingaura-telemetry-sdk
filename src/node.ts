import { type AnalyticsClient, type ClientConfig, createClient } from './core';
import {
  isCrawlerFilePath,
  isTrackableMethod,
  isTrackableStatus,
  looksLikeBot,
  shouldTrackPath,
} from './matchers';
import { applyOrigin, clientOrigin, domainOrigin } from './origin';
import { extractForwardedSignals } from './signals';

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
  /** Negotiated HTTP version of the visitor's request (e.g. Express `req.httpVersion`). */
  httpVersion?: string;
  /** HTTP status of the response (e.g. Express `res.statusCode`). */
  status?: number;
  /** Request method, forwarded with any request signature headers. */
  method?: string;
}

/** Framework-agnostic page_view capture from a request-like object. */
export async function capturePageView(
  client: AnalyticsClient,
  input: CaptureInput,
): Promise<void> {
  const get = (n: string) => header(input.headers, n);
  const xff = get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || undefined;
  const origin = domainOrigin(input.domain);
  let url = input.url;
  let path: string;
  let target: string; // path + query as requested
  let proto: string | undefined;
  try {
    const u = new URL(input.url);
    path = u.pathname;
    target = u.pathname + u.search;
    proto = u.protocol.replace(/:$/, '');
    // absolute url, but the host may be the bind address, so prefer the origin
    if (origin) url = applyOrigin(input.url, origin);
  } catch {
    // bare path (e.g. "/pricing"); rebuild an absolute URL, else the collector rejects the batch
    path = input.url.split('?')[0] ?? '/';
    target = input.url;
    const host = get('host');
    const base =
      origin ??
      (host ? `${get('x-forwarded-proto') ?? 'https'}://${host}` : undefined);
    if (base) url = `${base}${input.url}`;
  }
  // A signature covers the host the client addressed, so keep that host.
  if (get('signature')?.trim()) {
    const signed = clientOrigin(get, proto);
    if (signed) url = `${signed}${target}`;
  }
  await client.pageView({
    url,
    path,
    referrer: get('referer'),
    userAgent: get('user-agent'),
    ip,
    status: input.status,
    // A tracked page path that rendered (2xx, or status unknown) is a document navigation.
    signals: extractForwardedSignals(get, {
      httpVersion: input.httpVersion,
      isBrowserNav:
        input.status === undefined || isTrackableStatus(input.status),
      method: input.method,
    }),
  });
}

interface ExpressReqLike {
  originalUrl: string;
  method?: string;
  protocol: string;
  headers: HeaderBag;
  httpVersion?: string;
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
   * Status gating still applies on top of this, except for crawler requests,
   * which are recorded with any status.
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
      const bot = looksLikeBot(header(req.headers, 'user-agent'), (n) =>
        header(req.headers, n),
      );
      const tracked = config.shouldTrack
        ? config.shouldTrack(pathname, { method })
        : (shouldTrackPath(pathname) || (bot && isCrawlerFilePath(pathname))) &&
          isTrackableMethod(method, bot);

      if (tracked) {
        const host = req.get('host') ?? 'localhost';
        const url = `${req.protocol}://${host}${req.originalUrl}`;
        const headers = req.headers;
        const httpVersion = req.httpVersion;
        // Wait for the response to finish so we can gate on status:
        // non-2xx (scanner 404s, etc.) must not count, unless a crawler got it.
        res.on('finish', () => {
          try {
            if (!bot && !isTrackableStatus(res.statusCode)) return;
            // fire-and-forget; swallow send errors, never surface to the request
            void capturePageView(client, {
              headers,
              url,
              domain: config.domain,
              httpVersion,
              status: res.statusCode,
              method,
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
