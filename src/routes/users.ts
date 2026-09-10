import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { AppError, newId } from '../utils/helpers';
import { userCreateSchema, userUpdateSchema } from '../utils/validators';
import { userToApi } from '../utils/mappers';
import { recordAudit } from '../services/auditService';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('users').orderBy('created_at', 'asc');
    res.json({ data: rows.map(userToApi) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the administrator details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    const existing = await db('users').whereRaw('lower(email) = ?', [data.email.toLowerCase()]).first();
    if (existing) throw new AppError(409, 'A user with this email already exists.');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const id = newId('user');
    await db('users').insert({
      id,
      name: data.name,
      email: data.email,
      password_hash: passwordHash,
      role: data.role,
      status: 'active',
    });

    const created = await db('users').where({ id }).first();

    await recordAudit({
      req,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      description: `Created ${data.role} account for ${data.name}.`,
    });

    res.status(201).json({ user: userToApi(created) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await db('users').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'User not found.');

    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    if (existing.id === req.user!.id && data.role && data.role !== 'admin') {
      throw new AppError(400, 'You cannot remove your own administrator access.');
    }
    if (existing.id === req.user!.id && data.status === 'suspended') {
      throw new AppError(400, 'You cannot suspend your own account.');
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.status) updates.status = data.status;
    if (data.password) updates.password_hash = await bcrypt.hash(data.password, 12);

    await db('users').where({ id: req.params.id }).update(updates);
    const updated = await db('users').where({ id: req.params.id }).first();

    await recordAudit({
      req,
      action: 'user.update',
      entityType: 'user',
      entityId: req.params.id,
      description: `Updated administrator account for ${updated.name}.`,
    });

    res.json({ user: userToApi(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      throw new AppError(400, 'You cannot delete your own account.');
    }
    const existing = await db('users').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'User not found.');

    await db('users').where({ id: req.params.id }).delete();

    await recordAudit({
      req,
      action: 'user.delete',
      entityType: 'user',
      entityId: req.params.id,
      description: `Deleted administrator account for ${existing.name}.`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
