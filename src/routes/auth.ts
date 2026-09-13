import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db/connection';
import { AppError } from '../utils/helpers';
import {
  loginSchema,
  profileUpdateSchema,
  passwordChangeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/validators';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { recordAudit } from '../services/auditService';
import { sendPasswordResetEmail } from '../services/emailService';
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

// Stricter still on forgot-password, since each request sends an email.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many password reset requests. Please wait a few minutes and try again.' } },
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

// Self-service profile update (name/email) for the logged-in user.
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check your details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name) updates.name = data.name;
    if (data.email) {
      const existing = await db('users')
        .whereRaw('lower(email) = ?', [data.email.toLowerCase()])
        .whereNot({ id: req.user!.id })
        .first();
      if (existing) throw new AppError(409, 'A user with this email already exists.');
      updates.email = data.email;
    }

    await db('users').where({ id: req.user!.id }).update(updates);
    const updated = await db('users').where({ id: req.user!.id }).first();

    await recordAudit({
      req,
      action: 'user.profile_update',
      entityType: 'user',
      entityId: req.user!.id,
      description: `${updated.name} updated their profile.`,
    });

    res.json({ user: userToApi(updated) });
  } catch (err) {
    next(err);
  }
});

// Self-service password change for the logged-in user, requiring the current password.
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check your details and try again.', parsed.error.flatten());
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await db('users').where({ id: req.user!.id }).first();
    if (!user) throw new AppError(401, 'Your session is no longer valid. Please log in again.');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new AppError(400, 'Your current password is incorrect.');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db('users')
      .where({ id: user.id })
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() });

    await recordAudit({
      req,
      action: 'user.password_change',
      entityType: 'user',
      entityId: user.id,
      description: `${user.name} changed their password.`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Request a password reset email. Always responds with a generic success
// message, whether or not the email matches an account, so this endpoint
// can't be used to enumerate registered users.
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please enter a valid email address.');
    }
    const { email } = parsed.data;
    const genericMessage = "If an account exists for that email, we've sent a link to reset your password.";

    const user = await db('users').whereRaw('lower(email) = ?', [email.toLowerCase()]).first();
    if (user && user.status === 'active') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      await db('users').where({ id: user.id }).update({
        reset_token_hash: tokenHash,
        reset_token_expires_at: expiresAt,
      });

      const clientOrigin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
      const resetUrl = `${clientOrigin}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail(user.email, user.name, resetUrl);

      await recordAudit({
        req,
        userId: user.id,
        userName: user.name,
        action: 'user.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        description: `${user.name} requested a password reset.`,
      });
    }

    res.json({ success: true, message: genericMessage });
  } catch (err) {
    next(err);
  }
});

// Complete a password reset using the token emailed to the user.
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check your details and try again.', parsed.error.flatten());
    }
    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);

    const user = await db('users').where({ reset_token_hash: tokenHash }).first();
    if (!user || !user.reset_token_expires_at || new Date(user.reset_token_expires_at).getTime() < Date.now()) {
      throw new AppError(400, 'This reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id: user.id }).update({
      password_hash: passwordHash,
      reset_token_hash: null,
      reset_token_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    await recordAudit({
      userId: user.id,
      userName: user.name,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user.id,
      description: `${user.name} reset their password via email link.`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
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
