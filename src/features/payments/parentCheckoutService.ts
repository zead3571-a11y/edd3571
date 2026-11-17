import { Invoice, PaymentRecord } from '../../types/eduflow';
import { computeInvoiceStatus } from '../../utils/eduflowLogic';
import { GatewayPaymentMethod } from '../integrations';

export function mapGatewayMethodToPaymentMethod(
  method: GatewayPaymentMethod
): PaymentRecord['method'] {
  switch (method) {
    case 'wallet':
      return 'محفظة';
    case 'card':
      return 'تحويل بنكي';
    case 'fawry':
      return 'إنستاباي';
    default:
      return 'تحويل بنكي';
  }
}

export interface InvoiceSettlementPatch {
  ok: boolean;
  error?: string;
  appliedAmount: number;
  newPaid: number;
  remainingAfter: number;
  nextStatus: Invoice['status'];
}

export function computeInvoiceSettlementPatch(
  invoice: Invoice,
  requestedAmount: number
): InvoiceSettlementPatch {
  const remainingBefore = Math.max(0, invoice.total - invoice.paid);
  if (remainingBefore <= 0) {
    return {
      ok: false,
      error: 'هذه الفاتورة مسددة بالكامل بالفعل.',
      appliedAmount: 0,
      newPaid: invoice.paid,
      remainingAfter: 0,
      nextStatus: 'paid',
    };
  }
  const cleanAmount = Math.round(Number(requestedAmount) * 100) / 100;
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return {
      ok: false,
      error: 'يرجى إدخال مبلغ دفع صحيح أكبر من صفر.',
      appliedAmount: 0,
      newPaid: invoice.paid,
      remainingAfter: remainingBefore,
      nextStatus: invoice.status,
    };
  }
  if (cleanAmount > remainingBefore) {
    return {
      ok: false,
      error: `المبلغ يتجاوز المتبقي على الفاتورة (${remainingBefore} ج).`,
      appliedAmount: 0,
      newPaid: invoice.paid,
      remainingAfter: remainingBefore,
      nextStatus: invoice.status,
    };
  }

  const newPaid = invoice.paid + cleanAmount;
  const remainingAfter = Math.max(0, invoice.total - newPaid);
  const nextStatus = computeInvoiceStatus(
    invoice.total,
    newPaid,
    invoice.daysOverdue
  );

  return {
    ok: true,
    appliedAmount: cleanAmount,
    newPaid,
    remainingAfter,
    nextStatus,
  };
}
