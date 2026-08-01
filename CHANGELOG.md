# Changelog

Newest first. [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-28
- Server adapters now forward request signals (Sec-Fetch, Sec-CH-UA, Accept-Language, Accept — plus HTTP version on Node and Cloudflare) for server-side bot detection. Capped on send, stripped by the collector — never stored. Browser tracking unchanged.

## [0.2.1] - 2026-07-15
- Stop counting HEAD prefetch probes as page views.

## [0.2.0] - 2026-07-07
- Next.js server-side page-view tracking; counts real renders (incl. non-JS crawlers), 2xx only.

## [0.1.1] - 2026-06-29
- Fix page URL behind a proxy (rebuild from the registered domain).

## [0.1.0] - 2026-06-25
First release — first-party, server-side page-view telemetry.
- **Adapters:** Node/Express middleware, Next.js, and Cloudflare Worker (`trackEdge`).
- **Core client:** `pageView()` and `track()`, fire-and-forget (never blocks the response); the visitor IP is sent as a header, never in the body.
- **Gating:** static assets and non-page paths are skipped (method and HTTP-status gating came later, in 0.2.0–0.2.1).
- **Config:** ingest key + registered domain; endpoint override; request timeout and `keepalive` control.
- Zero runtime dependencies; ships ESM + CJS builds.
