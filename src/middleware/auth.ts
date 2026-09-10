import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../utils/helpers';
import db from '../db/connection';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError(401, 'You must be logged in to do that.');
    }
    const token = header.slice('Bearer '.length);
    const payload = verifyToken(token);

    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) throw new AppError(401, 'Your session is no longer valid. Please log in again.');
    if (user.status !== 'active') throw new AppError(403, 'Your account has been suspended.');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, 'Your session has expired. Please log in again.'));
  }
}
