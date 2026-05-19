'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';

type Props = {
  reservation: {
    id: string;
    status: string;
    totalCents: number;
    depositCents: number;
    currency: string;
    startsAtUtc: string;
    endsAtUtc: string;
  };
  court: { name: string } | null;
  venue: { name: string; address: string } | null;
  localStart: string;
  localEnd: string;
  cancelUrl: string | null;
  icsUrl: string;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

export function SuccessClient({
  reservation,
  court,
  venue,
  localStart,
  localEnd,
  cancelUrl,
  icsUrl,
}: Props) {
  const [status, setStatus] = useState(reservation.status);
  const startedAtRef = useRef(Date.now());
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (status !== 'pending') return;
    let timeoutId: number | undefined;

    const poll = async () => {
      if (stoppedRef.current) return;
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) return;
      try {
        const res = await fetch(`/r/${reservation.id}/api/status`, { cache: 'no-store' });
        if (res.ok) {
          const body = (await res.json()) as { status: string };
          if (body.status !== 'pending') {
            setStatus(body.status);
            return;
          }
        }
      } catch {
        // ignore network errors during polling
      }
      timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stoppedRef.current = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [reservation.id, status]);

  const copyCancelUrl = async () => {
    if (!cancelUrl) return;
    try {
      await navigator.clipboard.writeText(cancelUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Copialo manualmente.');
    }
  };

  const mapsHref = venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`
    : null;

  const whatsappText = cancelUrl
    ? `Mi reserva en ${venue?.name ?? 'el complejo'}: ${court?.name ?? 'cancha'} ${localStart} - ${localEnd}.\nLink para cancelar si lo necesito:\n${cancelUrl}`
    : '';
  const whatsappHref = whatsappText
    ? `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
    : null;

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <div className="size-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <h1 className="text-xl font-semibold">Procesando el pago…</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Estamos esperando la confirmación de MercadoPago. Esto suele tardar pocos segundos.
        </p>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <h1 className="text-xl font-semibold">Reserva cancelada</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          El plazo de pago expiró y la reserva fue liberada. Si querés ese horario, volvé a intentarlo.
        </p>
        <Button asChild className="h-12">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  if (status !== 'confirmed') {
    return (
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <h1 className="text-xl font-semibold">Estado: {status}</h1>
        <Button asChild className="h-12">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          ✓
        </div>
        <h1 className="text-xl font-semibold">Reserva confirmada</h1>
        <p className="text-sm text-muted-foreground">Te esperamos.</p>
      </header>

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        {court && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cancha</span>
            <span className="font-medium">{court.name}</span>
          </div>
        )}
        {venue && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lugar</span>
            <span className="font-medium">{venue.name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Horario</span>
          <span className="font-medium">{localStart} – {localEnd}</span>
        </div>
        <hr className="my-2 border-border" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">{formatCurrency(reservation.totalCents, reservation.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Seña pagada</span>
          <span className="font-semibold">{formatCurrency(reservation.depositCents, reservation.currency)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>A pagar en el complejo</span>
          <span>{formatCurrency(reservation.totalCents - reservation.depositCents, reservation.currency)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {mapsHref && (
          <Button asChild variant="outline" className="h-12 justify-start text-base">
            <a href={mapsHref} target="_blank" rel="noopener noreferrer">
              Abrir en Google Maps
            </a>
          </Button>
        )}
        <Button asChild variant="outline" className="h-12 justify-start text-base">
          <a href={icsUrl}>Agregar al calendario (.ics)</a>
        </Button>
        {whatsappHref && (
          <Button asChild variant="outline" className="h-12 justify-start text-base">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              Compartir por WhatsApp
            </a>
          </Button>
        )}
      </div>

      {cancelUrl && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs">
          <p className="mb-2 font-medium text-foreground">Link para cancelar</p>
          <p className="text-muted-foreground mb-2 break-all">{cancelUrl}</p>
          <Button type="button" variant="secondary" onClick={copyCancelUrl} className="h-9 w-full">
            Copiar link
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Guardalo. Si lo perdés, contactá al complejo por WhatsApp.
          </p>
        </div>
      )}

      <Button asChild variant="ghost" className="h-12">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
