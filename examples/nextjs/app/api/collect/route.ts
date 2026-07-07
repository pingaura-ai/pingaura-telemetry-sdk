// Local collector: records what the SDK emits so you can see which requests
// were (and were not) counted while developing.
//
// GET    → { count, events }   inspect what was recorded
// DELETE → resets the store
// POST   → the SDK ingest endpoint the example points at (see .env.local)

interface Recorded {
  at: number;
  type: unknown;
  path: unknown;
  url: unknown;
  userAgent: unknown;
}

const store: Recorded[] = ((
  globalThis as unknown as { __paEvents?: Recorded[] }
).__paEvents ??= []);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    events?: Array<{ type?: unknown; context?: Record<string, unknown> }>;
  };
  for (const e of body.events ?? []) {
    store.push({
      at: Date.now(),
      type: e?.type,
      path: e?.context?.path,
      url: e?.context?.url,
      userAgent: e?.context?.user_agent,
    });
  }
  return Response.json({ ok: true, rejected: [] });
}

export function GET() {
  return Response.json({ count: store.length, events: store });
}

export function DELETE() {
  store.length = 0;
  return Response.json({ ok: true });
}
