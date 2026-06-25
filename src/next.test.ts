import { describe, it, expect, vi } from 'vitest';

import {
  shouldTrackPath,
  extractRequestData,
  createAnalyticsMiddleware,
} from './next';

describe('shouldTrackPath (default matcher)', () => {
  it('skips _next, api, and static assets; tracks real pages', () => {
    expect(shouldTrackPath('/blog/a')).toBe(true);
    expect(shouldTrackPath('/')).toBe(true);
    expect(shouldTrackPath('/_next/static/chunk.js')).toBe(false);
    expect(shouldTrackPath('/api/health')).toBe(false);
    expect(shouldTrackPath('/favicon.ico')).toBe(false);
    expect(shouldTrackPath('/images/logo.png')).toBe(false);
  });
});

describe('extractRequestData', () => {
  it('pulls url, path, referrer, user-agent, and first-hop ip from a request-like object', () => {
    const req = {
      url: 'https://site.com/blog/a?ref=x',
      nextUrl: { pathname: '/blog/a', href: 'https://site.com/blog/a?ref=x' },
      headers: new Headers({
        referer: 'https://chatgpt.com/',
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      }),
    };
    const data = extractRequestData(req as never);
    expect(data.path).toBe('/blog/a');
    expect(data.url).toBe('https://site.com/blog/a?ref=x');
    expect(data.referrer).toBe('https://chatgpt.com/');
    expect(data.userAgent).toBe('Mozilla/5.0');
    expect(data.ip).toBe('203.0.113.7');
  });
});

describe('createAnalyticsMiddleware', () => {
  it('calls waitUntil with a pageView for a tracked path and skips assets', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const track = createAnalyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });

    const promises: Promise<unknown>[] = [];
    const event = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const mkReq = (pathname: string) => ({
      url: `https://site.com${pathname}`,
      nextUrl: { pathname, href: `https://site.com${pathname}` },
      headers: new Headers({ 'user-agent': 'UA' }),
    });

    track(mkReq('/_next/static/x.js') as never, event as never);
    expect(promises).toHaveLength(0);

    track(mkReq('/blog/a') as never, event as never);
    expect(promises).toHaveLength(1);
    await Promise.all(promises);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('never throws into the middleware when event construction fails', () => {
    // buildEvent runs crypto.randomUUID synchronously; if it throws, the
    // fire-and-forget tracker must swallow it, not fail the user's request.
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto unavailable');
    });
    try {
      const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
      const track = createAnalyticsMiddleware({
        writeKey: 'pa_k_s',
        domain: 'example.com',
        fetchImpl: fetchImpl as never,
      });
      const event = { waitUntil: vi.fn() };
      const req = {
        url: 'https://site.com/blog/a',
        nextUrl: { pathname: '/blog/a', href: 'https://site.com/blog/a' },
        headers: new Headers(),
      };
      expect(() => track(req as never, event as never)).not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('disables keepalive (dispatch rides waitUntil, not the request socket)', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response('{}', { status: 202 }),
    );
    const track = createAnalyticsMiddleware({
      writeKey: 'pa_k_s',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const promises: Promise<unknown>[] = [];
    const event = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const req = {
      url: 'https://site.com/blog/a',
      nextUrl: { pathname: '/blog/a', href: 'https://site.com/blog/a' },
      headers: new Headers({ 'user-agent': 'UA' }),
    };
    track(req as never, event as never);
    await Promise.all(promises);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]![1].keepalive).toBe(false);
  });
});
