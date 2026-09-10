import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { AppError, newId } from '../utils/helpers';
import { invoiceSchema, invoiceUpdateSchema, paymentSchema } from '../utils/validators';
import { invoiceToApi, paymentToApi } from '../utils/mappers';
import { calculateInvoiceTotals, deriveStatusFromBalance } from '../services/calcService';
import { generateNextInvoiceNumber } from '../services/invoiceNumberService';
import { generateInvoicePdf } from '../services/pdfService';
import { recordAudit } from '../services/auditService';

const router = Router();
router.use(requireAuth);

async function loadFullInvoice(id: string) {
  const invoice = await db('invoices')
    .leftJoin('users', 'invoices.created_by', 'users.id')
    .where('invoices.id', id)
    .select('invoices.*', 'users.name as created_by_name')
    .first();
  if (!invoice) return null;
  const items = await db('invoice_items').where({ invoice_id: id }).orderBy('position', 'asc');
  const customer = await db('customers').where({ id: invoice.customer_id }).first();
  return { invoice, items, customer };
}

// GET /api/invoices - list with search, filters, pagination, sorting
router.get('/', async (req, res, next) => {
  try {
    const {
      search = '',
      status,
      customerId,
      dateFrom,
      dateTo,
      createdBy,
      sort = 'newest',
      page = '1',
      pageSize = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    let query = db('invoices')
      .join('customers', 'invoices.customer_id', 'customers.id')
      .leftJoin('users', 'invoices.created_by', 'users.id');

    if (search) {
      const like = `%${search.toLowerCase()}%`;
      query = query.where((qb) => {
        qb.whereRaw('lower(invoices.invoice_number) like ?', [like])
          .orWhereRaw('lower(customers.name) like ?', [like])
          .orWhereRaw('lower(customers.phone) like ?', [like])
          .orWhereRaw('lower(invoices.reference_number) like ?', [like])
          .orWhereExists(function () {
            this.select('*')
              .from('invoice_items')
              .whereRaw('invoice_items.invoice_id = invoices.id')
              .andWhere((sub) => {
                sub
                  .whereRaw('lower(invoice_items.vehicle_registration) like ?', [like])
                  .orWhereRaw('lower(invoice_items.driver) like ?', [like]);
              });
          });
      });
    }
    if (status) query = query.where('invoices.status', status);
    if (customerId) query = query.where('invoices.customer_id', customerId);
    if (createdBy) query = query.where('invoices.created_by', createdBy);
    if (dateFrom) query = query.where('invoices.invoice_date', '>=', dateFrom);
    if (dateTo) query = query.where('invoices.invoice_date', '<=', dateTo);

    const totalRow = await query.clone().count<{ count: string }[]>('invoices.id as count').first();
    const total = Number((totalRow as any)?.count || 0);

    const sortMap: Record<string, [string, 'asc' | 'desc']> = {
      newest: ['invoices.invoice_date', 'desc'],
      oldest: ['invoices.invoice_date', 'asc'],
      highest: ['invoices.total', 'desc'],
      lowest: ['invoices.total', 'asc'],
      due_date: ['invoices.due_date', 'asc'],
    };
    const [sortCol, sortDir] = sortMap[sort] || sortMap.newest;

    const rows = await query
      .clone()
      .select(
        'invoices.*',
        'customers.name as customer_name',
        'customers.phone as customer_phone',
        'users.name as created_by_name'
      )
      .orderBy(sortCol, sortDir)
      .limit(size)
      .offset((pageNum - 1) * size);

    res.json({
      data: rows.map((r) => ({
        ...invoiceToApi(r),
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
      })),
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const full = await loadFullInvoice(req.params.id);
    if (!full) throw new AppError(404, 'Invoice not found.');
    const payments = await db('payments').where({ invoice_id: req.params.id }).orderBy('payment_date', 'desc');
    res.json({
      invoice: invoiceToApi(full.invoice, full.items, full.customer),
      payments: payments.map(paymentToApi),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices
router.post('/', async (req, res, next) => {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the invoice details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    const customer = await db('customers').where({ id: data.customerId }).first();
    if (!customer) throw new AppError(400, 'Please select a valid customer.');

    const totals = calculateInvoiceTotals({
      items: data.items,
      additionalCharges: data.additionalCharges,
      amountPaid: data.amountPaid,
    });

    const invoiceId = newId('inv');
    const invoiceNumber = await generateNextInvoiceNumber();
    const status =
      data.status === 'draft'
        ? 'draft'
        : deriveStatusFromBalance(totals.total, totals.amountPaid, data.status, data.dueDate);

    await db.transaction(async (trx) => {
      await trx('invoices').insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        customer_id: data.customerId,
        invoice_date: data.invoiceDate,
        due_date: data.dueDate,
        currency: data.currency,
        reference_number: data.referenceNumber || null,
        customer_po_number: data.customerPoNumber || null,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        tax_total: totals.taxTotal,
        additional_charges: totals.additionalCharges,
        total: totals.total,
        amount_paid: totals.amountPaid,
        balance: totals.balance,
        status,
        notes: data.notes || null,
        created_by: req.user!.id,
      });

      let position = 0;
      for (const item of data.items) {
        const lineCalc = calculateInvoiceTotals({ items: [item] });
        await trx('invoice_items').insert({
          id: newId('item'),
          invoice_id: invoiceId,
          position: position++,
          description: item.description,
          service_type: item.serviceType || null,
          vehicle: item.vehicle || null,
          vehicle_registration: item.vehicleRegistration || null,
          driver: item.driver || null,
          pickup_location: item.pickupLocation || null,
          delivery_location: item.deliveryLocation || null,
          trip_date: item.tripDate || null,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          discount_percent: item.discountPercent,
          tax_percent: item.taxPercent,
          total: lineCalc.total,
        });
      }

      if (totals.amountPaid > 0) {
        await trx('payments').insert({
          id: newId('pay'),
          invoice_id: invoiceId,
          amount: totals.amountPaid,
          payment_date: data.invoiceDate,
          payment_method: 'Opening balance',
          reference: null,
          notes: 'Recorded at invoice creation.',
          created_by: req.user!.id,
        });
      }
    });

    const full = await loadFullInvoice(invoiceId);

    await recordAudit({
      req,
      action: 'invoice.create',
      entityType: 'invoice',
      entityId: invoiceId,
      description: `Created invoice ${invoiceNumber} for ${customer.name}.`,
    });

    res.status(201).json({ invoice: invoiceToApi(full!.invoice, full!.items, full!.customer) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/invoices/:id
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await db('invoices').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'Invoice not found.');

    const parsed = invoiceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the invoice details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    const customerId = data.customerId ?? existing.customer_id;
    const customer = await db('customers').where({ id: customerId }).first();
    if (!customer) throw new AppError(400, 'Please select a valid customer.');

    const items = data.items ?? (await db('invoice_items').where({ invoice_id: existing.id }).orderBy('position'));
    const additionalCharges = data.additionalCharges ?? Number(existing.additional_charges);
    const amountPaid = data.amountPaid ?? Number(existing.amount_paid);

    const totals = calculateInvoiceTotals({ items, additionalCharges, amountPaid });
    const dueDate = data.dueDate ?? existing.due_date;
    const requestedStatus = data.status ?? existing.status;
    const status =
      requestedStatus === 'draft' || requestedStatus === 'cancelled'
        ? requestedStatus
        : deriveStatusFromBalance(totals.total, totals.amountPaid, requestedStatus, dueDate);

    await db.transaction(async (trx) => {
      await trx('invoices')
        .where({ id: existing.id })
        .update({
          customer_id: customerId,
          invoice_date: data.invoiceDate ?? existing.invoice_date,
          due_date: dueDate,
          currency: data.currency ?? existing.currency,
          reference_number: data.referenceNumber ?? existing.reference_number,
          customer_po_number: data.customerPoNumber ?? existing.customer_po_number,
          subtotal: totals.subtotal,
          discount_total: totals.discountTotal,
          tax_total: totals.taxTotal,
          additional_charges: totals.additionalCharges,
          total: totals.total,
          amount_paid: totals.amountPaid,
          balance: totals.balance,
          status,
          notes: data.notes ?? existing.notes,
          updated_at: new Date().toISOString(),
        });

      if (data.items) {
        await trx('invoice_items').where({ invoice_id: existing.id }).delete();
        let position = 0;
        for (const item of data.items) {
          const lineCalc = calculateInvoiceTotals({ items: [item] });
          await trx('invoice_items').insert({
            id: newId('item'),
            invoice_id: existing.id,
            position: position++,
            description: item.description,
            service_type: item.serviceType || null,
            vehicle: item.vehicle || null,
            vehicle_registration: item.vehicleRegistration || null,
            driver: item.driver || null,
            pickup_location: item.pickupLocation || null,
            delivery_location: item.deliveryLocation || null,
            trip_date: item.tripDate || null,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            discount_percent: item.discountPercent,
            tax_percent: item.taxPercent,
            total: lineCalc.total,
          });
        }
      }
    });

    const full = await loadFullInvoice(existing.id);

    await recordAudit({
      req,
      action: 'invoice.update',
      entityType: 'invoice',
      entityId: existing.id,
      description: `Updated invoice ${existing.invoice_number}.`,
    });

    res.json({ invoice: invoiceToApi(full!.invoice, full!.items, full!.customer) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/invoices/:id - admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await db('invoices').where({ id: req.params.id }).first();
    if (!existing) throw new AppError(404, 'Invoice not found.');

    await db('invoices').where({ id: req.params.id }).delete();

    await recordAudit({
      req,
      action: 'invoice.delete',
      entityType: 'invoice',
      entityId: req.params.id,
      description: `Deleted invoice ${existing.invoice_number}.`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices/:id/duplicate
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const full = await loadFullInvoice(req.params.id);
    if (!full) throw new AppError(404, 'Invoice not found.');

    const newInvoiceId = newId('inv');
    const newInvoiceNumber = await generateNextInvoiceNumber();
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    await db.transaction(async (trx) => {
      await trx('invoices').insert({
        id: newInvoiceId,
        invoice_number: newInvoiceNumber,
        customer_id: full.invoice.customer_id,
        invoice_date: today,
        due_date: dueDate.toISOString().slice(0, 10),
        currency: full.invoice.currency,
        reference_number: full.invoice.reference_number,
        customer_po_number: full.invoice.customer_po_number,
        subtotal: full.invoice.subtotal,
        discount_total: full.invoice.discount_total,
        tax_total: full.invoice.tax_total,
        additional_charges: full.invoice.additional_charges,
        total: full.invoice.total,
        amount_paid: 0,
        balance: full.invoice.total,
        status: 'draft',
        notes: full.invoice.notes,
        created_by: req.user!.id,
      });

      let position = 0;
      for (const item of full.items) {
        await trx('invoice_items').insert({
          id: newId('item'),
          invoice_id: newInvoiceId,
          position: position++,
          description: item.description,
          service_type: item.service_type,
          vehicle: item.vehicle,
          vehicle_registration: item.vehicle_registration,
          driver: item.driver,
          pickup_location: item.pickup_location,
          delivery_location: item.delivery_location,
          trip_date: item.trip_date,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          discount_percent: item.discount_percent,
          tax_percent: item.tax_percent,
          total: item.total,
        });
      }
    });

    const created = await loadFullInvoice(newInvoiceId);

    await recordAudit({
      req,
      action: 'invoice.duplicate',
      entityType: 'invoice',
      entityId: newInvoiceId,
      description: `Duplicated invoice ${full.invoice.invoice_number} as ${newInvoiceNumber}.`,
    });

    res.status(201).json({ invoice: invoiceToApi(created!.invoice, created!.items, created!.customer) });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const full = await loadFullInvoice(req.params.id);
    if (!full) throw new AppError(404, 'Invoice not found.');

    const settings = (await db('company_settings').where({ id: 'singleton' }).first()) || {};

    const pdfBuffer = await generateInvoicePdf(
      {
        invoiceNumber: full.invoice.invoice_number,
        invoiceDate: full.invoice.invoice_date,
        dueDate: full.invoice.due_date,
        status: full.invoice.status,
        currency: full.invoice.currency,
        referenceNumber: full.invoice.reference_number,
        customerPoNumber: full.invoice.customer_po_number,
        notes: full.invoice.notes,
        subtotal: Number(full.invoice.subtotal),
        discountTotal: Number(full.invoice.discount_total),
        taxTotal: Number(full.invoice.tax_total),
        additionalCharges: Number(full.invoice.additional_charges),
        total: Number(full.invoice.total),
        amountPaid: Number(full.invoice.amount_paid),
        balance: Number(full.invoice.balance),
        items: full.items.map((i) => ({
          description: i.description,
          serviceType: i.service_type,
          vehicle: i.vehicle,
          vehicleRegistration: i.vehicle_registration,
          driver: i.driver,
          pickupLocation: i.pickup_location,
          deliveryLocation: i.delivery_location,
          tripDate: i.trip_date,
          quantity: Number(i.quantity),
          unit: i.unit,
          rate: Number(i.rate),
          discountPercent: Number(i.discount_percent),
          taxPercent: Number(i.tax_percent),
          total: Number(i.total),
        })),
        customer: {
          name: full.customer.name,
          contactPerson: full.customer.contact_person,
          phone: full.customer.phone,
          email: full.customer.email,
          address: full.customer.address,
          taxNumber: full.customer.tax_number,
        },
      },
      {
        companyName: settings.company_name || 'LH Transport',
        logoDataUrl: settings.logo_data_url,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
        taxNumber: settings.tax_number,
        registrationNumber: settings.registration_number,
        invoiceFooter: settings.invoice_footer,
        termsAndConditions: settings.terms_and_conditions,
        bankName: settings.bank_name,
        bankAccountName: settings.bank_account_name,
        bankAccountNumber: settings.bank_account_number,
        bankBranch: settings.bank_branch,
        mobileMoneyDetails: settings.mobile_money_details,
        otherPaymentInstructions: settings.other_payment_instructions,
      }
    );

    await recordAudit({
      req,
      action: 'invoice.pdf_download',
      entityType: 'invoice',
      entityId: req.params.id,
      description: `Downloaded PDF for invoice ${full.invoice.invoice_number}.`,
    });

    const filename = `LH-Transport-Invoice-${full.invoice.invoice_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices/:id/payments - record a payment
router.post('/:id/payments', async (req, res, next) => {
  try {
    const invoice = await db('invoices').where({ id: req.params.id }).first();
    if (!invoice) throw new AppError(404, 'Invoice not found.');

    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the payment details and try again.', parsed.error.flatten());
    }
    const data = parsed.data;

    const newAmountPaid = Math.round((Number(invoice.amount_paid) + data.amount) * 100) / 100;
    if (newAmountPaid > Number(invoice.total) + 0.01) {
      throw new AppError(400, 'Payment amount exceeds the invoice balance.');
    }
    const newBalance = Math.round((Number(invoice.total) - newAmountPaid) * 100) / 100;
    const newStatus = deriveStatusFromBalance(Number(invoice.total), newAmountPaid, invoice.status, invoice.due_date);

    await db.transaction(async (trx) => {
      await trx('payments').insert({
        id: newId('pay'),
        invoice_id: invoice.id,
        amount: data.amount,
        payment_date: data.paymentDate,
        payment_method: data.paymentMethod,
        reference: data.reference || null,
        notes: data.notes || null,
        created_by: req.user!.id,
      });

      await trx('invoices').where({ id: invoice.id }).update({
        amount_paid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
    });

    await recordAudit({
      req,
      action: 'payment.record',
      entityType: 'invoice',
      entityId: invoice.id,
      description: `Recorded payment of ${data.amount} ${invoice.currency} on invoice ${invoice.invoice_number}.`,
    });

    const full = await loadFullInvoice(invoice.id);
    const payments = await db('payments').where({ invoice_id: invoice.id }).orderBy('payment_date', 'desc');

    res.status(201).json({
      invoice: invoiceToApi(full!.invoice, full!.items, full!.customer),
      payments: payments.map(paymentToApi),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/invoices/:id/status - quick status change (e.g. mark as paid/cancelled)
router.patch('/:id/status', async (req, res, next) => {
  try {
    const invoice = await db('invoices').where({ id: req.params.id }).first();
    if (!invoice) throw new AppError(404, 'Invoice not found.');

    const { status } = req.body as { status?: string };
    const allowed = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      throw new AppError(400, 'Please provide a valid invoice status.');
    }

    let amountPaid = Number(invoice.amount_paid);
    if (status === 'paid') amountPaid = Number(invoice.total);
    const balance = Math.round((Number(invoice.total) - amountPaid) * 100) / 100;

    await db('invoices').where({ id: invoice.id }).update({
      status,
      amount_paid: amountPaid,
      balance,
      updated_at: new Date().toISOString(),
    });

    await recordAudit({
      req,
      action: 'invoice.status_change',
      entityType: 'invoice',
      entityId: invoice.id,
      description: `Changed status of invoice ${invoice.invoice_number} to ${status}.`,
    });

    const full = await loadFullInvoice(invoice.id);
    res.json({ invoice: invoiceToApi(full!.invoice, full!.items, full!.customer) });
  } catch (err) {
    next(err);
  }
});

export default router;
