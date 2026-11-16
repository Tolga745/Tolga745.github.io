// Browser version of src/utils/invoiceGenerator.ts (same layout, returns a Blob instead of a Buffer).
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { Doc } from './db';

export function generateInvoicePdf(invoice: Doc): Blob {
  const doc = new jsPDF() as jsPDF & { autoTable: (options: unknown) => jsPDF; lastAutoTable?: { finalY: number } };
  const width = doc.internal.pageSize.width;

  doc.setFontSize(20);
  doc.text('BEST 308 E-COMMERCE', width / 2, 20, { align: 'center' });
  doc.setFontSize(16);
  doc.text('INVOICE', width / 2, 30, { align: 'center' });

  doc.setFontSize(12);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 20, 50);
  doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 20, 60);

  const customer = invoice.customerDetails || {};
  doc.text('Bill To:', 20, 80);
  doc.text(String(customer.name ?? ''), 20, 90);
  doc.text(String(customer.email ?? ''), 20, 100);
  if (customer.address) doc.text(String(customer.address), 20, 110);

  doc.autoTable({
    startY: 120,
    head: [['Product', 'Size', 'Color', 'Qty', 'Price', 'Total']],
    body: (invoice.items || []).map((item: Doc) => {
      const price = parseFloat(item.salePrice);
      return [item.name, item.size, item.color, String(item.quantity), `$${price.toFixed(2)}`, `$${(price * item.quantity).toFixed(2)}`];
    }),
    theme: 'grid',
    headStyles: { fillColor: [66, 66, 66] },
  });

  const finalY = doc.lastAutoTable?.finalY || 120;
  doc.text(`Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`, 150, finalY + 20);
  doc.setFontSize(10);
  doc.text('Thank you for shopping with us!', width / 2, finalY + 40, { align: 'center' });
  doc.text('This is a demo site. No real order was placed.', width / 2, finalY + 50, { align: 'center' });

  return doc.output('blob');
}
