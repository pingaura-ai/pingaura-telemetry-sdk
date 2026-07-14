import { describe, it, expect, vi } from 'vitest';

import {
  mapCacheStatus,
  isHtmlResponse,
  isTrackableStatus,
  trackEdge,
} from './cloudflare';

describe('mapCacheStatus', () => {
  it('maps Cloudflare statuses to the coarse vocab', () => {
    expect(mapCacheStatus('HIT')).toBe('hit');
    expect(mapCacheStatus('REVALIDATED')).toBe('hit');
    expect(mapCacheStatus('MISS')).toBe('miss');
    expect(mapCacheStatus('EXPIRED')).toBe('miss');
    expect(mapCacheStatus('STALE')).toBe('miss');
    expect(mapCacheStatus('UPDATING')).toBe('miss');
    expect(mapCacheStatus('BYPASS')).toBe('bypass');
    expect(mapCacheStatus('DYNAMIC')).toBe('bypass');
    expect(mapCacheStatus('NONE')).toBeUndefined();
    expect(mapCacheStatus(null)).toBeUndefined();
  });
});

function headers(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

describe('isHtmlResponse', () => {
  it('true only for text/html', () => {
    expect(
      isHtmlResponse({
        headers: headers({ 'content-type': 'text/html; charset=utf-8' }),
      }),
    ).toBe(true);
    expect(
      isHtmlResponse({
        headers: headers({ 'content-type': 'application/json' }),
      }),
    ).toBe(false);
    expect(isHtmlResponse({ headers: headers({}) })).toBe(false);
  });
});

describe('isTrackableStatus', () => {
  it('true only for a final 2xx', () => {
    expect(isTrackableStatus(200)).toBe(true);
    expect(isTrackableStatus(204)).toBe(true);
    expect(isTrackableStatus(299)).toBe(true);
    expect(isTrackableStatus(301)).toBe(false);
    expect(isTrackableStatus(304)).toBe(false);
    expect(isTrackableStatus(404)).toBe(false);
    expect(isTrackableStatus(500)).toBe(false);
    expect(isTrackableStatus(undefined)).toBe(false);
  });
});

describe('trackEdge', () => {
  const cfg = {
    writeKey: 'pa_k_s',
    endpoint: 'https://in.test/v1/events',
    domain: 'example.com',
  };

  function fakeFetch() {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 202 });
    });
    return { fn, calls };
  }

  it('emits a page_view with cache_status + cf ip for a trackable HTML response', async () => {
    const { fn, calls } = fakeFetch();
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = {
      url: 'https://site.com/blog/x?ref=1',
      headers: headers({
        referer: 'https://chatgpt.com/',
        'user-agent': 'UA',
        'cf-connecting-ip': '203.0.113.7',
      }),
    };
    const response = {
      status: 200,
      headers: headers({
        'content-type': 'text/html',
        'cf-cache-status': 'HIT',
      }),
    };
    trackEdge(request as never, response as never, ctx as never, {
      ...cfg,
      fetchImpl: fn as never,
    });
    expect(promises).toHaveLength(1);
    await Promise.all(promises);
    expect(fn).toHaveBeenCalledOnce();
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      events: {
        type: string;
        path: string;
        context: Record<string, unknown>;
        properties: Record<string, unknown>;
      }[];
    };
    const ev = body.events[0]!;
    expect(ev.type).toBe('page_view');
    expect(ev.context.path).toBe('/blog/x');
    expect(ev.properties).toEqual({ cache_status: 'hit' });
    expect(new Headers(calls[0]!.init.headers).get('x-pa-client-ip')).toBe(
      '203.0.113.7',
    );
    expect(
      (calls[0]!.init as RequestInit & { keepalive?: boolean }).keepalive,
    ).toBe(false);
  });

  it('skips non-HTML responses', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = { url: 'https://site.com/blog/x', headers: headers({}) };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'application/json' }),
    };
    trackEdge(request as never, response as never, ctx as never, cfg);
    expect(promises).toHaveLength(0);
  });

  it('skips asset paths even when HTML', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = { url: 'https://site.com/logo.png', headers: headers({}) };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'text/html' }),
    };
    trackEdge(request as never, response as never, ctx as never, cfg);
    expect(promises).toHaveLength(0);
  });

  it('never throws on a malformed request url', () => {
    const ctx = { waitUntil: () => {} };
    expect(() =>
      trackEdge(
        { url: 'not a url', headers: headers({}) } as never,
        { headers: headers({ 'content-type': 'text/html' }) } as never,
        ctx as never,
        cfg,
      ),
    ).not.toThrow();
  });

  it('does NOT emit for a non-2xx HTML response (scanner 404 probe)', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = {
      url: 'https://site.com/wp-login.php',
      headers: headers({ 'user-agent': 'UA' }),
    };
    // a 404 error page is served as text/html, so isHtmlResponse alone lets it through
    for (const status of [301, 404, 500]) {
      const response = { status, headers: headers({ 'content-type': 'text/html' }) };
      trackEdge(request as never, response as never, ctx as never, cfg);
    }
    expect(promises).toHaveLength(0);
  });

  it('does NOT emit for a HEAD request (static-export prefetch probe)', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    // Next.js prefetches links by probing the static HTML with HEAD. The
    // response is a 200 text/html, so path/status/content-type all pass.
    const request = {
      url: 'https://site.com/about/',
      method: 'HEAD',
      headers: headers({ referer: 'https://site.com/', 'user-agent': 'UA' }),
    };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'text/html' }),
    };
    trackEdge(request as never, response as never, ctx as never, cfg);
    expect(promises).toHaveLength(0);
  });

  it('counts one page_view per load, not one per prefetched link', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'text/html' }),
    };

    // one real navigation
    trackEdge(
      { url: 'https://site.com/', method: 'GET', headers: headers({}) } as never,
      response as never,
      ctx as never,
      cfg,
    );
    // plus the HEAD probes Next fires for every link in the viewport
    for (const path of ['/about/', '/blog/', '/pricing/']) {
      trackEdge(
        {
          url: `https://site.com${path}`,
          method: 'HEAD',
          headers: headers({ referer: 'https://site.com/' }),
        } as never,
        response as never,
        ctx as never,
        cfg,
      );
    }

    expect(promises).toHaveLength(1);
  });

  it('treats a missing method as a GET', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = { url: 'https://site.com/blog/x', headers: headers({}) };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'text/html' }),
    };
    trackEdge(request as never, response as never, ctx as never, cfg);
    expect(promises).toHaveLength(1);
  });

  it('honors a custom shouldTrack override', () => {
    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) };
    const request = { url: 'https://site.com/blog/x', headers: headers({}) };
    const response = {
      status: 200,
      headers: headers({ 'content-type': 'text/html' }),
    };

    // override forces NO tracking even for a normally-trackable HTML page
    trackEdge(request as never, response as never, ctx as never, {
      ...cfg,
      shouldTrack: () => false,
    });
    expect(promises).toHaveLength(0);

    // override forces tracking even for a path the default matcher would skip
    const asset = { url: 'https://site.com/logo.png', headers: headers({}) };
    trackEdge(asset as never, response as never, ctx as never, {
      ...cfg,
      shouldTrack: () => true,
    });
    expect(promises).toHaveLength(1);
  });
});
