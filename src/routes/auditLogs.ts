import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { auditLogToApi } from '../utils/mappers';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const { page = '1', pageSize = '25', action, entityType } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));

    let query = db('audit_logs');
    if (action) query = query.where('action', action);
    if (entityType) query = query.where('entity_type', entityType);

    const totalRow = await query.clone().count<{ count: string }[]>('id as count').first();
    const total = Number((totalRow as any)?.count || 0);

    const rows = await query
      .clone()
      .orderBy('created_at', 'desc')
      .limit(size)
      .offset((pageNum - 1) * size);

    res.json({
      data: rows.map(auditLogToApi),
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
