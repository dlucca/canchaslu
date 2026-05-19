export type IcsEventInput = {
  reservationId: string;
  courtName: string;
  venueName: string;
  venueAddress: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
};

/**
 * Builds an RFC-5545 VCALENDAR string with a single VEVENT for the reservation.
 * Uses CRLF line endings as required by the spec.
 */
export function buildIcsEvent(input: IcsEventInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//canchaslu//reservation//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.reservationId}@canchaslu`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(input.startsAtUtc)}`,
    `DTEND:${formatIcsUtc(input.endsAtUtc)}`,
    `SUMMARY:${escapeIcs(`${input.courtName} - ${input.venueName}`)}`,
    `LOCATION:${escapeIcs(input.venueAddress)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

function formatIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
