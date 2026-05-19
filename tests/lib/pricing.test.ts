import { describe, expect, it } from 'vitest';

import { resolvePriceCents, type PricingRuleInput } from '@/lib/pricing';

const baseRule: PricingRuleInput = {
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  multiplier: 1,
  priority: 0,
  active: true,
};

describe('resolvePriceCents', () => {
  it('returns base price when no rules match', () => {
    expect(resolvePriceCents(1_000_000, [], '19:00', 3)).toBe(1_000_000);
  });

  it('applies a day-of-week rule when day matches', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
  });

  it('does not apply a day-of-week rule when day does not match', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 4)).toBe(1_000_000);
  });

  it('applies a time-range rule only when local time is inside [start, end)', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, startTime: '19:00', endTime: '23:00', multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '18:59', 3)).toBe(1_000_000);
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
    expect(resolvePriceCents(1_000_000, rules, '22:59', 3)).toBe(1_500_000);
    expect(resolvePriceCents(1_000_000, rules, '23:00', 3)).toBe(1_000_000);
  });

  it('picks the highest-priority rule among multiple matches', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.3, priority: 5 },
      { ...baseRule, dayOfWeek: 3, startTime: '19:00', endTime: '23:00', multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
  });

  it('ignores inactive rules', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10, active: false },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_000_000);
  });

  it('rounds the final price to the nearest cent', () => {
    const rules: PricingRuleInput[] = [{ ...baseRule, multiplier: 1.33, priority: 1 }];
    expect(resolvePriceCents(1_000_000, rules, '10:00', 3)).toBe(1_330_000);
  });
});
