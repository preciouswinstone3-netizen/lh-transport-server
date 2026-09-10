import { Router } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { AppError } from '../utils/helpers';
import { companySettingsSchema } from '../utils/validators';
import { settingsToApi } from '../utils/mappers';
import { recordAudit } from '../services/auditService';

const router = Router();
router.use(requireAuth);

async function ensureSettingsRow() {
  let row = await db('company_settings').where({ id: 'singleton' }).first();
  if (!row) {
    await db('company_settings').insert({ id: 'singleton' });
    row = await db('company_settings').where({ id: 'singleton' }).first();
  }
  return row;
}

router.get('/', async (_req, res, next) => {
  try {
    const row = await ensureSettingsRow();
    res.json({ settings: settingsToApi(row) });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireRole('admin'), async (req, res, next) => {
  try {
    const parsed = companySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Please check the settings and try again.', parsed.error.flatten());
    }
    const data = parsed.data;
    await ensureSettingsRow();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Record<string, string> = {
      companyName: 'company_name',
      logoDataUrl: 'logo_data_url',
      address: 'address',
      phone: 'phone',
      email: 'email',
      website: 'website',
      taxNumber: 'tax_number',
      registrationNumber: 'registration_number',
      invoicePrefix: 'invoice_prefix',
      invoiceStartingNumber: 'invoice_starting_number',
      defaultCurrency: 'default_currency',
      defaultTaxRate: 'default_tax_rate',
      defaultPaymentTermsDays: 'default_payment_terms_days',
      invoiceFooter: 'invoice_footer',
      termsAndConditions: 'terms_and_conditions',
      bankName: 'bank_name',
      bankAccountName: 'bank_account_name',
      bankAccountNumber: 'bank_account_number',
      bankBranch: 'bank_branch',
      mobileMoneyDetails: 'mobile_money_details',
      otherPaymentInstructions: 'other_payment_instructions',
    };
    for (const [apiKey, dbKey] of Object.entries(map)) {
      if (apiKey in data) updates[dbKey] = (data as any)[apiKey];
    }

    await db('company_settings').where({ id: 'singleton' }).update(updates);
    const updated = await db('company_settings').where({ id: 'singleton' }).first();

    await recordAudit({
      req,
      action: 'settings.update',
      entityType: 'company_settings',
      entityId: 'singleton',
      description: 'Updated company settings.',
    });

    res.json({ settings: settingsToApi(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
