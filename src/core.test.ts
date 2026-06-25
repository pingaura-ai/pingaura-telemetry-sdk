import { describe, it, expect, vi } from 'vitest';

import { createClient } from './core';
import { buildEvent } from './contract';

function fakeFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ accepted: 1, rejected: [] }), {
      status: 202,
    });
  });
  return { fn, calls };
}

const event = buildEvent({
  type: 'page_view',
  context: { url: 'https://x.com/a' },
});

describe('createClient.send', () => {
  it('POSTs the event batch to the endpoint with a Bearer secret', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.send(event);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://in.test/v1/events');
    expect(calls[0]!.init.method).toBe('POST');
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('authorization')).toBe('Bearer pa_k1_secret');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      domain: 'example.com',
      events: [event],
    });
  });

  it('defaults to the production ingest endpoint when none is given', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.send(event);
    expect(calls[0]!.url).toBe('https://telemetry.pingaura.ai/v1/events');
  });

  it('sets X-PA-Client-IP only when an ip is supplied; never in the body', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.send(event, { ip: '203.0.113.7' });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('x-pa-client-ip')).toBe('203.0.113.7');
    expect(String(calls[0]!.init.body)).not.toContain('203.0.113.7');
  });

  it('pageView swallows a synchronous buildEvent failure (never throws, never sends)', async () => {
    // buildEvent (crypto.randomUUID) runs synchronously while the argument to
    // send is evaluated; a throw there must not escape pageView into the
    // caller's request path.
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto unavailable');
    });
    try {
      const { fn } = fakeFetch();
      const client = createClient({
        writeKey: 'pa_k1_secret',
        domain: 'example.com',
        fetchImpl: fn as never,
      });
      let result: Promise<void> | undefined;
      expect(() => {
        result = client.pageView({ url: 'https://x.com/a' });
      }).not.toThrow();
      await expect(result).resolves.toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('drains the response body so keepalive sockets are released', async () => {
    const cancel = vi.fn(async () => {});
    const fn = vi.fn(
      async () => ({ status: 202, body: { cancel } }) as unknown as Response,
    );
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.send(event);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not throw when the response has no body to drain', async () => {
    const fn = vi.fn(async () => ({ status: 202 }) as unknown as Response);
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await expect(client.send(event)).resolves.toBeUndefined();
  });

  it('never throws when fetch rejects (best-effort)', async () => {
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: (() => Promise.reject(new Error('network'))) as never,
    });
    await expect(client.send(event)).resolves.toBeUndefined();
  });

  it('warns on a non-2xx response even when debug is off', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: 'domain_not_registered' }), {
          status: 403,
        })) as never,
    });
    await client.send(event);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('403');
  });

  it('warns when the 202 body reports rejected events', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            accepted: 0,
            rejected: [{ index: 0, reason: 'bad' }],
          }),
          { status: 202 },
        )) as never,
    });
    await client.send(event);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('1');
  });

  it('does not warn on a clean 202 (no rejected events)', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ accepted: 1, rejected: [] }), {
          status: 202,
        })) as never,
    });
    await client.send(event);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns only once for a repeated 4xx (never self-heals — no per-request spam)', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () => new Response('', { status: 403 })) as never,
    });
    await client.send(event);
    await client.send(event);
    await client.send(event);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not warn on a 429 when debug is off (transient)', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () => new Response('', { status: 429 })) as never,
    });
    await client.send(event);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn on a 5xx when debug is off (transient)', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (async () => new Response('', { status: 503 })) as never,
    });
    await client.send(event);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a 5xx when debug is on', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      debug: true,
      onWarn: warn,
      fetchImpl: (async () => new Response('', { status: 503 })) as never,
    });
    await client.send(event);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('503');
  });

  it('stays silent on a network error when debug is off', async () => {
    const warn = vi.fn();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      onWarn: warn,
      fetchImpl: (() => Promise.reject(new Error('network'))) as never,
    });
    await client.send(event);
    expect(warn).not.toHaveBeenCalled();
  });

  it('no-ops with a warning when writeKey is missing', async () => {
    const { fn } = fakeFetch();
    const warn = vi.fn();
    const client = createClient({
      writeKey: '',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
      onWarn: warn,
    });
    await client.send(event);
    expect(fn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('never throws when the event cannot be serialized (circular)', async () => {
    const { fn } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_secret',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    const circular = buildEvent({
      type: 'track',
      context: { url: 'https://x.com/a' },
    });
    (circular.properties as Record<string, unknown>).self = circular.properties; // circular ref
    await expect(client.send(circular)).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled(); // serialization failed before fetch
  });
});

describe('typed helpers', () => {
  it('pageView builds a page_view with forwarded UA in the event and ip in the header', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.pageView({
      url: 'https://x.com/blog/a',
      path: '/blog/a',
      referrer: 'https://chatgpt.com/',
      userAgent: 'GPTBot/1.0',
      ip: '203.0.113.7',
    });
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      events: { type: string; context: Record<string, unknown> }[];
    };
    const ev = body.events[0]!;
    expect(ev.type).toBe('page_view');
    expect(ev.context.url).toBe('https://x.com/blog/a');
    expect(ev.context.referrer).toBe('https://chatgpt.com/');
    expect(ev.context.user_agent).toBe('GPTBot/1.0');
    expect(ev.context.country).toBeUndefined(); // country is collector-derived, not client-sent
    expect(new Headers(calls[0]!.init.headers).get('x-pa-client-ip')).toBe(
      '203.0.113.7',
    );
  });

  it('track builds a track event with the name in properties', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.track(
      'signup',
      { plan: 'pro' },
      { url: 'https://x.com/welcome' },
    );
    const ev = (
      JSON.parse(String(calls[0]!.init.body)) as {
        events: { type: string; properties: Record<string, unknown> }[];
      }
    ).events[0]!;
    expect(ev.type).toBe('track');
    expect(ev.properties).toEqual({ name: 'signup', plan: 'pro' });
  });

  it('track keeps the positional name even if properties has a name key', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k1_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.track(
      'signup',
      { name: 'should-not-win', plan: 'pro' },
      { url: 'https://x.com/welcome' },
    );
    const ev = (
      JSON.parse(String(calls[0]!.init.body)) as {
        events: { properties: Record<string, unknown> }[];
      }
    ).events[0]!;
    expect(ev.properties.name).toBe('signup');
    expect(ev.properties.plan).toBe('pro');
  });
});

describe('domain in batch body', () => {
  it('includes the configured domain in the batch body', async () => {
    const calls: { body: string }[] = [];
    const client = createClient({
      writeKey: 'pa_test_key',
      endpoint: 'https://pa.example/v1/events',
      domain: 'Example.COM',
      fetchImpl: (async (_url: unknown, init: { body: string }) => {
        calls.push({ body: init.body });
        return new Response(null, { status: 202 });
      }) as unknown as typeof fetch,
    });
    await client.pageView({ url: 'https://example.com/a' });
    expect(JSON.parse(calls[0]!.body).domain).toBe('Example.COM');
  });

  it('warns and no-ops when domain is missing', async () => {
    const calls: { body: string }[] = [];
    const warnings: string[] = [];
    const client = createClient({
      writeKey: 'pa_test_key',
      endpoint: 'https://pa.example/v1/events',
      domain: '',
      onWarn: (m) => warnings.push(m),
      fetchImpl: (async (_url: unknown, init: { body: string }) => {
        calls.push({ body: init.body });
        return new Response(null, { status: 202 });
      }) as unknown as typeof fetch,
    });
    await client.pageView({ url: 'https://example.com/a' });
    expect(warnings.some((w) => w.includes('domain'))).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('keepalive opt-out + pageView properties', () => {
  it('omits keepalive (false) when configured', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
      keepalive: false,
    });
    await client.send(
      buildEvent({ type: 'page_view', context: { url: 'https://x.com/a' } }),
    );
    expect(
      (calls[0]!.init as RequestInit & { keepalive?: boolean }).keepalive,
    ).toBe(false);
  });

  it('defaults keepalive to true', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.send(
      buildEvent({ type: 'page_view', context: { url: 'https://x.com/a' } }),
    );
    expect(
      (calls[0]!.init as RequestInit & { keepalive?: boolean }).keepalive,
    ).toBe(true);
  });

  it('threads pageView properties into the event', async () => {
    const { fn, calls } = fakeFetch();
    const client = createClient({
      writeKey: 'pa_k_s',
      endpoint: 'https://in.test/v1/events',
      domain: 'example.com',
      fetchImpl: fn as never,
    });
    await client.pageView({
      url: 'https://x.com/a',
      properties: { cache_status: 'hit' },
    });
    const ev = (
      JSON.parse(String(calls[0]!.init.body)) as {
        events: { properties: Record<string, unknown> }[];
      }
    ).events[0]!;
    expect(ev.properties).toEqual({ cache_status: 'hit' });
  });
});
