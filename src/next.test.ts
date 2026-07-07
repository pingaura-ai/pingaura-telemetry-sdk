import { describe, it, expect } from 'vitest';

import {
  buildPageViewFromHeaders,
  pingauraRequestHeaders,
  TrackPageView,
  PINGAURA_PATH_HEADER,
} from './next';

describe('pingauraRequestHeaders', () => {
  it('records pathname + search on the request headers for TrackPageView to read', () => {
    const req = {
      nextUrl: { pathname: '/blog/a', search: '?ref=x' },
      headers: new Headers({ 'user-agent': 'UA' }),
    };
    const headers = pingauraRequestHeaders(req as never);
    expect(headers.get(PINGAURA_PATH_HEADER)).toBe('/blog/a?ref=x');
    // preserves existing headers
    expect(headers.get('user-agent')).toBe('UA');
  });

  it('records just the pathname when there is no query string', () => {
    const req = {
      nextUrl: { pathname: '/pricing', search: '' },
      headers: new Headers(),
    };
    expect(pingauraRequestHeaders(req as never).get(PINGAURA_PATH_HEADER)).toBe(
      '/pricing',
    );
  });

  it('overwrites a client-supplied x-pa-path (spoofing defense)', () => {
    const req = {
      nextUrl: { pathname: '/pricing', search: '' },
      headers: new Headers({ [PINGAURA_PATH_HEADER]: '/admin/secret' }),
    };
    expect(pingauraRequestHeaders(req as never).get(PINGAURA_PATH_HEADER)).toBe(
      '/pricing',
    );
  });
});

describe('buildPageViewFromHeaders', () => {
  const mk = (init: Record<string, string>) => new Headers(init);

  it('returns null when the path header is absent (middleware not installed)', () => {
    expect(
      buildPageViewFromHeaders(mk({ 'user-agent': 'UA' }), {
        domain: 'example.com',
      }),
    ).toBeNull();
  });

  it('returns null when the path header is not a relative path (spoofed)', () => {
    expect(
      buildPageViewFromHeaders(
        mk({ [PINGAURA_PATH_HEADER]: 'https://evil.com/x' }),
        { domain: 'example.com' },
      ),
    ).toBeNull();
  });

  it('rebuilds an absolute url from the registered domain + recorded path', () => {
    const h = mk({
      [PINGAURA_PATH_HEADER]: '/pricing?ref=x',
      referer: 'https://chatgpt.com/',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    });
    const data = buildPageViewFromHeaders(h, { domain: 'example.com' });
    expect(data).not.toBeNull();
    expect(data!.url).toBe('https://example.com/pricing?ref=x');
    expect(data!.path).toBe('/pricing');
    expect(data!.referrer).toBe('https://chatgpt.com/');
    expect(data!.userAgent).toBe('Mozilla/5.0');
    expect(data!.ip).toBe('203.0.113.7');
  });

  it('falls back to the host header when no domain is registered (dev)', () => {
    const h = mk({
      [PINGAURA_PATH_HEADER]: '/blog/a',
      host: 'localhost:3000',
      'x-forwarded-proto': 'http',
    });
    const data = buildPageViewFromHeaders(h, {});
    expect(data!.url).toBe('http://localhost:3000/blog/a');
    expect(data!.path).toBe('/blog/a');
  });
});

describe('TrackPageView', () => {
  it('returns null (disabled) when no writeKey is configured, without reading headers', async () => {
    await expect(TrackPageView({ domain: 'example.com' })).resolves.toBeNull();
  });

  it('lets the headers() dynamic-rendering bailout propagate (not swallowed)', async () => {
    // Called outside a request scope, headers() throws: the same control-flow
    // signal Next uses to opt a route into dynamic rendering. TrackPageView must
    // NOT swallow it (swallowing would freeze the page static and disable
    // tracking); it must propagate.
    await expect(
      TrackPageView({ writeKey: 'pa_k_s', domain: 'example.com' }),
    ).rejects.toThrow(/outside a request scope/);
  });
});
