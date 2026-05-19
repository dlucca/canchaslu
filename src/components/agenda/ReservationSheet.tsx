'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ReservationSheetSlot = {
  startsAtUtc: string;
  endsAtUtc: string;
  localStart: string;
  localEnd: string;
  priceCents: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  slot: ReservationSheetSlot | null;
  courtId: string;
  courtName: string;
  date: string;
  currency: string;
  depositPct?: number; // default 30
};

type FormState = {
  name: string;
  phone: string;
  email: string;
};

const INITIAL_FORM: FormState = { name: '', phone: '', email: '' };

export function ReservationSheet({
  open,
  onClose,
  slot,
  courtId,
  courtName,
  date,
  currency,
  depositPct = 30,
}: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function reset() {
    setForm(INITIAL_FORM);
    setSubmitting(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;

    const trimmedName = form.name.trim();
    if (trimmedName.length === 0) {
      setError('Ingresá tu nombre.');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(form.phone.trim())) {
      setError('WhatsApp en formato internacional, ej. +5491100000000.');
      return;
    }
    const emailTrimmed = form.email.trim();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('Email inválido.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtId,
          startsAtUtc: slot.startsAtUtc,
          endsAtUtc: slot.endsAtUtc,
          userName: trimmedName,
          userPhone: form.phone.trim(),
          userEmail: emailTrimmed || undefined,
        }),
      });
      if (res.status === 409) {
        toast.error('Ese horario se acaba de tomar. Refrescá la agenda.');
        setSubmitting(false);
        onClose();
        return;
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { issues?: Array<{ message?: string }> };
        const msg = body.issues?.[0]?.message ?? 'Datos inválidos.';
        setError(msg);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError('No se pudo crear la reserva. Intentá de nuevo.');
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { checkoutUrl: string };
      if (!body.checkoutUrl) {
        setError('Respuesta inesperada del servidor.');
        setSubmitting(false);
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch {
      setError('Error de red. Probá de nuevo.');
      setSubmitting(false);
    }
  }

  const deposit = slot ? Math.round((slot.priceCents * depositPct) / 100) : 0;
  const balance = slot ? slot.priceCents - deposit : 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Reservar {slot ? `${slot.localStart} – ${slot.localEnd}` : ''}</SheetTitle>
        </SheetHeader>

        {slot && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancha</span>
                <span className="font-medium">{courtName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha</span>
                <span className="font-medium">{date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horario</span>
                <span className="font-medium tabular-nums">
                  {slot.localStart} – {slot.localEnd}
                </span>
              </div>
              <hr className="my-2 border-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatCurrency(slot.priceCents, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seña ({depositPct}%)</span>
                <span className="font-semibold">{formatCurrency(deposit, currency)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>A pagar en el complejo</span>
                <span>{formatCurrency(balance, currency)}</span>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nombre</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                autoComplete="name"
                required
                className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">WhatsApp (con código país, ej. +54911...)</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+5491100000000"
                required
                className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Email (opcional)</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                autoComplete="email"
                inputMode="email"
                className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {error && (
              <div
                role="alert"
                className={cn(
                  'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive',
                )}
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="h-12 text-base">
                {submitting ? 'Procesando…' : 'Reservar y pagar seña'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={submitting}
                className="h-10"
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
