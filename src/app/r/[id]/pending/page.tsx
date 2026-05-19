import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function PendingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="size-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <h1 className="text-xl font-semibold">Pago en proceso</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        MercadoPago está procesando el pago. Te avisamos por whatsapp en cuanto se confirme. También
        podés esperar acá o volver al inicio.
      </p>
      <ViewStatusButton paramsPromise={params} />
      <Button asChild variant="ghost" className="h-12">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}

async function ViewStatusButton({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id } = await paramsPromise;
  return (
    <Button asChild className="h-12">
      <a href={`/r/${id}/success`}>Ver estado de la reserva</a>
    </Button>
  );
}
