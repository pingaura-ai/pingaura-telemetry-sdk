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
});

describe('analyticsMiddleware', () => {
  it('tracks a real page and calls next() exactly once', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const mw = analyticsMiddleware({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fetchImpl as never,
    });
    const next = vi.fn();
    mw(
      {
        originalUrl: '/blog/a',
        protocol: 'https',
        get: () => 'site.com',
        headers: { 'user-agent': 'UA' },
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).toHaveBeenCalledOnce();
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
    mw(
      {
        originalUrl: '/logo.png',
        protocol: 'https',
        get: () => 'site.com',
        headers: {},
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
