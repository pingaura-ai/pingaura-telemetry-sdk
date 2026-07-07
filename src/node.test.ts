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
    expect(body.events[0]!.context.url).toBe('https://example.com/pricing?ref=x');
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
    expect(body.events[0]!.context.url).toBe('https://example.com/pricing?ref=x');
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

  const mkReq = (originalUrl: string) => ({
    originalUrl,
    protocol: 'https',
    get: () => 'site.com',
    headers: { 'user-agent': 'UA' },
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
