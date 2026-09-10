import { v4 as uuidv4 } from 'uuid';

export function newId(prefix?: string): string {
  const id = uuidv4();
  return prefix ? `${prefix}_${id}` : id;
}

export class AppError extends Error {
  statusCode: number;
  publicMessage: string;
  details?: unknown;

  constructor(statusCode: number, publicMessage: string, details?: unknown) {
    super(publicMessage);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
}
