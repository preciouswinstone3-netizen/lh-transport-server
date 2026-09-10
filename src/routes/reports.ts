import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

// GET /api/reports/revenue?groupBy=monthly&dateFrom=&dateTo=
router.get('/revenue', async (req, res, next) => {
  try {
    const { groupBy = 'monthly', dateFrom, dateTo, format } = req.query as Record<string, string>;

    let query = db('invoices');
    if (dateFrom) query = query.where('invoice_date', '>=', dateFrom);
    if (dateTo) query = query.where('invoice_date', '<=', dateTo);
    const invoices = await query;

    const keyFor = (dateStr: string) => {
      const d = new Date(dateStr);
      switch (groupBy) {
        case 'daily':
          return d.toISOString().slice(0, 10);
        case 'weekly': {
          const onejan = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
          return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
        }
        case 'quarterly':
          return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
        case 'yearly':
          return `${d.getFullYear()}`;
        default:
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    const groups = new Map<string, { period: string; invoiceCount: number; totalInvoiced: number; totalPaid: number }>();
    for (const inv of invoices) {
      const key = keyFor(inv.invoice_date);
      const g = groups.get(key) || { period: key, invoiceCount: 0, totalInvoiced: 0, totalPaid: 0 };
      g.invoiceCount += 1;
      g.totalInvoiced += Number(inv.total);
      g.totalPaid += Number(inv.amount_paid);
      groups.set(key, g);
    }
    const rows = [...groups.values()].sort((a, b) => a.period.localeCompare(b.period));

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="revenue-report.csv"');
      return res.send(toCsv(rows));
    }

    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/invoices?dateFrom=&dateTo=
router.get('/invoices', async (req, res, next) => {
  try {
    const { dateFrom, dateTo, format } = req.query as Record<string, string>;
    let query = db('invoices');
    if (dateFrom) query = query.where('invoice_date', '>=', dateFrom);
    if (dateTo) query = query.where('invoice_date', '<=', dateTo);
    const invoices = await query;

    const summary = {
      total: invoices.length,
      paid: invoices.filter((i) => i.status === 'paid').length,
      unpaid: invoices.filter((i) => i.status === 'sent').length,
      draft: invoices.filter((i) => i.status === 'draft').length,
      partiallyPaid: invoices.filter((i) => i.status === 'partially_paid').length,
      overdue: invoices.filter((i) => i.status === 'overdue').length,
      cancelled: invoices.filter((i) => i.status === 'cancelled').length,
      totalInvoiced: invoices.reduce((s, i) => s + Number(i.total), 0),
      totalPaid: invoices.reduce((s, i) => s + Number(i.amount_paid), 0),
      outstanding: invoices.reduce((s, i) => s + Number(i.balance), 0),
    };

    if (format === 'csv') {
      const rows = await db('invoices')
        .join('customers', 'invoices.customer_id', 'customers.id')
        .select(
          'invoices.invoice_number',
          'customers.name as customer',
          'invoices.invoice_date',
          'invoices.due_date',
          'invoices.total',
          'invoices.amount_paid',
          'invoices.balance',
          'invoices.status'
        );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="invoice-report.csv"');
      return res.send(toCsv(rows));
    }

    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/customers
router.get('/customers', async (req, res, next) => {
  try {
    const { format } = req.query as Record<string, string>;
    const customers = await db('customers');
    const invoices = await db('invoices');

    const rows = customers
      .map((c) => {
        const custInvoices = invoices.filter((i) => i.customer_id === c.id);
        return {
          customer: c.name,
          totalInvoices: custInvoices.length,
          totalBilled: custInvoices.reduce((s, i) => s + Number(i.total), 0),
          totalPaid: custInvoices.reduce((s, i) => s + Number(i.amount_paid), 0),
          outstanding: custInvoices.reduce((s, i) => s + Number(i.balance), 0),
        };
      })
      .filter((r) => r.totalInvoices > 0)
      .sort((a, b) => b.totalBilled - a.totalBilled);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customer-report.csv"');
      return res.send(toCsv(rows));
    }

    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

export default router;
