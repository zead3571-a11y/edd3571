import { InstallmentItem, InstallmentPlan } from '../../types/eduflow';

function addMonthsToDateIso(startDateIso: string, monthsToAdd: number): string {
  const [yStr, mStr, dStr] = startDateIso.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = (Number(mStr) || 1) - 1;
  const day = Number(dStr) || 1;
  const date = new Date(year, month + monthsToAdd, day);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function buildInstallmentSchedule(params: {
  totalAmount: number;
  downPayment: number;
  installmentsCount: number;
  firstDueDate: string;
}): {
  ok: boolean;
  error?: string;
  installments: InstallmentItem[];
  financedAmount: number;
} {
  const total = Math.round(Number(params.totalAmount));
  const down = Math.max(0, Math.round(Number(params.downPayment) || 0));
  const count = Math.max(1, Math.min(24, Math.floor(Number(params.installmentsCount) || 1)));

  if (!Number.isFinite(total) || total <= 0) {
    return {
      ok: false,
      error: 'يجب أن يكون إجمالي مبلغ خطة التقسيط أكبر من صفر.',
      installments: [],
      financedAmount: 0,
    };
  }
  if (down >= total) {
    return {
      ok: false,
      error: 'المقدم يجب أن يكون أقل من المبلغ الإجمالي.',
      installments: [],
      financedAmount: 0,
    };
  }

  const financedAmount = total - down;
  const baseShare = Math.floor(financedAmount / count);
  const remainder = financedAmount - baseShare * count;

  const installments: InstallmentItem[] = Array.from({ length: count }, (_, idx) => {
    const amount = idx === count - 1 ? baseShare + remainder : baseShare;
    return {
      id: `inst-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      index: idx + 1,
      dueDate: addMonthsToDateIso(params.firstDueDate, idx),
      amount,
      paidAmount: 0,
      status: 'pending',
    };
  });

  return { ok: true, installments, financedAmount };
}

export function applyInstallmentPayment(params: {
  plan: InstallmentPlan;
  installmentId: string;
  amount: number;
  paidAtIso: string;
  receiptNumber: string;
}): {
  ok: boolean;
  error?: string;
  updatedInstallments: InstallmentItem[];
  appliedAmount: number;
} {
  const target = params.plan.installments.find((i) => i.id === params.installmentId);
  if (!target) {
    return {
      ok: false,
      error: 'القسط المطلوب غير موجود.',
      updatedInstallments: params.plan.installments,
      appliedAmount: 0,
    };
  }

  const remaining = Math.max(0, target.amount - target.paidAmount);
  const amt = Math.round(Number(params.amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    return {
      ok: false,
      error: 'يرجى إدخال قيمة دفع صالحة.',
      updatedInstallments: params.plan.installments,
      appliedAmount: 0,
    };
  }
  if (amt > remaining) {
    return {
      ok: false,
      error: `المبلغ المدفوع يتجاوز المتبقي على القسط (${remaining} ج).`,
      updatedInstallments: params.plan.installments,
      appliedAmount: 0,
    };
  }

  const updatedInstallments = params.plan.installments.map((item) => {
    if (item.id !== target.id) return item;
    const nextPaid = item.paidAmount + amt;
    const nextStatus: InstallmentItem['status'] =
      nextPaid >= item.amount ? 'paid' : 'partial';
    return {
      ...item,
      paidAmount: nextPaid,
      status: nextStatus,
      paidAt: params.paidAtIso,
      receiptNumber: params.receiptNumber,
    };
  });

  return {
    ok: true,
    updatedInstallments,
    appliedAmount: amt,
  };
}
