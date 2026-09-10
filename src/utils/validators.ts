import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(200),
  contactPerson: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().max(500).optional().nullable(),
  postalAddress: z.string().max(500).optional().nullable(),
  taxNumber: z.string().max(100).optional().nullable(),
  registrationNumber: z.string().max(100).optional().nullable(),
  customerReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Description is required').max(1000),
  serviceType: z.string().max(150).optional().nullable(),
  vehicle: z.string().max(150).optional().nullable(),
  vehicleRegistration: z.string().max(50).optional().nullable(),
  driver: z.string().max(150).optional().nullable(),
  pickupLocation: z.string().max(200).optional().nullable(),
  deliveryLocation: z.string().max(200).optional().nullable(),
  tripDate: z.string().optional().nullable(),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().max(30).default('trip'),
  rate: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, 'Please select or create a customer'),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  currency: z.string().min(1).max(10).default('MWK'),
  referenceNumber: z.string().max(100).optional().nullable(),
  customerPoNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']).default('draft'),
  additionalCharges: z.number().min(0).default(0),
  amountPaid: z.number().min(0).default(0),
  items: z.array(lineItemSchema).min(1, 'Add at least one line item'),
});

export const invoiceUpdateSchema = invoiceSchema.partial().extend({
  items: z.array(lineItemSchema).min(1).optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive('Payment amount must be greater than zero'),
  paymentDate: z.string().min(1),
  paymentMethod: z.string().min(1).max(100),
  reference: z.string().max(150).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const userCreateSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'staff']),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  role: z.enum(['admin', 'staff']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  password: z.string().min(8).optional(),
});

export const companySettingsSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  logoDataUrl: z.string().max(5_000_000).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  website: z.string().max(200).optional().nullable(),
  taxNumber: z.string().max(100).optional().nullable(),
  registrationNumber: z.string().max(100).optional().nullable(),
  invoicePrefix: z.string().min(1).max(30).optional(),
  invoiceStartingNumber: z.number().int().positive().optional(),
  defaultCurrency: z.string().min(1).max(10).optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  invoiceFooter: z.string().max(500).optional().nullable(),
  termsAndConditions: z.string().max(3000).optional().nullable(),
  bankName: z.string().max(150).optional().nullable(),
  bankAccountName: z.string().max(150).optional().nullable(),
  bankAccountNumber: z.string().max(100).optional().nullable(),
  bankBranch: z.string().max(150).optional().nullable(),
  mobileMoneyDetails: z.string().max(300).optional().nullable(),
  otherPaymentInstructions: z.string().max(500).optional().nullable(),
});
