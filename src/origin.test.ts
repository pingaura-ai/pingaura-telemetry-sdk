import { describe, it, expect } from 'vitest';

import { domainOrigin, applyOrigin } from './origin';

describe('domainOrigin', () => {
  it('builds an https origin from a bare domain', () => {
    expect(domainOrigin('example.com')).toBe('https://example.com');
  });

  it('trims and lowercases', () => {
    expect(domainOrigin('  Example.COM ')).toBe('https://example.com');
  });

  it('returns undefined for empty/missing input', () => {
    expect(domainOrigin(undefined)).toBeUndefined();
    expect(domainOrigin('')).toBeUndefined();
    expect(domainOrigin('   ')).toBeUndefined();
  });

  it('tolerates an accidental scheme on the domain', () => {
    expect(domainOrigin('https://example.com')).toBe('https://example.com');
    expect(domainOrigin('http://example.com')).toBe('https://example.com');
  });

  it('tolerates an accidental trailing path on the domain', () => {
    expect(domainOrigin('example.com/foo')).toBe('https://example.com');
  });

  it('preserves an explicit port', () => {
    expect(domainOrigin('example.com:8080')).toBe('https://example.com:8080');
  });

  it('returns undefined for an unparseable host (fails safe)', () => {
    expect(domainOrigin('not a host')).toBeUndefined();
  });
});

describe('applyOrigin', () => {
  it('swaps scheme + host while preserving path, query, and hash', () => {
    expect(
      applyOrigin('https://0.0.0.0:3000/blog?ref=x#h', 'https://www.example.com'),
    ).toBe('https://www.example.com/blog?ref=x#h');
  });

  it('drops the bind-address port', () => {
    expect(applyOrigin('https://0.0.0.0:3000/pricing', 'https://example.com')).toBe(
      'https://example.com/pricing',
    );
  });

  it('applies a target origin that carries a port', () => {
    expect(applyOrigin('https://0.0.0.0:3000/pricing', 'https://example.com:8080')).toBe(
      'https://example.com:8080/pricing',
    );
  });

  it('returns the url unchanged when it is not absolute', () => {
    expect(applyOrigin('/pricing', 'https://example.com')).toBe('/pricing');
  });
});
