import { describe, it, expect } from 'vitest';

import {
  isCrawlerFilePath,
  isTrackableMethod,
  looksLikeBot,
  shouldTrackPath,
} from './matchers';

describe('shouldTrackPath', () => {
  it('skips _next, api, and static assets; tracks real pages', () => {
    expect(shouldTrackPath('/blog/a')).toBe(true);
    expect(shouldTrackPath('/')).toBe(true);
    expect(shouldTrackPath('/_next/static/chunk.js')).toBe(false);
    expect(shouldTrackPath('/api/health')).toBe(false);
    expect(shouldTrackPath('/favicon.ico')).toBe(false);
    expect(shouldTrackPath('/images/logo.png')).toBe(false);
  });
  it('tracks slugs that merely contain an extension-like substring', () => {
    expect(shouldTrackPath('/docs/using-json')).toBe(true);
    expect(shouldTrackPath('/blog/parse-xml')).toBe(true);
  });
});

describe('isTrackableMethod', () => {
  it('true only for a GET', () => {
    expect(isTrackableMethod('GET')).toBe(true);
    expect(isTrackableMethod('get')).toBe(true);
    expect(isTrackableMethod('HEAD')).toBe(false);
    expect(isTrackableMethod('POST')).toBe(false);
    expect(isTrackableMethod('OPTIONS')).toBe(false);
  });
  it('assumes GET when the caller supplies no method', () => {
    expect(isTrackableMethod(undefined)).toBe(true);
  });
});

describe('isTrackableMethod for crawlers', () => {
  it('also allows HEAD, but nothing else', () => {
    expect(isTrackableMethod('GET', true)).toBe(true);
    expect(isTrackableMethod('head', true)).toBe(true);
    expect(isTrackableMethod('POST', true)).toBe(false);
    expect(isTrackableMethod(undefined, true)).toBe(true);
  });
});

describe('looksLikeBot', () => {
  const none = () => null;

  it('matches known AI crawler tokens, case-insensitively', () => {
    expect(looksLikeBot('Mozilla/5.0 (compatible; GPTBot/1.2)', none)).toBe(
      true,
    );
    expect(looksLikeBot('mozilla/5.0 claudebot/1.0', none)).toBe(true);
    expect(
      looksLikeBot('Mozilla/5.0 (compatible; PerplexityBot/1.0)', none),
    ).toBe(true);
    expect(looksLikeBot('meta-externalagent/1.1', none)).toBe(true);
  });

  it('is false for an ordinary browser', () => {
    expect(looksLikeBot('Mozilla/5.0 Chrome/140 Safari/537.36', none)).toBe(
      false,
    );
    expect(looksLikeBot(undefined, none)).toBe(false);
  });

  it('is true for any request carrying a Signature header', () => {
    const get = (n: string) => (n === 'signature' ? 'sig1=:AA==:' : null);
    expect(looksLikeBot('Mozilla/5.0 Chrome/140', get)).toBe(true);
  });

  it('ignores a blank Signature header', () => {
    const get = (n: string) => (n === 'signature' ? '  ' : null);
    expect(looksLikeBot('Mozilla/5.0 Chrome/140', get)).toBe(false);
  });
});

describe('isCrawlerFilePath', () => {
  it('matches the root crawler files exactly', () => {
    for (const p of [
      '/robots.txt',
      '/llms.txt',
      '/llms-full.txt',
      '/sitemap.xml',
    ])
      expect(isCrawlerFilePath(p)).toBe(true);
  });
  it('rejects other files and nested copies', () => {
    expect(isCrawlerFilePath('/favicon.ico')).toBe(false);
    expect(isCrawlerFilePath('/blog/robots.txt')).toBe(false);
    expect(isCrawlerFilePath('/sitemap-0.xml')).toBe(false);
  });
});
