import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import db from '../db/connection';
import { AppError } from '../utils/helpers';
import { loginSchema } from '../utils/validators';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { recordAudit } from '../services/auditService';
import { userToApi } from '../utils/mappers';

const router = Router();

// Stricter rate limit on login to slow brute-force attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Please wait a few minutes and try again.' } },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please enter a valid email and password.');
    }
    const { email, password } = parsed.data;

    const user = await db('users').whereRaw('lower(email) = ?', [email.toLowerCase()]).first();
    if (!user) throw new AppError(401, 'Invalid email or password.');
    if (user.status !== 'active') throw new AppError(403, 'Your account has been suspended. Contact an administrator.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, 'Invalid email or password.');

    await db('users').where({ id: user.id }).update({ last_login_at: new Date().toISOString() });

    const token = signToken({ sub: user.id, role: user.role, name: user.name, email: user.email });

    await recordAudit({
      req,
      userId: user.id,
      userName: user.name,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      description: `${user.name} logged in.`,
    });

    res.json({ token, user: userToApi(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await recordAudit({
      req,
      action: 'user.logout',
      entityType: 'user',
      entityId: req.user!.id,
      description: `${req.user!.name} logged out.`,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
