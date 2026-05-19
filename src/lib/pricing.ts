export type PricingRuleInput = {
  dayOfWeek: number | null;
  startTime: string | null; // 'HH:mm' or 'HH:mm:ss'
  endTime: string | null;
  multiplier: number;
  priority: number;
  active: boolean;
};

/**
 * Resolves the price for a slot by finding the highest-priority active pricing
 * rule that matches the slot's day-of-week and local start time. Each rule
 * criterion (dayOfWeek, start/endTime) is independent: null acts as wildcard.
 *
 * @param basePriceCents court.base_price_cents
 * @param rules          pricing rules already filtered to one court
 * @param localStart     slot local start time as 'HH:mm' (24h)
 * @param dayOfWeek      0=Sun .. 6=Sat in venue timezone
 */
export function resolvePriceCents(
  basePriceCents: number,
  rules: PricingRuleInput[],
  localStart: string,
  dayOfWeek: number,
): number {
  const startHm = normalizeHm(localStart);
  const matches = rules.filter((r) => r.active && ruleMatches(r, startHm, dayOfWeek));
  if (matches.length === 0) return basePriceCents;
  matches.sort((a, b) => b.priority - a.priority);
  const winner = matches[0]!;
  return Math.round(basePriceCents * winner.multiplier);
}

function ruleMatches(rule: PricingRuleInput, localStart: string, dayOfWeek: number): boolean {
  if (rule.dayOfWeek !== null && rule.dayOfWeek !== dayOfWeek) return false;

  const hasStart = rule.startTime !== null;
  const hasEnd = rule.endTime !== null;
  if (hasStart && hasEnd) {
    const s = normalizeHm(rule.startTime!);
    const e = normalizeHm(rule.endTime!);
    if (localStart < s || localStart >= e) return false;
  } else if (hasStart || hasEnd) {
    // Half-defined time range is invalid; skip rather than match incorrectly.
    return false;
  }
  return true;
}

function normalizeHm(input: string): string {
  // Postgres 'time' columns serialize as 'HH:MM:SS'. We compare on 'HH:mm'.
  return input.slice(0, 5);
}
