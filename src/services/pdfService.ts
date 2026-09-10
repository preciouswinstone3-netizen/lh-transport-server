import PDFDocument from 'pdfkit';

const COLORS = {
  primary: '#149af7',
  primaryDark: '#0146af',
  navy: '#1b2a65',
  paleBlue: '#e9f3ff',
  white: '#ffffff',
  textDark: '#1b2a65',
  textMuted: '#5b6b8c',
  border: '#d7e6fb',
};

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

export interface PdfCompanySettings {
  companyName: string;
  logoDataUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxNumber?: string | null;
  registrationNumber?: string | null;
  invoiceFooter?: string | null;
  termsAndConditions?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  mobileMoneyDetails?: string | null;
  otherPaymentInstructions?: string | null;
}

export interface PdfCustomer {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
}

export interface PdfLineItem {
  description: string;
  serviceType?: string | null;
  vehicle?: string | null;
  vehicleRegistration?: string | null;
  driver?: string | null;
  pickupLocation?: string | null;
  deliveryLocation?: string | null;
  tripDate?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
}

export interface PdfInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  currency: string;
  referenceNumber?: string | null;
  customerPoNumber?: string | null;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  additionalCharges: number;
  total: number;
  amountPaid: number;
  balance: number;
  items: PdfLineItem[];
  customer: PdfCustomer;
}

function fmtMoney(value: number, currency: string): string {
  const n = Number.isFinite(value) ? value : 0;
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
}

const COL = {
  desc: MARGIN,
  descW: 195,
  route: MARGIN + 195,
  routeW: 110,
  qty: MARGIN + 305,
  qtyW: 40,
  rate: MARGIN + 345,
  rateW: 70,
  tax: MARGIN + 415,
  taxW: 40,
  amount: MARGIN + 455,
  amountW: CONTENT_WIDTH - 455,
};

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const headerHeight = 22;
  doc.save();
  doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight).fill(COLORS.navy);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text('DESCRIPTION', COL.desc + 8, y + 7, { width: COL.descW - 8 })
    .text('ROUTE / VEHICLE', COL.route + 4, y + 7, { width: COL.routeW - 4 })
    .text('QTY', COL.qty, y + 7, { width: COL.qtyW, align: 'right' })
    .text('RATE', COL.rate, y + 7, { width: COL.rateW, align: 'right' })
    .text('TAX%', COL.tax, y + 7, { width: COL.taxW, align: 'right' })
    .text('AMOUNT', COL.amount, y + 7, { width: COL.amountW - 8, align: 'right' });
  doc.restore();
  return y + headerHeight;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  currentY: number,
  needed: number,
  onNewPage: () => number,
  reserve = 20
): number {
  const bottomLimit = PAGE.height - MARGIN - reserve;
  if (currentY + needed > bottomLimit) {
    doc.addPage({ size: 'A4', margin: MARGIN });
    return onNewPage();
  }
  return currentY;
}

export function generateInvoicePdf(
  invoice: PdfInvoice,
  company: PdfCompanySettings
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---------- HEADER ----------
      let y = MARGIN;
      const logoBoxW = 150;

      if (company.logoDataUrl) {
        try {
          const base64 = company.logoDataUrl.split(',').pop() || '';
          const buf = Buffer.from(base64, 'base64');
          doc.image(buf, MARGIN, y, { fit: [110, 55] });
        } catch {
          // ignore malformed image, fall back to text
        }
      }

      doc
        .fillColor(COLORS.navy)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(company.companyName || 'LH Transport', MARGIN + (company.logoDataUrl ? 120 : 0), y, {
          width: CONTENT_WIDTH - logoBoxW,
        });

      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textMuted);
      let infoY = y + 20;
      const infoX = MARGIN + (company.logoDataUrl ? 120 : 0);
      const infoLines = [
        company.address,
        [company.phone, company.email].filter(Boolean).join('   •   '),
        company.website,
        company.taxNumber ? `TPIN/VAT: ${company.taxNumber}` : null,
        company.registrationNumber ? `Reg. No: ${company.registrationNumber}` : null,
      ].filter(Boolean) as string[];
      for (const line of infoLines) {
        doc.text(line, infoX, infoY, { width: CONTENT_WIDTH - logoBoxW });
        infoY += 12;
      }

      // Invoice title block (top-right)
      const boxW = 190;
      const boxX = PAGE.width - MARGIN - boxW;
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(COLORS.primaryDark)
        .text('INVOICE', boxX, MARGIN, { width: boxW, align: 'right' });

      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.navy)
        .text(invoice.invoiceNumber, boxX, MARGIN + 28, { width: boxW, align: 'right' });

      const statusY = MARGIN + 44;
      const statusText = statusLabel(invoice.status).toUpperCase();
      doc.font('Helvetica-Bold').fontSize(8);
      const statusWidth = doc.widthOfString(statusText) + 16;
      doc
        .roundedRect(boxX + boxW - statusWidth, statusY, statusWidth, 16, 3)
        .fill(COLORS.primary);
      doc.fillColor(COLORS.white).text(statusText, boxX + boxW - statusWidth, statusY + 4, {
        width: statusWidth,
        align: 'center',
      });

      y = Math.max(infoY, statusY + 26) + 10;

      // ---------- DIVIDER ----------
      doc.moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).lineWidth(1.5).strokeColor(COLORS.primary).stroke();
      y += 14;

      // ---------- BILL TO + META ----------
      const metaColW = 220;
      const billColW = CONTENT_WIDTH - metaColW - 20;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted).text('BILL TO', MARGIN, y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy).text(invoice.customer.name, MARGIN, y + 14, {
        width: billColW,
      });
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted);
      let billY = y + 30;
      const billLines = [
        invoice.customer.contactPerson,
        invoice.customer.phone,
        invoice.customer.email,
        invoice.customer.address,
        invoice.customer.taxNumber ? `TPIN/VAT: ${invoice.customer.taxNumber}` : null,
      ].filter(Boolean) as string[];
      for (const line of billLines) {
        doc.text(line, MARGIN, billY, { width: billColW });
        billY += 12;
      }

      const metaX = MARGIN + billColW + 20;
      const metaRows: [string, string][] = [
        ['Invoice Date', fmtDate(invoice.invoiceDate)],
        ['Due Date', fmtDate(invoice.dueDate)],
        ['Currency', invoice.currency],
      ];
      if (invoice.referenceNumber) metaRows.push(['Reference No.', invoice.referenceNumber]);
      if (invoice.customerPoNumber) metaRows.push(['Customer PO No.', invoice.customerPoNumber]);

      let metaY = y;
      for (const [label, value] of metaRows) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted).text(label, metaX, metaY, {
          width: 100,
        });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.navy).text(value, metaX + 100, metaY, {
          width: metaColW - 100,
          align: 'right',
        });
        metaY += 15;
      }

      y = Math.max(billY, metaY) + 14;

      // ---------- TABLE ----------
      y = drawTableHeader(doc, y);

      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);

      invoice.items.forEach((item, idx) => {
        const routeParts = [
          item.pickupLocation && item.deliveryLocation
            ? `${item.pickupLocation} - ${item.deliveryLocation}`
            : item.pickupLocation || item.deliveryLocation,
          item.vehicleRegistration || item.vehicle,
          item.driver ? `Driver: ${item.driver}` : null,
        ].filter(Boolean) as string[];

        doc.font('Helvetica-Bold').fontSize(8.5);
        const descHeight = doc.heightOfString(item.description, { width: COL.descW - 8 });
        let serviceTypeHeight = 0;
        if (item.serviceType) {
          doc.font('Helvetica').fontSize(7.5);
          serviceTypeHeight = doc.heightOfString(item.serviceType, { width: COL.descW - 8 }) + 3;
        }
        doc.font('Helvetica').fontSize(8);
        const routeHeight = doc.heightOfString(routeParts.join('\n'), { width: COL.routeW - 4 });
        const descBlockHeight = descHeight + serviceTypeHeight;
        const rowHeight = Math.max(descBlockHeight, routeHeight, 14) + 12;

        y = ensureSpace(doc, y, rowHeight, () => drawTableHeader(doc, MARGIN));

        if (idx % 2 === 1) {
          doc.save();
          doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill(COLORS.paleBlue);
          doc.restore();
        }

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark)
          .text(item.description, COL.desc + 8, y + 6, { width: COL.descW - 8 });
        if (item.serviceType) {
          doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted)
            .text(item.serviceType, COL.desc + 8, y + 6 + descHeight + 3, { width: COL.descW - 8 });
        }

        doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted)
          .text(routeParts.join('\n'), COL.route + 4, y + 6, { width: COL.routeW - 4 });

        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark)
          .text(`${item.quantity} ${item.unit}`, COL.qty, y + 6, { width: COL.qtyW + 20, align: 'right' });
        doc.text(fmtMoney(item.rate, invoice.currency).replace(invoice.currency + ' ', ''), COL.rate - 15, y + 6, {
          width: COL.rateW + 15,
          align: 'right',
        });
        doc.text(`${item.taxPercent}%`, COL.tax, y + 6, { width: COL.taxW, align: 'right' });
        doc.font('Helvetica-Bold').text(
          fmtMoney(item.total, invoice.currency).replace(invoice.currency + ' ', ''),
          COL.amount - 10,
          y + 6,
          { width: COL.amountW - 8 + 10, align: 'right' }
        );

        y += rowHeight;
      });

      doc.moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).strokeColor(COLORS.border).lineWidth(1).stroke();
      y += 10;

      // ---------- SUMMARY ----------
      const summaryW = 230;
      const summaryX = PAGE.width - MARGIN - summaryW;
      y = ensureSpace(doc, y, 140, () => MARGIN, 100);

      const summaryRows: [string, string, boolean?][] = [
        ['Subtotal', fmtMoney(invoice.subtotal, invoice.currency)],
        ['Discount', `- ${fmtMoney(invoice.discountTotal, invoice.currency)}`],
        ['Tax', fmtMoney(invoice.taxTotal, invoice.currency)],
      ];
      if (invoice.additionalCharges) {
        summaryRows.push(['Additional Charges', fmtMoney(invoice.additionalCharges, invoice.currency)]);
      }

      let sY = y;
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted);
      for (const [label, value] of summaryRows) {
        doc.text(label, summaryX, sY, { width: 120 });
        doc.fillColor(COLORS.textDark).text(value, summaryX + 110, sY, { width: summaryW - 110, align: 'right' });
        doc.fillColor(COLORS.textMuted);
        sY += 15;
      }

      doc.save();
      doc.rect(summaryX, sY + 2, summaryW, 26).fill(COLORS.navy);
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11).text('TOTAL', summaryX + 10, sY + 10, {
        width: 100,
      });
      doc.text(fmtMoney(invoice.total, invoice.currency), summaryX + 100, sY + 10, {
        width: summaryW - 110,
        align: 'right',
      });
      doc.restore();
      sY += 34;

      doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted).text('Amount Paid', summaryX, sY, { width: 120 });
      doc.fillColor(COLORS.textDark).text(fmtMoney(invoice.amountPaid, invoice.currency), summaryX + 110, sY, {
        width: summaryW - 110,
        align: 'right',
      });
      sY += 16;

      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primaryDark).text('Balance Due', summaryX, sY, {
        width: 120,
      });
      doc.text(fmtMoney(invoice.balance, invoice.currency), summaryX + 100, sY, {
        width: summaryW - 100,
        align: 'right',
      });
      sY += 20;

      y = sY + 16;

      // ---------- NOTES ----------
      if (invoice.notes) {
        y = ensureSpace(doc, y, 40, () => MARGIN);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted).text('NOTES', MARGIN, y);
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
        const notesHeight = doc.heightOfString(invoice.notes, { width: CONTENT_WIDTH });
        doc.text(invoice.notes, MARGIN, y + 12, { width: CONTENT_WIDTH });
        y += 12 + notesHeight + 12;
      }

      // ---------- PAYMENT DETAILS + TERMS ----------
      const paymentLines = [
        company.bankName ? `Bank: ${company.bankName}` : null,
        company.bankAccountName ? `Account Name: ${company.bankAccountName}` : null,
        company.bankAccountNumber ? `Account No: ${company.bankAccountNumber}` : null,
        company.bankBranch ? `Branch: ${company.bankBranch}` : null,
        company.mobileMoneyDetails ? `Mobile Money: ${company.mobileMoneyDetails}` : null,
        company.otherPaymentInstructions || null,
      ].filter(Boolean) as string[];

      if (paymentLines.length) {
        y = ensureSpace(doc, y, 20 + paymentLines.length * 12, () => MARGIN);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted).text('PAYMENT DETAILS', MARGIN, y);
        y += 13;
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
        const paymentColWidth = CONTENT_WIDTH / 2 - 10;
        for (const line of paymentLines) {
          const lineHeight = doc.heightOfString(line, { width: paymentColWidth });
          y = ensureSpace(doc, y, lineHeight + 2, () => MARGIN);
          doc.text(line, MARGIN, y, { width: paymentColWidth });
          y += lineHeight + 2;
        }
        y += 8;
      }

      if (company.termsAndConditions) {
        doc.font('Helvetica').fontSize(8);
        const termsHeight = doc.heightOfString(company.termsAndConditions, { width: CONTENT_WIDTH });
        y = ensureSpace(doc, y, termsHeight + 26, () => MARGIN);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted).text('TERMS & CONDITIONS', MARGIN, y);
        y += 13;
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted).text(company.termsAndConditions, MARGIN, y, {
          width: CONTENT_WIDTH,
        });
        y += termsHeight + 14;
      }

      // ---------- SIGNATURE ----------
      y = ensureSpace(doc, y, 60, () => MARGIN);
      const sigW = 180;
      doc.moveTo(MARGIN, y + 30).lineTo(MARGIN + sigW, y + 30).strokeColor(COLORS.border).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted).text('Authorized Signature', MARGIN, y + 34);

      doc
        .moveTo(PAGE.width - MARGIN - sigW, y + 30)
        .lineTo(PAGE.width - MARGIN, y + 30)
        .strokeColor(COLORS.border)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.textMuted)
        .text('Customer Acceptance', PAGE.width - MARGIN - sigW, y + 34);

      y += 55;

      if (company.invoiceFooter) {
        y = ensureSpace(doc, y, 24, () => MARGIN);
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor(COLORS.primaryDark)
          .text(company.invoiceFooter, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
      }

      // ---------- PAGE NUMBERS ----------
      // Writing inside the bottom margin band would otherwise trip PDFKit's
      // automatic page-break check (any text below page.height - margins.bottom
      // is treated as overflow and silently starts a new page). Temporarily
      // zero out the bottom margin on each page while we stamp the footer.
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(COLORS.textMuted)
          .text(`Page ${i + 1} of ${range.count}  -  ${invoice.invoiceNumber}`, MARGIN, PAGE.height - MARGIN + 12, {
            width: CONTENT_WIDTH,
            align: 'center',
            lineBreak: false,
          });
        doc.page.margins.bottom = originalBottomMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
