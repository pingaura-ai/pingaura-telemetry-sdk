import { describe, expect, it } from 'vitest';

import { extractForwardedSignals } from './signals';

function getterFrom(headers: Record<string, string | null>) {
  return (name: string) => headers[name];
}

describe('extractForwardedSignals', () => {
  it('extracts the forwarded headers', () => {
    const s = extractForwardedSignals(
      getterFrom({
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-ch-ua': '"Chromium";v="149"',
        'accept-language': 'en-US,en;q=0.9',
        accept: 'text/html',
      }),
      { isBrowserNav: true },
    );
    expect(s).toEqual({
      sec_fetch_mode: 'navigate',
      sec_fetch_site: 'none',
      sec_ch_ua: '"Chromium";v="149"',
      accept_language: 'en-US,en;q=0.9',
      accept: 'text/html',
      is_browser_nav: true,
    });
  });

  it('omits missing/empty headers (null or blank)', () => {
    const s = extractForwardedSignals(
      getterFrom({ 'sec-fetch-mode': null, accept: '   ' }),
      {},
    );
    expect(s).toEqual({});
  });

  it('caps over-long values (never exceeds collector limits)', () => {
    const long = 'x'.repeat(500);
    const s = extractForwardedSignals(getterFrom({ 'sec-ch-ua': long, accept: long }));
    expect(s.sec_ch_ua!.length).toBe(256);
    expect(s.accept!.length).toBe(256);
  });

  it('includes http_version from opts, capped', () => {
    expect(extractForwardedSignals(getterFrom({}), { httpVersion: '1.1' }).http_version).toBe('1.1');
  });

  it('only sets is_browser_nav when opts say so', () => {
    expect(extractForwardedSignals(getterFrom({}), {}).is_browser_nav).toBeUndefined();
    expect(
      extractForwardedSignals(getterFrom({}), { isBrowserNav: true }).is_browser_nav,
    ).toBe(true);
  });
});
