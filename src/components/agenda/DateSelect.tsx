'use client';

import { MAX_ANTICIPATION_DAYS } from '@/lib/constants';

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function maxIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + MAX_ANTICIPATION_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export function DateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-xs text-muted-foreground">Fecha</span>
      <input
        type="date"
        value={value}
        min={todayIso()}
        max={maxIso()}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Seleccionar fecha"
      />
    </label>
  );
}
