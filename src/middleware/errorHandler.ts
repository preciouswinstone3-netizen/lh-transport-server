import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: 'The requested resource was not found.' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      // Log full technical detail server-side only.
      // eslint-disable-next-line no-console
      console.error('[AppError]', err.statusCode, err.message, err.details ?? '');
    }
    return res.status(err.statusCode).json({
      error: {
        message: err.publicMessage,
        details: err.statusCode < 500 ? err.details : undefined,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.error('[UnhandledError]', err);
  return res.status(500).json({
    error: { message: 'Something went wrong on our end. Please try again.' },
  });
}
