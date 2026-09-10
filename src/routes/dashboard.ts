import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { invoiceToApi, customerToApi } from '../utils/mappers';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const invoices = await db('invoices');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalInvoices = invoices.length;
    const invoicesThisMonth = invoices.filter((i) => new Date(i.invoice_date) >= monthStart).length;
    const paid = invoices.filter((i) => i.status === 'paid').length;
    const unpaid = invoices.filter((i) => i.status === 'sent' || i.status === 'draft').length;
    const partiallyPaid = invoices.filter((i) => i.status === 'partially_paid').length;
    const overdue = invoices.filter((i) => i.status === 'overdue').length;

    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
    const totalPaidAmount = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
    const outstanding = invoices.reduce((s, i) => s + Number(i.balance), 0);

    // Revenue trend: last 6 months, amount invoiced per month
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString('en-US', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
    }
    const revenueTrend = months.map(({ label, year, month }) => {
      const total = invoices
        .filter((inv) => {
          const d = new Date(inv.invoice_date);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, i) => s + Number(i.total), 0);
      const volume = invoices.filter((inv) => {
        const d = new Date(inv.invoice_date);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;
      return { label, total, volume };
    });

    const statusBreakdown = [
      { status: 'paid', count: paid },
      { status: 'partially_paid', count: partiallyPaid },
      { status: 'sent', count: invoices.filter((i) => i.status === 'sent').length },
      { status: 'draft', count: invoices.filter((i) => i.status === 'draft').length },
      { status: 'overdue', count: overdue },
      { status: 'cancelled', count: invoices.filter((i) => i.status === 'cancelled').length },
    ];

    // Top customers by total billed
    const customerTotals = new Map<string, number>();
    for (const inv of invoices) {
      customerTotals.set(inv.customer_id, (customerTotals.get(inv.customer_id) || 0) + Number(inv.total));
    }
    const topCustomerIds = [...customerTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCustomers = [];
    for (const [customerId, total] of topCustomerIds) {
      const c = await db('customers').where({ id: customerId }).first();
      if (c) topCustomers.push({ customer: customerToApi(c), total });
    }

    const recentInvoicesRows = await db('invoices')
      .join('customers', 'invoices.customer_id', 'customers.id')
      .select('invoices.*', 'customers.name as customer_name')
      .orderBy('invoices.created_at', 'desc')
      .limit(6);

    const recentCustomers = await db('customers').orderBy('created_at', 'desc').limit(5);

    res.json({
      stats: {
        totalInvoices,
        invoicesThisMonth,
        paid,
        unpaid,
        partiallyPaid,
        overdue,
        totalInvoiced,
        totalPaidAmount,
        outstanding,
      },
      revenueTrend,
      statusBreakdown,
      topCustomers,
      recentInvoices: recentInvoicesRows.map((r) => ({ ...invoiceToApi(r), customerName: r.customer_name })),
      recentCustomers: recentCustomers.map(customerToApi),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
