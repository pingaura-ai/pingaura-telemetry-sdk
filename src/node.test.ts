import { describe, it, expect, vi } from 'vitest';

import { analyticsMiddleware, capturePageView } from './node';
import { createClient } from './core';

describe('capturePageView', () => {
  it('reads headers + url and sends a page_view', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: {
        referer: 'https://chatgpt.com/',
        'user-agent': 'UA',
        'x-forwarded-for': '203.0.113.9',
      },
      url: 'https://site.com/p',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { context: Record<string, unknown> }[];
    };
    expect(body.events[0]!.context.referrer).toBe('https://chatgpt.com/');
    expect(body.events[0]!.context.user_agent).toBe('UA');
    expect(new Headers(callArgs.headers).get('x-pa-client-ip')).toBe(
      '203.0.113.9',
    );
  });

  it('rebuilds an absolute url from Host when given a bare path', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: { host: 'site.com', 'x-forwarded-proto': 'https' },
      url: '/pricing?ref=x',
    });
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { context: Record<string, unknown> }[];
    };
    expect(body.events[0]!.context.url).toBe('https://site.com/pricing?ref=x');
    expect(body.events[0]!.context.path).toBe('/pricing');
  });

  it('rebuilds a bare path from the registered domain, overriding the Host header', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: { host: '0.0.0.0:3000' },
      url: '/pricing?ref=x',
      domain: 'example.com',
    });
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { context: Record<string, unknown> }[];
    };
    expect(body.events[0]!.context.url).toBe(
      'https://example.com/pricing?ref=x',
    );
    expect(body.events[0]!.context.path).toBe('/pricing');
  });

  it('leaves an absolute url untouched when no domain is given (dev)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: {},
      url: 'http://localhost:3000/blog',
    });
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { context: Record<string, unknown> }[];
    };
    expect(body.events[0]!.context.url).toBe('http://localhost:3000/blog');
  });

  it('rebuilds a bind-address host from the registered domain', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: { referer: 'https://www.example.com/' },
      url: 'https://0.0.0.0:3000/pricing?ref=x',
      domain: 'example.com',
    });
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { context: Record<string, unknown> }[];
    };
    expect(body.events[0]!.context.url).toBe(
      'https://example.com/pricing?ref=x',
    );
    expect(body.events[0]!.context.path).toBe('/pricing');
  });
});

describe('analyticsMiddleware', () => {
  // Minimal ServerResponse stand-in: records the 'finish' listener so the test
  // can fire it with a chosen status code.
  const mockRes = (statusCode: number) => {
    let onFinish: (() => void) | undefined;
    return {
      statusCode,
      on: (event: string, cb: () => void) => {
        if (event === 'finish') onFinish = cb;
      },
      finish: () => onFinish?.(),
    };
  };

  const mkReq = (originalUrl: string, method = 'GET') => ({
    originalUrl,
    method,
    protocol: 'https',
    get: () => 'site.com',
    headers: { 'user-agent': 'UA' },
  });

  const mkCfg = (fetchImpl: unknown, extra = {}) => ({
    writeKey: 'pa_k_s',
    endpoint: 'https://in.test/v1/events',
    domain: 'example.com',
    fetchImpl: fetchImpl as never,
    ...extra,
  });

  it('does NOT track a HEAD request (Express auto-answers HEAD for GET routes)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware(mkCfg(fetchImpl));
    const res = mockRes(200);
    mw(mkReq('/blog/a', 'HEAD') as never, res as never, vi.fn());
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does NOT track a POST (a JSON 200 is not a page someone read)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware(mkCfg(fetchImpl));
    const res = mockRes(200);
    mw(mkReq('/login', 'POST') as never, res as never, vi.fn());
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lets shouldTrack force-track a non-GET and receives the method', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const seen: string[] = [];
    const mw = analyticsMiddleware(
      mkCfg(fetchImpl, {
        shouldTrack: (_p: string, req: { method: string }) => {
          seen.push(req.method);
          return true;
        },
      }),
    );
    const res = mockRes(200);
    mw(mkReq('/contact', 'POST') as never, res as never, vi.fn());
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['POST']);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('treats a missing method as a GET', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware(mkCfg(fetchImpl));
    const res = mockRes(200);
    // a caller predating the method check
    const req = {
      originalUrl: '/blog/a',
      protocol: 'https',
      get: () => 'site.com',
      headers: {},
    };
    mw(req as never, res as never, vi.fn());
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('tracks a real page (2xx) and calls next() exactly once', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const next = vi.fn();
    const res = mockRes(200);
    mw(mkReq('/blog/a') as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    // nothing fires until the response finishes
    expect(fetchImpl).not.toHaveBeenCalled();

    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does NOT track a non-2xx response (e.g. a scanner 404 probe)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const next = vi.fn();
    const res = mockRes(404);
    mw(mkReq('/wp-login.php') as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips static assets but still calls next()', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const next = vi.fn();
    const res = mockRes(200);
    mw(
      {
        originalUrl: '/logo.png',
        protocol: 'https',
        get: () => 'site.com',
        headers: {},
      } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('capturePageView — forwarded signals', () => {
  it('forwards header signals + is_browser_nav + http_version', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: {
        'user-agent': 'UA',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-ch-ua': '"Chromium";v="149"',
        'accept-language': 'en-US',
        accept: 'text/html',
      },
      url: 'https://site.com/p',
      httpVersion: '1.1',
    });
    const callArgs = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const body = JSON.parse(String(callArgs.body)) as {
      events: { signals: Record<string, unknown> }[];
    };
    expect(body.events[0]!.signals).toEqual({
      sec_fetch_mode: 'navigate',
      sec_fetch_site: 'none',
      sec_ch_ua: '"Chromium";v="149"',
      accept_language: 'en-US',
      accept: 'text/html',
      http_version: '1.1',
      is_browser_nav: true,
    });
  });
});

describe('analyticsMiddleware crawlers and response status', () => {
  const mockRes = (statusCode: number) => {
    let onFinish: (() => void) | undefined;
    return {
      statusCode,
      on: (event: string, cb: () => void) => {
        if (event === 'finish') onFinish = cb;
      },
      finish: () => onFinish?.(),
    };
  };

  type SentEvent = {
    context: Record<string, unknown>;
    signals?: Record<string, unknown>;
  };

  async function run(
    req: Record<string, unknown>,
    status: number,
  ): Promise<SentEvent[]> {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const res = mockRes(status);
    mw(req as never, res as never, vi.fn());
    res.finish();
    await new Promise((r) => setTimeout(r, 0));
    return fetchImpl.mock.calls.map((c) => {
      const init = (c as unknown as [string, RequestInit])[1];
      return (JSON.parse(String(init.body)) as { events: SentEvent[] })
        .events[0]!;
    });
  }

  const mkReq = (
    headers: Record<string, string>,
    method = 'GET',
    originalUrl = '/blog/a',
  ) => ({
    originalUrl,
    method,
    protocol: 'http',
    get: (n: string) => headers[n.toLowerCase()],
    headers,
  });

  it('sends the response status on a human page view', async () => {
    const [ev] = await run(
      mkReq({ host: 'site.com', 'user-agent': 'UA' }),
      200,
    );
    expect(ev!.context.status).toBe(200);
  });

  it('tracks a non-2xx response for a known AI crawler', async () => {
    const events = await run(
      mkReq({
        host: 'site.com',
        'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)',
      }),
      403,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.context.status).toBe(403);
  });

  it('tracks a HEAD from a request carrying a Signature header', async () => {
    const events = await run(
      mkReq({ host: 'site.com', signature: 'sig1=:AA==:' }, 'HEAD'),
      404,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.signals!.web_bot_auth).toEqual({
      signature: 'sig1=:AA==:',
      method: 'HEAD',
    });
  });

  it('still ignores a human 404', async () => {
    const events = await run(
      mkReq({ host: 'site.com', 'user-agent': 'Mozilla/5.0 Chrome/140' }),
      404,
    );
    expect(events).toHaveLength(0);
  });

  it('reports the host and raw path the signed request was sent to', async () => {
    const [ev] = await run(
      mkReq(
        {
          host: '0.0.0.0:3000',
          'x-forwarded-host': 'www.site.com, proxy.internal',
          'x-forwarded-proto': 'https',
          signature: 'sig1=:AA==:',
        },
        'GET',
        '/Docs/A%20B?x=1',
      ),
      200,
    );
    expect(ev!.context.url).toBe('https://www.site.com/Docs/A%20B?x=1');
  });

  it('uses the Host header for a signed request when no proxy header is set', async () => {
    const [ev] = await run(
      mkReq({ host: 'blog.site.com', signature: 'sig1=:AA==:' }, 'GET', '/a'),
      200,
    );
    const url = new URL(String(ev!.context.url));
    expect(url.host).toBe('blog.site.com');
    expect(url.pathname).toBe('/a');
  });

  it('keeps the registered domain for an unsigned request', async () => {
    const [ev] = await run(
      mkReq({ host: '0.0.0.0:3000', 'user-agent': 'UA' }),
      200,
    );
    expect(ev!.context.url).toBe('https://example.com/blog/a');
  });
});

describe('analyticsMiddleware crawler files', () => {
  async function statuses(ua: string, path: string, status: number) {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    let onFinish: (() => void) | undefined;
    const res = {
      statusCode: status,
      on: (_e: string, cb: () => void) => {
        onFinish = cb;
      },
    };
    const headers = { host: 'site.com', 'user-agent': ua };
    const req = {
      originalUrl: path,
      method: 'GET',
      protocol: 'https',
      get: (n: string) => headers[n.toLowerCase() as keyof typeof headers],
      headers,
    };
    mw(req as never, res as never, vi.fn());
    onFinish?.();
    await new Promise((r) => setTimeout(r, 0));
    return fetchImpl.mock.calls.map((c) => {
      const init = (c as unknown as [string, RequestInit])[1];
      return (
        JSON.parse(String(init.body)) as {
          events: { context: Record<string, unknown> }[];
        }
      ).events[0]!.context.status;
    });
  }

  it('tracks a crawler on each root crawler file, with its status', async () => {
    for (const path of [
      '/robots.txt',
      '/llms.txt',
      '/llms-full.txt',
      '/sitemap.xml',
    ])
      expect(await statuses('ClaudeBot/1.0', path, 200)).toEqual([200]);
  });

  it('ignores a human on /robots.txt', async () => {
    expect(
      await statuses('Mozilla/5.0 Chrome/140', '/robots.txt', 200),
    ).toEqual([]);
  });

  it('ignores a crawler on /favicon.ico', async () => {
    expect(await statuses('ClaudeBot/1.0', '/favicon.ico', 200)).toEqual([]);
  });
});

describe('capturePageView signed bare path', () => {
  it('keeps the bare path as requested on the client-facing host', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    await capturePageView(client, {
      headers: { host: 'www.site.com', signature: 'sig1=:AA==:' },
      url: '/Docs/A%20B?x=1',
      domain: 'example.com',
    });
    const init = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const ev = (
      JSON.parse(String(init.body)) as {
        events: { context: Record<string, unknown> }[];
      }
    ).events[0]!;
    expect(ev.context.url).toBe('https://www.site.com/Docs/A%20B?x=1');
    expect(ev.context.path).toBe('/Docs/A%20B');
  });
});
