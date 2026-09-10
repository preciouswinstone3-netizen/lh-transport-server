import { round2, toNumber } from '../utils/helpers';

export interface LineItemInput {
  quantity: number | string;
  rate: number | string;
  discountPercent?: number | string;
  taxPercent?: number | string;
}

export interface LineItemCalculated {
  lineSubtotal: number;
  lineDiscount: number;
  lineTaxable: number;
  lineTax: number;
  total: number;
}

/**
 * Per-line calculation:
 *   lineSubtotal = quantity * rate
 *   lineDiscount = lineSubtotal * (discountPercent / 100)
 *   lineTaxable  = lineSubtotal - lineDiscount
 *   lineTax      = lineTaxable * (taxPercent / 100)
 *   total        = lineTaxable + lineTax
 */
export function calculateLineItem(item: LineItemInput): LineItemCalculated {
  const quantity = toNumber(item.quantity, 0);
  const rate = toNumber(item.rate, 0);
  const discountPercent = toNumber(item.discountPercent, 0);
  const taxPercent = toNumber(item.taxPercent, 0);

  const lineSubtotal = round2(quantity * rate);
  const lineDiscount = round2(lineSubtotal * (discountPercent / 100));
  const lineTaxable = round2(lineSubtotal - lineDiscount);
  const lineTax = round2(lineTaxable * (taxPercent / 100));
  const total = round2(lineTaxable + lineTax);

  return { lineSubtotal, lineDiscount, lineTaxable, lineTax, total };
}

export interface InvoiceTotalsInput {
  items: LineItemInput[];
  additionalCharges?: number | string;
  amountPaid?: number | string;
}

export interface InvoiceTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  additionalCharges: number;
  total: number;
  amountPaid: number;
  balance: number;
}

/**
 * Invoice-level calculation (matches spec):
 *   Subtotal      = Sum of line subtotals (before discount/tax)
 *   Tax           = Sum of line taxes (computed on taxable amount per line)
 *   Grand Total   = Subtotal - Discounts + Tax + Additional Charges
 *   Balance Due   = Grand Total - Amount Paid
 */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const item of input.items) {
    const calc = calculateLineItem(item);
    subtotal = round2(subtotal + calc.lineSubtotal);
    discountTotal = round2(discountTotal + calc.lineDiscount);
    taxTotal = round2(taxTotal + calc.lineTax);
  }

  const additionalCharges = round2(toNumber(input.additionalCharges, 0));
  const total = round2(subtotal - discountTotal + taxTotal + additionalCharges);
  const amountPaid = round2(toNumber(input.amountPaid, 0));
  const balance = round2(total - amountPaid);

  return { subtotal, discountTotal, taxTotal, additionalCharges, total, amountPaid, balance };
}

export function deriveStatusFromBalance(
  total: number,
  amountPaid: number,
  currentStatus: string,
  dueDate: string
): string {
  if (currentStatus === 'cancelled' || currentStatus === 'draft') return currentStatus;

  if (amountPaid <= 0) {
    // Not yet paid: overdue if due date has passed, otherwise "sent"
    const isOverdue = new Date(dueDate).getTime() < Date.now();
    return isOverdue ? 'overdue' : 'sent';
  }
  if (amountPaid > 0 && amountPaid < total) return 'partially_paid';
  if (amountPaid >= total && total > 0) return 'paid';
  return currentStatus;
}
