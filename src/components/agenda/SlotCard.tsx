import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export type SlotProps = {
  localStart: string;
  localEnd: string;
  priceCents: number;
  available: boolean;
  currency: string;
  onSelect: () => void;
};

export function SlotCard({ localStart, localEnd, priceCents, available, currency, onSelect }: SlotProps) {
  return (
    <button
      type="button"
      onClick={available ? onSelect : undefined}
      disabled={!available}
      className={cn(
        'w-full min-h-14 px-4 py-3 rounded-lg border flex items-center justify-between text-left transition-colors',
        available
          ? 'border-border bg-card hover:bg-accent active:bg-accent/80'
          : 'border-border bg-muted opacity-60 cursor-not-allowed',
      )}
      aria-disabled={!available}
    >
      <span className="font-medium tabular-nums">
        {localStart} – {localEnd}
      </span>
      <span className={cn('text-sm', available ? 'font-semibold' : 'text-muted-foreground')}>
        {available ? formatCurrency(priceCents, currency) : 'No disponible'}
      </span>
    </button>
  );
}
