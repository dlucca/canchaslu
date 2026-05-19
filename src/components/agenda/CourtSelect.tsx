'use client';

export type Court = { id: string; name: string };

export function CourtSelect({
  courts,
  value,
  onChange,
}: {
  courts: Court[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-xs text-muted-foreground">Cancha</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Seleccionar cancha"
      >
        {courts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
