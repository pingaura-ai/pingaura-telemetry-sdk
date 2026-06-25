import { describe, it, expect } from 'vitest';

import { ANALYTICS_SCHEMA_VERSION, EVENT_TYPES, buildEvent } from './contract';

describe('vendored contract', () => {
  it('exposes the schema version and event types', () => {
    expect(ANALYTICS_SCHEMA_VERSION).toBe(1);
    expect(EVENT_TYPES).toContain('page_view');
    expect(EVENT_TYPES).toContain('track');
  });

  it('buildEvent stamps a uuid event_id, schema_version, and sent_at', () => {
    const e = buildEvent(
      { type: 'page_view', context: { url: 'https://x.com/a' } },
      () => '2026-06-04T10:00:00.000Z',
    );
    expect(e.type).toBe('page_view');
    expect(e.schema_version).toBe(1);
    expect(e.sent_at).toBe('2026-06-04T10:00:00.000Z');
    expect(e.timestamp).toBe('2026-06-04T10:00:00.000Z');
    expect(e.event_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(e.properties).toEqual({});
  });
});
