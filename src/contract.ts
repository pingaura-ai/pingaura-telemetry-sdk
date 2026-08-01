// PingAura analytics event envelope. Zero runtime dependencies by design.

export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export const EVENT_TYPES = [
  'page_view',
  'page_leave',
  'web_vitals',
  'track',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventContext {
  url: string;
  path?: string;
  referrer?: string;
  title?: string;
  locale?: string;
  screen?: string;
  user_agent?: string;
  country?: string;
}

/**
 * Bot-detection signals observed on the visitor's inbound request, forwarded
 * for server-side scoring. All optional; the collector derives booleans and
 * strips this block before storage (never warehoused). `is_browser_nav` is set
 * from the adapter's page-view path (a real document navigation), never from
 * the headers below.
 */
export interface ForwardedSignals {
  sec_fetch_mode?: string;
  sec_fetch_site?: string;
  sec_ch_ua?: string;
  accept_language?: string;
  accept?: string;
  http_version?: string;
  is_browser_nav?: boolean;
}

export interface AnalyticsEvent {
  event_id: string;
  schema_version: typeof ANALYTICS_SCHEMA_VERSION;
  type: EventType;
  view_id?: string;
  timestamp: string;
  sent_at: string;
  context: EventContext;
  signals?: ForwardedSignals;
  properties: Record<string, unknown>;
  library?: { name: string; version: string };
}

export interface BuildEventInput {
  type: EventType;
  context: EventContext;
  /** Bot-detection signals from the visitor's request (server adapters only). */
  signals?: ForwardedSignals;
  /**
   * Event metadata, archived verbatim. Never put PII here (emails, names, user
   * IDs, raw query strings). The collector rejects events whose values look
   * like PII. Use opaque or aggregate values only.
   */
  properties?: Record<string, unknown>;
  timestamp?: string;
  view_id?: string;
  library?: { name: string; version: string };
}

/** Build a contract-valid event envelope. `now` is injectable for tests. */
export function buildEvent(
  input: BuildEventInput,
  now: () => string = () => new Date().toISOString(),
): AnalyticsEvent {
  const ts = input.timestamp ?? now();
  return {
    event_id: globalThis.crypto.randomUUID(),
    schema_version: ANALYTICS_SCHEMA_VERSION,
    type: input.type,
    view_id: input.view_id,
    timestamp: ts,
    sent_at: now(),
    context: input.context,
    signals: input.signals,
    properties: input.properties ?? {},
    library: input.library,
  };
}
