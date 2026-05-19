import { redirect } from 'next/navigation';

import { fetchActiveCourtById, fetchActiveCourts } from '@/db/queries/courts';
import { fetchAvailabilityInputs } from '@/db/queries/availability';
import { computeAvailableSlots } from '@/lib/availability';

import {
  AgendaView,
  type AvailabilityResponse,
} from '@/components/agenda/AgendaView';

export const dynamic = 'force-dynamic';

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ courtId?: string; date?: string }>;
}) {
  const params = await searchParams;
  const courts = await fetchActiveCourts();
  if (courts.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-muted-foreground">No hay canchas configuradas.</p>
      </main>
    );
  }

  const requestedCourtId = params.courtId ?? courts[0]!.id;
  const requestedDate = params.date ?? todayIso();

  // Validate requested court exists and is active; fall back to first.
  const requestedCourt = await fetchActiveCourtById(requestedCourtId);
  const courtId = requestedCourt ? requestedCourtId : courts[0]!.id;

  // If we fell back, redirect to canonical URL so the address bar reflects state.
  if (!requestedCourt && params.courtId) {
    redirect(`/?courtId=${courtId}&date=${requestedDate}`);
  }

  const inputs = await fetchAvailabilityInputs(courtId, requestedDate);
  if (!inputs) {
    // Should not happen because we already validated the court, but guard anyway.
    redirect(`/?courtId=${courts[0]!.id}&date=${todayIso()}`);
  }

  const slots = computeAvailableSlots({
    court: inputs.court,
    schedule: inputs.schedule,
    exception: inputs.exception,
    reservations: inputs.reservations,
    blockedSlots: inputs.blockedSlots,
    pricingRules: inputs.pricingRules,
    date: requestedDate,
    venueTimezone: inputs.venue.timezone,
    now: new Date(),
  });

  const initialAvailability: AvailabilityResponse = {
    courtId,
    date: requestedDate,
    timezone: inputs.venue.timezone,
    currency: inputs.venue.currency,
    slots: slots.map((s) => ({
      startsAtUtc: s.startsAtUtc.toISOString(),
      endsAtUtc: s.endsAtUtc.toISOString(),
      localStart: s.localStart,
      localEnd: s.localEnd,
      priceCents: s.priceCents,
      available: s.available,
    })),
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col p-4 gap-4">
      <AgendaView
        initialCourts={courts.map((c) => ({ id: c.id, name: c.name }))}
        initialAvailability={initialAvailability}
        initialCourtId={courtId}
        initialDate={requestedDate}
      />
    </main>
  );
}
