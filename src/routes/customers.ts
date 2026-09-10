import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { AppError, newId } from '../utils/helpers';
import { customerSchema } from '../utils/validators';
import { customerToApi, invoiceToApi } from '../utils/mappers';
import { recordAudit } from '../services/auditService';

const router = Router();
router.use(requireAuth);

// GET /api/customers - list with search + pagination
router.get('/', async (req, res, next) => {
  try {
    const { search = '', page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    let query = db('customers');
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      query = query.where((qb) => {
        qb.whereRaw('lower(name) like ?', [like])
          .orWhereRaw('lower(phone) like ?', [like])
          .orWhereRaw('lower(email) like ?', [like])
          .orWhereRaw('lower(customer_reference) like ?', [like]);
      });
    }

    const totalRow = await query.clone().count<{ count: string }[]>('id as count').first();
    const total = Number((totalRow as any)?.count || 0);

    const rows = await query
      .clone()
      .orderBy('created_at', 'desc')
      .limit(size)
      .offset((pageNum - 1) * size);

    res.json({
      data: rows.map(customerToApi),
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id - with summary + invoice history
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await db('customers').where({ id: req.params.id }).first();
    if (!customer) throw new AppError(404, 'Customer not found.');

    const invoices = await db('invoices').where({ customer_id: customer.id }).orderBy('invoice_date', 'desc');

    const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
    const outstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

    res.json({
      customer: customerToApi(customer),
      summary: {
        totalInvoices: invoices.length,
        totalInvoiced,
        totalPaid,
        outstanding,
      },
      invoices: invoices.map((inv) => invoiceToApi(inv)),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the customer details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;
    const id = newId('cust');
    await db('customers').insert({
      id,
      name: data.name,
      contact_person: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      postal_address: data.postalAddress || null,
      tax_number: data.taxNumber || null,
      registration_number: data.registrationNumber || null,
      customer_reference: data.customerReference || null,
      notes: data.notes || null,
      created_by: req.user!.id,
    });

    const created = await db('customers').where({ id }).first();

    await recordAudit({
      req,
      action: 'customer.create',
      entityType: 'customer',
      entityId: id,
      description: `Created customer "${data.name}".`,
    });

    res.status(201).json({ customer: customerToApi(created) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await db('customers').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'Customer not found.');

    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the customer details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    await db('customers')
      .where({ id: req.params.id })
      .update({
        name: data.name ?? existing.name,
        contact_person: data.contactPerson ?? existing.contact_person,
        phone: data.phone ?? existing.phone,
        email: data.email ?? existing.email,
        address: data.address ?? existing.address,
        postal_address: data.postalAddress ?? existing.postal_address,
        tax_number: data.taxNumber ?? existing.tax_number,
        registration_number: data.registrationNumber ?? existing.registration_number,
        customer_reference: data.customerReference ?? existing.customer_reference,
        notes: data.notes ?? existing.notes,
        updated_at: new Date().toISOString(),
      });

    const updated = await db('customers').where({ id: req.params.id }).first();

    await recordAudit({
      req,
      action: 'customer.update',
      entityType: 'customer',
      entityId: req.params.id,
      description: `Updated customer "${updated.name}".`,
    });

    res.json({ customer: customerToApi(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await db('customers').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'Customer not found.');

    const invoiceCount = await db('invoices').where({ customer_id: req.params.id }).count<{ count: string }[]>(
      'id as count'
    );
    if (Number((invoiceCount[0] as any)?.count || 0) > 0) {
      throw new AppError(409, 'This customer has existing invoices and cannot be deleted.');
    }

    await db('customers').where({ id: req.params.id }).delete();

    await recordAudit({
      req,
      action: 'customer.delete',
      entityType: 'customer',
      entityId: req.params.id,
      description: `Deleted customer "${existing.name}".`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
