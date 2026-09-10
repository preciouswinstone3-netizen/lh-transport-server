export function customerToApi(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    postalAddress: row.postal_address,
    taxNumber: row.tax_number,
    registrationNumber: row.registration_number,
    customerReference: row.customer_reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function lineItemToApi(row: any) {
  return {
    id: row.id,
    description: row.description,
    serviceType: row.service_type,
    vehicle: row.vehicle,
    vehicleRegistration: row.vehicle_registration,
    driver: row.driver,
    pickupLocation: row.pickup_location,
    deliveryLocation: row.delivery_location,
    tripDate: row.trip_date,
    quantity: Number(row.quantity),
    unit: row.unit,
    rate: Number(row.rate),
    discountPercent: Number(row.discount_percent),
    taxPercent: Number(row.tax_percent),
    total: Number(row.total),
  };
}

export function invoiceToApi(row: any, items?: any[], customer?: any) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customer: customer ? customerToApi(customer) : undefined,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    currency: row.currency,
    referenceNumber: row.reference_number,
    customerPoNumber: row.customer_po_number,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discount_total),
    taxTotal: Number(row.tax_total),
    additionalCharges: Number(row.additional_charges),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    balance: Number(row.balance),
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items ? items.map(lineItemToApi) : undefined,
  };
}

export function paymentToApi(row: any) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    reference: row.reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function userToApi(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function settingsToApi(row: any) {
  return {
    companyName: row.company_name,
    logoDataUrl: row.logo_data_url,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    taxNumber: row.tax_number,
    registrationNumber: row.registration_number,
    invoicePrefix: row.invoice_prefix,
    invoiceStartingNumber: row.invoice_starting_number,
    invoiceNextNumber: row.invoice_next_number,
    defaultCurrency: row.default_currency,
    defaultTaxRate: Number(row.default_tax_rate),
    defaultPaymentTermsDays: row.default_payment_terms_days,
    invoiceFooter: row.invoice_footer,
    termsAndConditions: row.terms_and_conditions,
    bankName: row.bank_name,
    bankAccountName: row.bank_account_name,
    bankAccountNumber: row.bank_account_number,
    bankBranch: row.bank_branch,
    mobileMoneyDetails: row.mobile_money_details,
    otherPaymentInstructions: row.other_payment_instructions,
  };
}

export function auditLogToApi(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    description: row.description,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}
