import { describe, it, expect } from 'vitest';

import { isTrackableMethod, shouldTrackPath } from './matchers';

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
