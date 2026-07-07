# Next.js example

A minimal App Router app showing how to wire up the `@pingaura/telemetry/next`
integration: a header-only middleware plus a `<TrackPageView/>` component in the
pages you want tracked. Not published (the package ships only `dist`).

By default it points the SDK at an in-app local collector (`app/api/collect`)
via `PINGAURA_ENDPOINT` in `.env.local`, so you can see exactly what gets
emitted while developing. In a real app you would leave `PINGAURA_ENDPOINT`
unset and use your real ingest key from the PingAura dashboard.

## Run

```bash
# from the SDK repo root, build the package first so link:../.. resolves to dist
pnpm build

cd examples/nextjs
pnpm install
pnpm dev            # http://localhost:3000
```

## What it shows

| Route | Counted? | Why |
|-------|----------|-----|
| `/` | yes (`path=/`) | real page renders `<TrackPageView/>` |
| `/pricing` | yes (`path=/pricing`) | real page; also shows `x-pa-path` reached the RSC |
| `/wp-login.php` | no | top-level 404 renders root `not-found.tsx` (no component) |
| `/blog/hello` | yes (`path=/blog/hello`) | real dynamic route |
| `/blog/missing` | no | nested `notFound()`; page never commits the component |
| soft nav `/` to `/pricing` | each counted | Server Component re-runs per navigation |

## Inspect the local collector

```bash
curl -s http://localhost:3000/api/collect        # { count, events }
curl -s -X DELETE http://localhost:3000/api/collect
```

Emits fire via `after()` (post-response), so allow ~0.5s after a request before
reading the collector.

## Notes

- `<TrackPageView/>` goes in **pages**, never in `app/layout.tsx` (the root
  layout wraps `not-found.tsx` too, which would re-count 404s).
- Placing it per-page excludes even nested `notFound()`. A route-group
  `template.tsx` instead trades that (it would count `/blog/missing`) for
  covering every page in the group with one line.
