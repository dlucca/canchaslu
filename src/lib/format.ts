/**
 * Formats an integer-cents amount as a localized currency string,
 * e.g. 1500000 + 'ARS' → '$15.000'.
 *
 * Uses Intl.NumberFormat es-AR which produces non-breaking-space thousands
 * separators ('.') and integer-only display for ARS.
 */
export function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}
