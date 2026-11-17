import {
  CashRegisterShift,
  Expense,
  PaymentRecord,
  SettlementRecord,
} from '../../types/eduflow';

export interface ShiftDrawerMetrics {
  cashCollected: number;
  instapayCollected: number;
  walletCollected: number;
  bankCollected: number;
  totalCollectedAllMethods: number;
  expensesTotal: number;
  settlementsPaidTotal: number;
  expectedCashInDrawer: number;
}

/**
 * Computes live drawer metrics for an open cash register shift starting from shift.openedAt date.
 */
export function computeShiftDrawerMetrics(params: {
  openingBalance: number;
  openedAtIso: string;
  closedAtIso?: string;
  payments: PaymentRecord[];
  expenses: Expense[];
  settlements: SettlementRecord[];
}): ShiftDrawerMetrics {
  const startDate = params.openedAtIso.slice(0, 10);
  const endDate = params.closedAtIso ? params.closedAtIso.slice(0, 10) : '9999-12-31';

  const shiftPayments = params.payments.filter(
    (p) => p.date >= startDate && p.date <= endDate
  );
  const shiftExpenses = params.expenses.filter(
    (e) => e.date >= startDate && e.date <= endDate
  );
  const shiftSettlements = params.settlements.filter(
    (s) =>
      s.status === 'settled' &&
      s.paymentMethod === 'نقدي' &&
      Boolean(s.settledAt) &&
      s.settledAt! >= startDate &&
      s.settledAt! <= endDate
  );

  let cashCollected = 0;
  let instapayCollected = 0;
  let walletCollected = 0;
  let bankCollected = 0;

  for (const p of shiftPayments) {
    if (p.method === 'نقدي') cashCollected += p.amount;
    else if (p.method === 'إنستاباي') instapayCollected += p.amount;
    else if (p.method === 'محفظة') walletCollected += p.amount;
    else if (p.method === 'تحويل بنكي') bankCollected += p.amount;
  }

  const expensesTotal = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);
  const settlementsPaidTotal = shiftSettlements.reduce(
    (sum, s) => sum + (s.amountPaid || 0),
    0
  );

  const expectedCashInDrawer =
    params.openingBalance + cashCollected - expensesTotal - settlementsPaidTotal;

  return {
    cashCollected,
    instapayCollected,
    walletCollected,
    bankCollected,
    totalCollectedAllMethods:
      cashCollected + instapayCollected + walletCollected + bankCollected,
    expensesTotal,
    settlementsPaidTotal,
    expectedCashInDrawer,
  };
}

export function computeClosingVariance(
  expectedCashInDrawer: number,
  actualCountedCash: number
): number {
  return Math.round((actualCountedCash - expectedCashInDrawer) * 100) / 100;
}

export function getActiveOpenShift(
  shifts: CashRegisterShift[]
): CashRegisterShift | undefined {
  return shifts.find((s) => s.status === 'open');
}
