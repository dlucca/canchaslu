import { describe, expect, it } from 'vitest';

import { buildIcsEvent } from '@/lib/ics';

describe('buildIcsEvent', () => {
  const fixture = {
    reservationId: '550e8400-e29b-41d4-a716-446655440000',
    courtName: 'Cancha 1',
    venueName: 'Complejo Demo',
    venueAddress: 'Av. Siempreviva 742',
    startsAtUtc: new Date('2026-06-15T13:00:00.000Z'),
    endsAtUtc: new Date('2026-06-15T14:00:00.000Z'),
  };

  it('returns a valid VCALENDAR string', () => {
    const ics = buildIcsEvent(fixture);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0/);
    expect(ics).toMatch(/END:VCALENDAR\r\n?$/);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('uses reservationId as UID for idempotency', () => {
    const ics = buildIcsEvent(fixture);
    expect(ics).toContain(`UID:${fixture.reservationId}@canchaslu`);
  });

  it('encodes DTSTART and DTEND in UTC compact format', () => {
    const ics = buildIcsEvent(fixture);
    expect(ics).toContain('DTSTART:20260615T130000Z');
    expect(ics).toContain('DTEND:20260615T140000Z');
  });

  it('includes summary and location', () => {
    const ics = buildIcsEvent(fixture);
    expect(ics).toContain('SUMMARY:Cancha 1 - Complejo Demo');
    expect(ics).toContain('LOCATION:Av. Siempreviva 742');
  });
});
