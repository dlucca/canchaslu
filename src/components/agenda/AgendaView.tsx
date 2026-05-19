'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { REFRESH_INTERVAL_MS, ERROR_RETRY_MS } from '@/lib/constants';

import { CourtSelect, type Court } from './CourtSelect';
import { DateSelect } from './DateSelect';
import { SlotCard } from './SlotCard';

type Slot = {
  startsAtUtc: string;
  endsAtUtc: string;
  localStart: string;
  localEnd: string;
  priceCents: number;
  available: boolean;
};

export type AvailabilityResponse = {
  courtId: string;
  date: string;
  timezone: string;
  currency: string;
  slots: Slot[];
};

export function AgendaView({
  initialCourts,
  initialAvailability,
  initialCourtId,
  initialDate,
}: {
  initialCourts: Court[];
  initialAvailability: AvailabilityResponse;
  initialCourtId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [courtId, setCourtId] = useState(initialCourtId);
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<AvailabilityResponse>(initialAvailability);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInitialMount = useRef(true);

  const fetchData = useCallback(
    async (cid: string, d: string, silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/availability?courtId=${cid}&date=${d}`, {
          cache: 'no-store',
        });
        if (res.status === 404) {
          toast.error('Cancha no encontrada');
          setError(null);
          return;
        }
        if (res.status === 400) {
          toast.error('Datos inválidos');
          setError(null);
          return;
        }
        if (!res.ok) {
          setError('Error de conexión. Reintentando…');
          return;
        }
        const body = (await res.json()) as AvailabilityResponse;
        setData(body);
        setError(null);
      } catch {
        setError('Error de conexión. Reintentando…');
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  // Sync URL when court or date changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set('courtId', courtId);
    params.set('date', date);
    router.replace(`/?${params.toString()}`, { scroll: false });
    void fetchData(courtId, date);
  }, [courtId, date, router, searchParams, fetchData]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchData(courtId, date, true);
      }
    }, REFRESH_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchData(courtId, date, true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [courtId, date, fetchData]);

  // Error retry
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => void fetchData(courtId, date, true), ERROR_RETRY_MS);
    return () => clearTimeout(t);
  }, [error, courtId, date, fetchData]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">canchaslu</h1>
        {refreshing && (
          <span aria-label="refrescando" className="text-xs text-muted-foreground">
            ●
          </span>
        )}
      </header>

      <div className="flex gap-3">
        <CourtSelect courts={initialCourts} value={courtId} onChange={setCourtId} />
        <DateSelect value={date} onChange={setDate} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {data.slots.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          La cancha está cerrada esta fecha.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.slots.map((slot) => (
            <SlotCard
              key={slot.startsAtUtc}
              localStart={slot.localStart}
              localEnd={slot.localEnd}
              priceCents={slot.priceCents}
              available={slot.available}
              currency={data.currency}
              onSelect={() => {
                console.log('TODO: open reservation flow', slot);
                toast.info('Reserva próximamente disponible');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
