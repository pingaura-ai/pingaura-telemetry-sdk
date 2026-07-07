// Default path matcher shared by the next/node/cloudflare adapters.

const ASSET_EXT =
  /\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|txt|xml|json|woff2?|ttf|eot|mp4|webm)$/i;

/** Skip framework internals, API routes, and static assets. */
export function shouldTrackPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return false;
  if (pathname.startsWith('/api/')) return false;
  if (ASSET_EXT.test(pathname)) return false;
  return true;
}

/** True only for a final 2xx. A 3xx/4xx (e.g. scanner 404s)/5xx is not a page_view. */
export function isTrackableStatus(status: number | undefined): boolean {
  return typeof status === 'number' && status >= 200 && status < 300;
}
