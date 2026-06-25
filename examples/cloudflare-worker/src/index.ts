import { trackEdge } from '@pingaura/telemetry/cloudflare';

interface Env {
  PINGAURA_INGEST_KEY: string;
  PINGAURA_DOMAIN: string;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

// Transparent, fail-open proxy: tracking can never alter or block the response.
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      return new Response('origin unavailable', { status: 502 });
    }

    try {
      trackEdge(request, response, ctx, {
        writeKey: env.PINGAURA_INGEST_KEY,
        domain: env.PINGAURA_DOMAIN,
      });
    } catch {
      // tracking is best-effort and must never affect the response
    }

    return response;
  },
};
