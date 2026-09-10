import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers';
import type { UserRole } from '../types';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'You must be logged in to do that.'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "You don't have permission to perform this action."));
    }
    next();
  };
}
