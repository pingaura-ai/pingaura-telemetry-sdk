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

// Root files crawlers fetch to learn about a site; tracked for crawlers only.
const CRAWLER_FILES = new Set([
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
]);

/** True for a root crawler file such as `/robots.txt` (exact path match). */
export function isCrawlerFilePath(pathname: string): boolean {
  return CRAWLER_FILES.has(pathname);
}

/** True only for a final 2xx. A 3xx/4xx (e.g. scanner 404s)/5xx is not a page_view. */
export function isTrackableStatus(status: number | undefined): boolean {
  return typeof status === 'number' && status >= 200 && status < 300;
}

/**
 * True only for a GET. Only a GET renders a page someone actually looked at.
 * A HEAD returns the same 200 + text/html headers with no body, so nothing
 * else here can tell it apart — Next.js prefetches links by probing them with
 * HEAD, which would otherwise count as a page_view per link on screen.
 * Missing method means a caller that predates this check; assume GET.
 * For a crawler (`bot`), a HEAD counts too: it is a fetch, not a prefetch.
 */
export function isTrackableMethod(
  method: string | undefined,
  bot = false,
): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m === 'GET' || (bot && m === 'HEAD');
}

// User-Agent tokens of known AI crawlers and agents, matched case-insensitively.
const AI_CRAWLER_TOKENS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'OAI-AdsBot',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'GoogleOther',
  'Google-CloudVertexBot',
  'Google-NotebookLM',
  'Amazonbot',
  'Amzn-SearchBot',
  'Amzn-User',
  'meta-externalagent',
  'meta-webindexer',
  'meta-externalfetcher',
  'FacebookBot',
  'MistralAI-Index',
  'MistralAI-User',
  'CCBot',
  'cohere-training-data-crawler',
  'Bytespider',
  'TikTokSpider',
  'AI2Bot',
  'Diffbot',
  'ImagesiftBot',
  'Timpibot',
  'Omgilibot',
  'Webzio-Extended',
  'YouBot',
  'DuckAssistBot',
].map((t) => t.toLowerCase());

/**
 * True for a known AI crawler User-Agent, or for any request carrying an HTTP
 * message `Signature` header. Crawler requests are recorded whatever the
 * response, so a site can see what each crawler was served.
 */
export function looksLikeBot(
  userAgent: string | null | undefined,
  get: (name: string) => string | null | undefined,
): boolean {
  if (get('signature')?.trim()) return true;
  const ua = userAgent?.toLowerCase();
  return !!ua && AI_CRAWLER_TOKENS.some((t) => ua.includes(t));
}
