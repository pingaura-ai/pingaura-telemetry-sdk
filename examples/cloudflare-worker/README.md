# Example: PingAura Cloudflare Edge Collector

A transparent, fail-open Cloudflare Worker that emits server-source `page_view`
events (including cache hits) to the PingAura collector, capturing `cache_status`
from `cf-cache-status`.

This is a standalone example — copy it into your own project and adapt.

## How it works

- Bound to your zone route(s), it proxies each request to origin
  (`fetch(request)`), returns the response **unchanged**, and fires a
  `page_view` on the side via `ctx.waitUntil`.
- Fail-open: any error returns origin (or 502); tracking never blocks your site.

## Deploy

1. `npm install` (pulls `@pingaura/telemetry` and the latest `wrangler`).
2. Set the secret: `npx wrangler secret put PINGAURA_INGEST_KEY` — an account
   API key with the `write` scope; treat it as a secret.
3. Replace `PINGAURA_DOMAIN = "example.com"` in `wrangler.toml` with the domain
   registered in PingAura.
4. Uncomment and edit `[[routes]]` for your zone, then `npx wrangler deploy`.

## Notes

- Bump `compatibility_date` in `wrangler.toml` to a current date before deploying.
- **Edge OR origin, not both.** If you also run the Node/Next server SDK at
  origin, cache-miss requests are counted twice (different `event_id`s that dedup
  can't merge). Cache hits never reach origin, so the inflation is uneven. Use the
  **edge** when you're behind Cloudflare (it also captures cache hits and
  edge-only AI crawlers), or the **origin SDK** otherwise.
- Scope the route to real page hostnames; don't let it re-match the Worker's own
  origin subrequest (avoids recursion).
- Verify real cache behavior with `npx wrangler dev` (cf-cache-status is not
  exercised by unit tests).
