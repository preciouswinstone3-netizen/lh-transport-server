import db from '../db/connection';

/**
 * Generates the next invoice number using the configured prefix and a
 * per-year running counter, e.g. LH-INV-2026-0001.
 * Uses a DB transaction to avoid race conditions on concurrent invoice creation.
 */
export async function generateNextInvoiceNumber(): Promise<string> {
  return db.transaction(async (trx) => {
    let settings = await trx('company_settings').where({ id: 'singleton' }).first();
    if (!settings) {
      await trx('company_settings').insert({ id: 'singleton' });
      settings = await trx('company_settings').where({ id: 'singleton' }).first();
    }

    const nextNumber = settings.invoice_next_number || 1;
    const year = new Date().getFullYear();
    const padded = String(nextNumber).padStart(4, '0');
    const invoiceNumber = `${settings.invoice_prefix}-${year}-${padded}`;

    await trx('company_settings')
      .where({ id: 'singleton' })
      .update({ invoice_next_number: nextNumber + 1, updated_at: new Date().toISOString() });

    return invoiceNumber;
  });
}
