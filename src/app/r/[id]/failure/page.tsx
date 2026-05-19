import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function FailurePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">El pago no se completó</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        MercadoPago rechazó la transacción o la cancelaste. Tu reserva no quedó confirmada y el
        horario está nuevamente disponible.
      </p>
      <Button asChild className="h-12">
        <Link href="/">Volver a intentar</Link>
      </Button>
    </main>
  );
}
