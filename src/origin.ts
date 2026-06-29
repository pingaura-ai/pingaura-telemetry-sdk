// Authoritative page-URL construction for server-side page_views.
//
// Behind a proxy the request host the
// server sees is its own bind address (e.g. `0.0.0.0:3000`), not the host the
// browser used. Trusting it makes same-site navigation look cross-origin and
// corrupts the archived url. The registered `domain` is the only
// server-controlled, always-present site identifier, so we rebuild the URL
// origin from it and keep the request's path + query.

/**
 * `https://<domain>` origin, or undefined when `domain` is empty/unparseable.
 * Tolerates an accidental scheme or trailing path on `domain` (a common
 * copy-paste mistake) rather than building a corrupt origin from it.
 */
export function domainOrigin(domain: string | undefined): string | undefined {
  let host = domain?.trim().toLowerCase();
  if (!host) return undefined;
  const scheme = host.indexOf('://'); // accidental scheme
  if (scheme !== -1) host = host.slice(scheme + 3);
  const slash = host.indexOf('/'); // accidental path
  if (slash !== -1) host = host.slice(0, slash);
  if (!host) return undefined;
  try {
    return new URL(`https://${host}`).origin;
  } catch {
    return undefined;
  }
}

/**
 * Replace the scheme + host of an absolute `url` with `origin`, keeping the
 * path, query, and hash. Returns `url` unchanged when it is not absolute.
 */
export function applyOrigin(url: string, origin: string): string {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    u.protocol = o.protocol;
    u.hostname = o.hostname;
    u.port = o.port; // '' when the origin has no port, which clears the old one
    return u.href;
  } catch {
    return url;
  }
}
