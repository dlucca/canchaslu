/**
 * Returns the [00:00, 00:00 next-day) UTC range corresponding to a calendar
 * date in the given IANA timezone. DST-safe: derives the offset from the
 * actual timezone rules at the moment of midnight on the given date.
 */
export function dateToVenueRangeUtc(
  date: string,
  venueTimezone: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = localMidnightToUtc(date, venueTimezone);
  const nextDay = addDaysIso(date, 1);
  const endUtc = localMidnightToUtc(nextDay, venueTimezone);
  return { startUtc, endUtc };
}

function localMidnightToUtc(date: string, tz: string): Date {
  // Strategy: take a UTC instant at the same wall-clock components, then ask
  // Intl what that instant looks like in the target tz. The delta tells us
  // the UTC offset to subtract.
  const [y, m, d] = date.split('-').map((p) => Number.parseInt(p, 10)) as [number, number, number];
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuess));

  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;

  const localY = Number.parseInt(lookup.year!, 10);
  const localM = Number.parseInt(lookup.month!, 10);
  const localD = Number.parseInt(lookup.day!, 10);
  const localH = Number.parseInt(lookup.hour === '24' ? '0' : lookup.hour!, 10);
  const localMin = Number.parseInt(lookup.minute!, 10);
  const localS = Number.parseInt(lookup.second!, 10);

  const localAsUtc = Date.UTC(localY, localM - 1, localD, localH, localMin, localS, 0);
  const offsetMs = localAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map((p) => Number.parseInt(p, 10)) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const next = new Date(t + days * 86_400_000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
