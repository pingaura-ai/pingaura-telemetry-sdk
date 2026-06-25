import {
  type AnalyticsEvent,
  type BuildEventInput,
  buildEvent,
} from './contract';

export interface ClientConfig {
  /** Ingest key (e.g. `process.env.PINGAURA_INGEST_KEY`). Missing/empty disables tracking. */
  writeKey: string | undefined;
  /** Ingest endpoint. Defaults to the production collector; override for region/dev/testing. */
  endpoint?: string;
  /** Registered site domain (e.g. "example.com"), required for attribution. Missing/empty disables tracking. */
  domain: string | undefined;
  timeoutMs?: number;
  debug?: boolean;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable warning sink; defaults to console.warn. */
  onWarn?: (message: string) => void;
  /** Pass keepalive on the fetch (default true). Set false in edge runtimes (use ctx.waitUntil). */
  keepalive?: boolean;
}

export interface SendOptions {
  /** Visitor IP — sent as the X-PA-Client-IP header, never in the body. */
  ip?: string;
}

export interface PageViewInput {
  url: string;
  path?: string;
  referrer?: string;
  title?: string;
  locale?: string;
  userAgent?: string;
  ip?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsClient {
  send(event: AnalyticsEvent, options?: SendOptions): Promise<void>;
  sendRaw(input: BuildEventInput, options?: SendOptions): Promise<void>;
  pageView(input: PageViewInput): Promise<void>;
  /** `properties` is archived verbatim — never pass PII; opaque/aggregate values only. */
  track(
    name: string,
    properties: Record<string, unknown> | undefined,
    context: { url: string; path?: string; referrer?: string },
  ): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_ENDPOINT = 'https://telemetry.pingaura.ai/v1/events';

// Reads a 2xx body (releasing the keepalive socket) and returns the collector's
// rejected count. Cancels the stream on a non-JSON body so the socket is freed.
async function drainAndCountRejected(res: Response): Promise<number> {
  try {
    if (typeof res.json === 'function') {
      const body = (await res.json()) as { rejected?: unknown };
      const rejected = body?.rejected;
      if (Array.isArray(rejected)) return rejected.length;
      if (typeof rejected === 'number') return rejected;
      return 0;
    }
  } catch {
    // not JSON / already consumed — fall through to cancel
  }
  await res.body?.cancel?.().catch(() => {});
  return 0;
}

export function createClient(config: ClientConfig): AnalyticsClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const warn = config.onWarn ?? ((m: string) => console.warn(m));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  // 4xx rejections never self-heal — warn once per status instead of per request.
  const warnedStatuses = new Set<number>();

  if (!config.writeKey)
    warn('[pingaura] writeKey missing — analytics disabled');
  if (!config.domain) warn('[pingaura] domain missing — analytics disabled');

  async function send(
    event: AnalyticsEvent,
    options: SendOptions = {},
  ): Promise<void> {
    if (!config.writeKey || !config.domain) return; // no-op (already warned at init)

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${config.writeKey}`,
    };
    if (options.ip) headers['x-pa-client-ip'] = options.ip;

    let body: string;
    try {
      body = JSON.stringify({ domain: config.domain, events: [event] });
    } catch (err) {
      if (config.debug)
        warn(`[pingaura] failed to serialize event: ${String(err)}`);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        // best-effort; ignored on older Node and rejected by some edge runtimes for large bodies
        keepalive: config.keepalive ?? true,
      });

      if (res.status < 200 || res.status >= 300) {
        let detail = '';
        try {
          detail = ((await res.text?.()) ?? '').slice(0, 200);
        } catch {
          // body unreadable — the status code alone is enough
        }
        const message = `[pingaura] ingest rejected (${res.status})${detail ? `: ${detail}` : ''}`;
        if (res.status === 429 || res.status >= 500) {
          // transient (rate-limit / server) — debug-only, same as network failures
          if (config.debug) warn(message);
        } else if (!warnedStatuses.has(res.status)) {
          // deterministic client error (bad key/domain/payload) — warn once
          warnedStatuses.add(res.status);
          warn(message);
        }
        return;
      }

      // 2xx: drain the body to release the keepalive socket and surface partial drops
      const rejected = await drainAndCountRejected(res);
      if (rejected > 0)
        warn(`[pingaura] ${rejected} event(s) rejected by collector`);
    } catch (err) {
      // network / abort / timeout — transient; quiet outside debug
      if (config.debug) warn(`[pingaura] send failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Build inside the guard so a synchronous throw (crypto.randomUUID) never
  // escapes into the caller's request path — every adapter is fire-and-forget.
  function safeSend(
    input: BuildEventInput,
    options?: SendOptions,
  ): Promise<void> {
    let event: AnalyticsEvent;
    try {
      event = buildEvent(input);
    } catch (err) {
      if (config.debug)
        warn(`[pingaura] failed to build event: ${String(err)}`);
      return Promise.resolve();
    }
    return send(event, options);
  }

  return {
    send,
    sendRaw: (input, options) => safeSend(input, options),
    pageView: (input) =>
      safeSend(
        {
          type: 'page_view',
          context: {
            url: input.url,
            path: input.path,
            referrer: input.referrer,
            title: input.title,
            locale: input.locale,
            user_agent: input.userAgent,
          },
          properties: input.properties,
        },
        { ip: input.ip },
      ),
    track: (name, properties = {}, context) =>
      safeSend({
        type: 'track',
        context: {
          url: context.url,
          path: context.path,
          referrer: context.referrer,
        },
        properties: { ...properties, name },
      }),
  };
}
