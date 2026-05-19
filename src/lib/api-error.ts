import { NextResponse } from 'next/server';
import type { ZodIssue } from 'zod';

export function jsonValidationError(issues: ZodIssue[]): NextResponse {
  return NextResponse.json(
    { error: 'validation_failed', issues },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonNotFound(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonInternalError(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'internal', requestId },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
