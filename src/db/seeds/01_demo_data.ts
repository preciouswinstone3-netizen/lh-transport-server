import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { calculateInvoiceTotals } from '../../services/calcService';

const id = (prefix: string) => `${prefix}_${uuidv4()}`;

const ROUTES = [
  ['Lilongwe', 'Blantyre'],
  ['Blantyre', 'Mzuzu'],
  ['Lilongwe', 'Mzuzu'],
  ['Lilongwe', 'Zomba'],
  ['Blantyre', 'Zomba'],
  ['Lilongwe', 'Mangochi'],
  ['Lilongwe', 'Kasungu'],
  ['Blantyre', 'Mulanje'],
  ['Lilongwe', 'Salima'],
  ['Mzuzu', 'Karonga'],
];

const VEHICLES = [
  { vehicle: 'Isuzu FRR Truck', reg: 'BT 4521' },
  { vehicle: 'Fuso Canter Truck', reg: 'BT 7783' },
  { vehicle: 'Scania Flatbed', reg: 'LL 2290' },
  { vehicle: 'Howo Tipper Truck', reg: 'LL 5567' },
  { vehicle: 'Isuzu NPR Truck', reg: 'MZ 1183' },
];

const DRIVERS = ['J. Banda', 'M. Phiri', 'C. Mwale', 'T. Kachale', 'A. Gondwe', 'F. Chirwa'];

const SERVICE_TYPES = ['Goods Transportation', 'Bulk Cargo Haulage', 'Freight Delivery', 'Equipment Transport'];

const CUSTOMERS = [
  { name: 'Kwacha Foods Ltd', contact: 'Grace Mvula', phone: '+265 991 234 001', email: 'accounts@kwachafoods.mw' },
  { name: 'Sunrise Agro Processors', contact: 'Peter Nyirenda', phone: '+265 991 234 002', email: 'finance@sunriseagro.mw' },
  { name: 'Blantyre Cement Co.', contact: 'Ellen Kamanga', phone: '+265 991 234 003', email: 'procurement@blancement.mw' },
  { name: 'Lakeshore Beverages', contact: 'James Mkandawire', phone: '+265 991 234 004', email: 'ap@lakeshorebev.mw' },
  { name: 'Central Region Retailers', contact: 'Ruth Chizuma', phone: '+265 991 234 005', email: 'billing@crretail.mw' },
  { name: 'Mzuzu Timber & Hardware', contact: 'Davie Zulu', phone: '+265 991 234 006', email: 'accounts@mzutimber.mw' },
  { name: 'Green Valley Farms', contact: 'Chikondi Banda', phone: '+265 991 234 007', email: 'finance@greenvalley.mw' },
  { name: 'National Construction Supplies', contact: 'Osman Jere', phone: '+265 991 234 008', email: 'ap@ncs.mw' },
  { name: 'Southern Fertilizer Distributors', contact: 'Ireen Chiumia', phone: '+265 991 234 009', email: 'accounts@sfd.mw' },
  { name: 'Zomba Textile Mills', contact: 'Kondwani Phiri', phone: '+265 991 234 010', email: 'finance@zombatextiles.mw' },
  { name: 'Malawi Sugar Traders', contact: 'Loveness Mbewe', phone: '+265 991 234 011', email: 'ap@mwsugar.mw' },
  { name: 'Highlands Coffee Cooperative', contact: 'Steve Nkhoma', phone: '+265 991 234 012', email: 'accounts@highlandscoffee.mw' },
];

function randOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function seed(knex: Knex): Promise<void> {
  await knex('audit_logs').del();
  await knex('payments').del();
  await knex('invoice_items').del();
  await knex('invoices').del();
  await knex('customers').del();
  await knex('users').del();
  await knex('company_settings').del();

  // ---------- Users ----------
  const adminId = id('user');
  const staffId = id('user');
  const adminPasswordHash = await bcrypt.hash('Admin@12345', 12);
  const staffPasswordHash = await bcrypt.hash('Staff@12345', 12);

  await knex('users').insert([
    {
      id: adminId,
      name: 'Chikumbutso Mvula',
      email: 'admin@lhtransport.mw',
      password_hash: adminPasswordHash,
      role: 'admin',
      status: 'active',
    },
    {
      id: staffId,
      name: 'Blessings Nyirenda',
      email: 'staff@lhtransport.mw',
      password_hash: staffPasswordHash,
      role: 'staff',
      status: 'active',
    },
  ]);

  // ---------- Company settings ----------
  await knex('company_settings').insert({
    id: 'singleton',
    company_name: 'LH Transport',
    logo_data_url: null,
    address: 'Plot 12/34, Kamuzu Procession Road, Lilongwe, Malawi',
    phone: '+265 1 772 000',
    email: 'billing@lhtransport.mw',
    website: 'www.lhtransport.mw',
    tax_number: 'TPIN 10029384',
    registration_number: 'BR 048213',
    invoice_prefix: 'LH-INV',
    invoice_starting_number: 1,
    invoice_next_number: 1,
    default_currency: 'MWK',
    default_tax_rate: 16.5,
    default_payment_terms_days: 14,
    invoice_footer: 'Thank you for your business with LH Transport.',
    terms_and_conditions:
      'Payment is due within 14 days of the invoice date unless otherwise agreed in writing. Late payments may attract a surcharge of 2% per month. Goods in transit remain the responsibility of the consignor until delivery is confirmed. All disputes must be raised within 7 days of invoice receipt.',
    bank_name: 'National Bank of Malawi',
    bank_account_name: 'LH Transport Limited',
    bank_account_number: '1002938475',
    bank_branch: 'Capital City Branch, Lilongwe',
    mobile_money_details: 'Airtel Money: +265 991 000 111 (LH Transport Ltd)',
    other_payment_instructions: 'Please use the invoice number as your payment reference.',
  });

  // ---------- Customers ----------
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const cid = id('cust');
    customerIds.push(cid);
    await knex('customers').insert({
      id: cid,
      name: c.name,
      contact_person: c.contact,
      phone: c.phone,
      email: c.email,
      address: `${randOf(['Area 2', 'Area 10', 'Area 47', 'Ginnery Corner', 'Chichiri', 'Katoto'])}, ${randOf([
        'Lilongwe',
        'Blantyre',
        'Mzuzu',
      ])}, Malawi`,
      postal_address: 'P.O. Box ' + Math.floor(Math.random() * 9000 + 100),
      tax_number: `TPIN ${Math.floor(Math.random() * 9000000 + 1000000)}`,
      registration_number: `BR ${Math.floor(Math.random() * 900000 + 100000)}`,
      customer_reference: null,
      notes: null,
      created_by: adminId,
    });
  }

  // ---------- Invoices ----------
  const statuses: { status: string; weight: number }[] = [
    { status: 'paid', weight: 8 },
    { status: 'partially_paid', weight: 4 },
    { status: 'sent', weight: 4 },
    { status: 'overdue', weight: 3 },
    { status: 'draft', weight: 2 },
    { status: 'cancelled', weight: 1 },
  ];
  const weightedStatuses: string[] = [];
  for (const s of statuses) for (let i = 0; i < s.weight; i++) weightedStatuses.push(s.status);

  let invoiceCounter = 1;
  const year = new Date().getFullYear();

  for (let i = 0; i < 24; i++) {
    const invId = id('inv');
    const invoiceNumber = `LH-INV-${year}-${String(invoiceCounter++).padStart(4, '0')}`;
    const customerId = randOf(customerIds);
    const ageInDays = Math.floor(Math.random() * 75);
    const invoiceDate = daysAgo(ageInDays);
    const dueDate = ageInDays > 14 ? daysFromNow(14 - ageInDays) : daysFromNow(14 - ageInDays);

    const numItems = 1 + Math.floor(Math.random() * 3);
    const items = [];
    for (let j = 0; j < numItems; j++) {
      const [pickup, delivery] = randOf(ROUTES);
      const vehicle = randOf(VEHICLES);
      const quantity = 1 + Math.floor(Math.random() * 3);
      const rate = [180000, 220000, 250000, 300000, 420000, 500000][Math.floor(Math.random() * 6)];
      items.push({
        description: randOf(SERVICE_TYPES),
        serviceType: randOf(SERVICE_TYPES),
        vehicle: vehicle.vehicle,
        vehicleRegistration: vehicle.reg,
        driver: randOf(DRIVERS),
        pickupLocation: pickup,
        deliveryLocation: delivery,
        tripDate: invoiceDate,
        quantity,
        unit: 'trip',
        rate,
        discountPercent: Math.random() < 0.2 ? 5 : 0,
        taxPercent: 16.5,
      });
    }

    let status = randOf(weightedStatuses);
    // Ensure the due date is genuinely in the past for overdue demo invoices.
    const effectiveDueDate = status === 'overdue' ? daysAgo(Math.max(1, 5)) : dueDate;

    const additionalCharges = Math.random() < 0.15 ? 15000 : 0;
    let amountPaidTarget = 0;

    const totals = calculateInvoiceTotals({ items, additionalCharges, amountPaid: 0 });

    if (status === 'paid') amountPaidTarget = totals.total;
    if (status === 'partially_paid') amountPaidTarget = Math.round(totals.total * (0.3 + Math.random() * 0.4));
    if (status === 'draft') amountPaidTarget = 0;

    const finalTotals = calculateInvoiceTotals({ items, additionalCharges, amountPaid: amountPaidTarget });

    await knex('invoices').insert({
      id: invId,
      invoice_number: invoiceNumber,
      customer_id: customerId,
      invoice_date: invoiceDate,
      due_date: effectiveDueDate,
      currency: 'MWK',
      reference_number: `REF-${1000 + i}`,
      customer_po_number: Math.random() < 0.4 ? `PO-${5000 + i}` : null,
      subtotal: finalTotals.subtotal,
      discount_total: finalTotals.discountTotal,
      tax_total: finalTotals.taxTotal,
      additional_charges: finalTotals.additionalCharges,
      total: finalTotals.total,
      amount_paid: finalTotals.amountPaid,
      balance: finalTotals.balance,
      status,
      notes: Math.random() < 0.3 ? 'Please deliver invoice copy to site office on arrival.' : null,
      created_by: Math.random() < 0.7 ? adminId : staffId,
      created_at: new Date(Date.now() - ageInDays * 86400000).toISOString(),
    });

    let position = 0;
    for (const item of items) {
      const lineCalc = calculateInvoiceTotals({ items: [item] });
      await knex('invoice_items').insert({
        id: id('item'),
        invoice_id: invId,
        position: position++,
        description: item.description,
        service_type: item.serviceType,
        vehicle: item.vehicle,
        vehicle_registration: item.vehicleRegistration,
        driver: item.driver,
        pickup_location: item.pickupLocation,
        delivery_location: item.deliveryLocation,
        trip_date: item.tripDate,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        discount_percent: item.discountPercent,
        tax_percent: item.taxPercent,
        total: lineCalc.total,
      });
    }

    if (finalTotals.amountPaid > 0) {
      await knex('payments').insert({
        id: id('pay'),
        invoice_id: invId,
        amount: finalTotals.amountPaid,
        payment_date: daysAgo(Math.max(0, ageInDays - 3)),
        payment_method: randOf(['Bank Transfer', 'Mobile Money', 'Cash', 'Cheque']),
        reference: `PMT-${2000 + i}`,
        notes: null,
        created_by: adminId,
      });
    }
  }

  // Update the running invoice_next_number so real usage continues after demo data.
  await knex('company_settings').where({ id: 'singleton' }).update({ invoice_next_number: invoiceCounter });

  await knex('audit_logs').insert({
    id: id('log'),
    user_id: adminId,
    user_name: 'Chikumbutso Mvula',
    action: 'system.seed',
    entity_type: 'system',
    entity_id: null,
    description: 'Demo data seeded for development.',
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
  });
}
