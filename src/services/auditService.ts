import type { Request } from 'express';
import db from '../db/connection';
import { newId } from '../utils/helpers';

interface AuditParams {
  req?: Request;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  description?: string;
}

export async function recordAudit(params: AuditParams): Promise<void> {
  const { req, action, entityType, entityId, description } = params;
  const userId = params.userId ?? req?.user?.id ?? null;
  const userName = params.userName ?? req?.user?.name ?? null;
  const ip = req?.ip || req?.headers['x-forwarded-for']?.toString() || null;
  const userAgent = req?.headers['user-agent'] || null;

  await db('audit_logs').insert({
    id: newId('log'),
    user_id: userId,
    user_name: userName,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    description: description ?? null,
    ip_address: ip,
    user_agent: userAgent,
    created_at: new Date().toISOString(),
  });
}
