import type { ForwardedSignals } from './contract';

type Getter = (name: string) => string | null | undefined;

// Caps mirror the collector's contract so an over-long header never causes the
// event to be rejected — we truncate client-side as belt-and-suspenders.
const CAP_SEC_FETCH = 32;
const CAP_SEC_CH_UA = 256;
const CAP_ACCEPT_LANGUAGE = 64;
const CAP_ACCEPT = 256;
const CAP_HTTP_VERSION = 16;

function clip(v: string | null | undefined, max: number): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

export interface ExtractSignalsOptions {
  /** Negotiated HTTP version of the visitor's request, if the adapter has it. */
  httpVersion?: string | null;
  /** True when this is a real document navigation (from the page-view path). */
  isBrowserNav?: boolean;
}

/**
 * Build the forwarded-signals block from a case-insensitive header getter.
 * Values are trimmed and capped to the collector's limits. `is_browser_nav` is
 * supplied by the caller (the adapter's page-view path), never read from the
 * headers under test.
 */
export function extractForwardedSignals(
  get: Getter,
  opts: ExtractSignalsOptions = {},
): ForwardedSignals {
  const s: ForwardedSignals = {};

  const secFetchMode = clip(get('sec-fetch-mode'), CAP_SEC_FETCH);
  if (secFetchMode) s.sec_fetch_mode = secFetchMode;

  const secFetchSite = clip(get('sec-fetch-site'), CAP_SEC_FETCH);
  if (secFetchSite) s.sec_fetch_site = secFetchSite;

  const secChUa = clip(get('sec-ch-ua'), CAP_SEC_CH_UA);
  if (secChUa) s.sec_ch_ua = secChUa;

  const acceptLanguage = clip(get('accept-language'), CAP_ACCEPT_LANGUAGE);
  if (acceptLanguage) s.accept_language = acceptLanguage;

  const accept = clip(get('accept'), CAP_ACCEPT);
  if (accept) s.accept = accept;

  const httpVersion = clip(opts.httpVersion, CAP_HTTP_VERSION);
  if (httpVersion) s.http_version = httpVersion;

  if (opts.isBrowserNav) s.is_browser_nav = true;

  return s;
}
