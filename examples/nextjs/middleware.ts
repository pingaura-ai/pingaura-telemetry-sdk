import { pingauraMiddleware } from '@pingaura/telemetry/next';

// Records the request path for <TrackPageView/>; tracks nothing itself.
export const middleware = pingauraMiddleware();

export const config = {
  // Skip framework internals, static assets, and the local collector under /api.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
