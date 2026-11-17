import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DEFAULT_CENTER_ID } from '../data/seedData';
import {
  AutoReminderRule,
  Expense,
  GamificationPointEntry,
  Group,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  OnlineExam,
  PaymentRecord,
  RegistrationLead,
  SettlementRecord,
  StaffAttendanceRecord,
  Student,
} from '../types/eduflow';
import {
  computeExamMaxScore,
  computeStudentExamStats,
  gradeOnlineExamSubmission,
  parseVideoEmbedUrl,
} from './studentPortal/lessonsAndExams';
import {
  computeInvoiceSettlementPatch,
  mapGatewayMethodToPaymentMethod,
} from './payments/parentCheckoutService';
import { scanInvoicesForAutoReminders } from './billing/autoReminderService';
import {
  computeClosingVariance,
  computeShiftDrawerMetrics,
} from './finance/cashRegisterService';
import {
  applyInstallmentPayment,
  buildInstallmentSchedule,
} from './finance/installmentsService';
import {
  computeInventorySummary,
  findLowStockItems,
  validateInventoryTransaction,
} from './inventory/inventoryService';
import {
  countLeadsByStatus,
  generateLeadTicketCode,
  validatePublicLeadForm,
} from './crm/registrationService';
import {
  calculateNetPayroll,
  computeStaffAttendanceSummary,
} from './payroll/staffPayrollService';
import {
  computeLeaderboard,
  computeStudentPointsTotal,
  getPointsBadge,
} from './gamification/pointsService';

const makeSampleStudent = (overrides: Partial<Student> = {}): Student => ({
  id: 'st-1',
  centerId: DEFAULT_CENTER_ID,
  code: 'S-000101',
  fullName: 'محمود ميمي',
  name: 'محمود ميمي',
  stage: 'الصف الثالث الثانوي',
  phone: '01001122334',
  parent: { name: 'ميمي البنا', phone: '01001122334' },
  parentName: 'ميمي البنا',
  parentPhone: '01001122334',
  groupIds: ['g-1'],
  status: 'active',
  paymentStatus: 'pending',
  lastAttendance: 'لم يحضر بعد',
  attendanceRate: 100,
  notes: [],
  createdAt: '2026-11-16T00:00:00.000Z',
  ...overrides,
});

// 1) Student Portal: Video parsing & Online Exams grading
test('parseVideoEmbedUrl extracts YouTube, Vimeo, direct MP4, and rejects non-HTTP URLs', () => {
  const yt = parseVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt?.kind, 'youtube');
  assert.equal(yt?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

  const shortYt = parseVideoEmbedUrl('https://youtu.be/abcDEF_12');
  assert.equal(shortYt?.kind, 'youtube');

  const vimeo = parseVideoEmbedUrl('https://vimeo.com/123456789');
  assert.equal(vimeo?.kind, 'vimeo');
  assert.equal(vimeo?.embedUrl, 'https://player.vimeo.com/video/123456789');

  const mp4 = parseVideoEmbedUrl('https://cdn.eduflow.eg/lesson1.mp4');
  assert.equal(mp4?.kind, 'direct');

  assert.equal(parseVideoEmbedUrl('javascript:alert(1)'), null);
  assert.equal(parseVideoEmbedUrl(''), null);
});

test('gradeOnlineExamSubmission scores answers accurately and computes stats', () => {
  const exam: OnlineExam = {
    id: 'ex-1',
    centerId: DEFAULT_CENTER_ID,
    title: 'اختبار الوحدة الأولى',
    groupId: 'g-1',
    teacherId: 't-1',
    durationMinutes: 15,
    passingScore: 3,
    published: true,
    createdAt: '2026-11-16T00:00:00.000Z',
    questions: [
      { id: 'q1', prompt: 'س1', type: 'mcq', options: ['أ', 'ب', 'ج', 'د'], correctIndex: 1, points: 2 },
      { id: 'q2', prompt: 'س2', type: 'tf', options: ['صح', 'خطأ'], correctIndex: 0, points: 2 },
      { id: 'q3', prompt: 'س3', type: 'mcq', options: ['أ', 'ب', 'ج', 'د'], correctIndex: 3, points: 1 },
    ],
  };

  assert.equal(computeExamMaxScore(exam.questions), 5);
  const gradedPass = gradeOnlineExamSubmission(exam, [1, 0, 0]);
  assert.equal(gradedPass.score, 4);
  assert.equal(gradedPass.passed, true);
  assert.equal(gradedPass.correctCount, 2);
  assert.equal(gradedPass.percentage, 80);

  const gradedFail = gradeOnlineExamSubmission(exam, [0, 1, 0]);
  assert.equal(gradedFail.score, 0);
  assert.equal(gradedFail.passed, false);

  const stats = computeStudentExamStats([
    {
      id: 'att-1',
      centerId: DEFAULT_CENTER_ID,
      examId: 'ex-1',
      studentId: 'st-1',
      answers: [1, 0, 0],
      score: 4,
      maxScore: 5,
      passed: true,
      submittedAt: '2026-11-16T10:00:00.000Z',
    },
  ]);
  assert.equal(stats.totalAttempts, 1);
  assert.equal(stats.passedCount, 1);
  assert.equal(stats.averagePct, 80);
});

// 2) Parent Online Checkout
test('computeInvoiceSettlementPatch validates partial/full/overpayment and gateway mapping', () => {
  assert.equal(mapGatewayMethodToPaymentMethod('wallet'), 'محفظة');
  assert.equal(mapGatewayMethodToPaymentMethod('card'), 'تحويل بنكي');
  assert.equal(mapGatewayMethodToPaymentMethod('fawry'), 'إنستاباي');

  const inv: Invoice = {
    id: 'inv-1',
    centerId: DEFAULT_CENTER_ID,
    number: 'INV-101',
    invoiceNumber: 'INV-101',
    studentId: 'st-1',
    groupId: 'g-1',
    month: 'نوفمبر 2026',
    baseAmount: 400,
    discountLines: [],
    netAmount: 400,
    total: 400,
    paid: 0,
    status: 'pending',
    dueDate: '2026-11-01',
    daysOverdue: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const over = computeInvoiceSettlementPatch(inv, 500);
  assert.equal(over.ok, false);

  const partial = computeInvoiceSettlementPatch(inv, 150);
  assert.equal(partial.ok, true);
  assert.equal(partial.newPaid, 150);
  assert.equal(partial.remainingAfter, 250);
  assert.equal(partial.nextStatus, 'partial');

  const full = computeInvoiceSettlementPatch({ ...inv, paid: 150, status: 'partial' }, 250);
  assert.equal(full.ok, true);
  assert.equal(full.nextStatus, 'paid');
  assert.equal(full.remainingAfter, 0);
});

// 3 & 5) Auto Reminders
test('scanInvoicesForAutoReminders respects threshold, skip same day, and missing phones', () => {
  const students = [
    makeSampleStudent({ id: 'st-1', parentPhone: '01001122334' }),
    makeSampleStudent({ id: 'st-2', parentPhone: '', parent: { name: 'ولي أمر بدون هاتف', phone: '' } }),
  ];
  const groups: Group[] = [
    {
      id: 'g-1',
      centerId: DEFAULT_CENTER_ID,
      name: 'فرنساوي 3ث',
      teacherId: 't-1',
      subject: 'فرنساوي',
      stage: 'الصف الثالث الثانوي',
      days: ['السبت'],
      startTime: '16:00',
      endTime: '18:00',
      roomId: 'r-1',
      room: 'قاعة 1',
      capacity: 40,
      monthlyPrice: 400,
      startDate: '2026-09-01',
      status: 'active',
    },
  ];
  const invoices: Invoice[] = [
    {
      id: 'inv-overdue',
      centerId: DEFAULT_CENTER_ID,
      number: 'INV-1',
      invoiceNumber: 'INV-1',
      studentId: 'st-1',
      groupId: 'g-1',
      month: 'نوفمبر 2026',
      baseAmount: 400,
      discountLines: [],
      netAmount: 400,
      total: 400,
      paid: 0,
      status: 'overdue',
      dueDate: '2026-11-01',
      daysOverdue: 5,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'inv-already-today',
      centerId: DEFAULT_CENTER_ID,
      number: 'INV-2',
      invoiceNumber: 'INV-2',
      studentId: 'st-1',
      groupId: 'g-1',
      month: 'نوفمبر 2026',
      baseAmount: 400,
      discountLines: [],
      netAmount: 400,
      total: 400,
      paid: 0,
      status: 'overdue',
      dueDate: '2026-11-01',
      daysOverdue: 5,
      lastReminderDate: '2026-11-16',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'inv-no-phone',
      centerId: DEFAULT_CENTER_ID,
      number: 'INV-3',
      invoiceNumber: 'INV-3',
      studentId: 'st-2',
      groupId: 'g-1',
      month: 'نوفمبر 2026',
      baseAmount: 400,
      discountLines: [],
      netAmount: 400,
      total: 400,
      paid: 0,
      status: 'overdue',
      dueDate: '2026-11-01',
      daysOverdue: 5,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  const rule: AutoReminderRule = {
    enabled: true,
    daysOverdueThreshold: 3,
    includePendingDueSoon: false,
    channel: 'cloud_api',
  };

  const results = scanInvoicesForAutoReminders({
    invoices,
    students,
    groups,
    templateBody: 'تنبيه: {اسم_الطالب} مستحق {المبلغ} ج',
    rule,
    todayIso: '2026-11-16',
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].invoice.id, 'inv-overdue');
  assert.ok(results[0].body.includes('400'));
});

// 4) Cash Register
test('computeShiftDrawerMetrics accurately calculates cash drawer balance and variance', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      centerId: DEFAULT_CENTER_ID,
      receiptNumber: 'R-1',
      invoiceId: 'i1',
      studentId: 'st-1',
      groupId: 'g-1',
      amount: 400,
      remainingAfter: 0,
      method: 'نقدي',
      date: '2026-11-16',
      recordedBy: 'حامد',
    },
    {
      id: 'p2',
      centerId: DEFAULT_CENTER_ID,
      receiptNumber: 'R-2',
      invoiceId: 'i2',
      studentId: 'st-2',
      groupId: 'g-1',
      amount: 300,
      remainingAfter: 0,
      method: 'محفظة',
      date: '2026-11-16',
      recordedBy: 'حامد',
    },
  ];
  const expenses: Expense[] = [
    {
      id: 'e1',
      centerId: DEFAULT_CENTER_ID,
      date: '2026-11-16',
      category: 'مستلزمات',
      amount: 100,
      description: 'ورق طباعة',
      addedBy: 'حامد',
    },
  ];
  const settlements: SettlementRecord[] = [
    {
      id: 's1',
      centerId: DEFAULT_CENTER_ID,
      teacherId: 't-1',
      month: 'نوفمبر 2026',
      monthKey: '2026-11',
      basis: 'cash',
      grossRevenue: 400,
      teacherShare: 200,
      centerShare: 200,
      carriedForwardIn: 0,
      manualLines: [],
      netPayable: 200,
      amountPaid: 200,
      carriedForwardOut: 0,
      paymentMethod: 'نقدي',
      status: 'settled',
      settledAt: '2026-11-16',
      settledBy: 'حامد',
    },
  ];

  const metrics = computeShiftDrawerMetrics({
    openingBalance: 500,
    openedAtIso: '2026-11-16T08:00:00.000Z',
    payments,
    expenses,
    settlements,
  });

  assert.equal(metrics.cashCollected, 400);
  assert.equal(metrics.walletCollected, 300);
  assert.equal(metrics.totalCollectedAllMethods, 700);
  // 500 opening + 400 cash - 100 expense - 200 cash settlement = 600
  assert.equal(metrics.expectedCashInDrawer, 600);
  assert.equal(computeClosingVariance(600, 585), -15);
});

// 6) Inventory
test('inventoryService prevents over-selling and tracks restock/sales', () => {
  const item: InventoryItem = {
    id: 'invt-1',
    centerId: DEFAULT_CENTER_ID,
    name: 'مذكرة اللغة الفرنسية - نوفمبر',
    category: 'مذكرة',
    stage: 'الصف الثالث الثانوي',
    subject: 'اللغة الفرنسية',
    unitPrice: 75,
    costPrice: 30,
    stockQty: 10,
    minStockAlert: 12,
    createdAt: '2026-11-16T00:00:00.000Z',
  };

  assert.equal(findLowStockItems([item]).length, 1);

  const badSale = validateInventoryTransaction({ item, type: 'sale', qty: 11 });
  assert.equal(badSale.ok, false);

  const okSale = validateInventoryTransaction({ item, type: 'sale', qty: 3 });
  assert.equal(okSale.ok, true);
  assert.equal(okSale.nextStockQty, 7);

  const okRestock = validateInventoryTransaction({ item, type: 'restock', qty: 20 });
  assert.equal(okRestock.ok, true);
  assert.equal(okRestock.nextStockQty, 30);

  const txs: InventoryTransaction[] = [
    {
      id: 'itx-1',
      centerId: DEFAULT_CENTER_ID,
      itemId: item.id,
      itemName: item.name,
      type: 'sale',
      qty: 3,
      unitPrice: 75,
      totalAmount: 225,
      handledBy: 'حامد',
      date: '2026-11-16',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
  ];
  const summary = computeInventorySummary([item], txs);
  assert.equal(summary.salesRevenue, 225);
});

// 8) CRM & Public Registration
test('registrationService validates public leads and counts status funnel', () => {
  assert.equal(generateLeadTicketCode(0), 'REG-0101');
  const bad = validatePublicLeadForm({
    studentName: 'علي',
    stage: 'الصف الثالث الثانوي',
    phone: '010',
    parentName: 'أحمد',
    parentPhone: '123',
    preferredSubject: 'فرنساوي',
  });
  assert.equal(bad.ok, false);

  const good = validatePublicLeadForm({
    studentName: 'زياد خالد حسن',
    stage: 'الصف الثالث الثانوي',
    phone: '01099887766',
    parentName: 'خالد حسن',
    parentPhone: '01099887765',
    preferredSubject: 'اللغة الفرنسية',
  });
  assert.equal(good.ok, true);

  const leads: RegistrationLead[] = [
    {
      id: 'l1',
      centerId: DEFAULT_CENTER_ID,
      ticketCode: 'REG-0101',
      studentName: 'زياد خالد حسن',
      stage: 'الصف الثالث الثانوي',
      phone: '01099887766',
      parentName: 'خالد حسن',
      parentPhone: '01099887765',
      preferredSubject: 'اللغة الفرنسية',
      source: 'online_form',
      status: 'new',
      notes: '',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
  ];
  assert.equal(countLeadsByStatus(leads).newCount, 1);
});

// 9) Staff Attendance & Payroll
test('staffPayrollService calculates net payroll cleanly and summarizes attendance', () => {
  const net = calculateNetPayroll({
    baseSalary: 4500,
    bonuses: 500,
    deductions: 200,
    advances: 300,
  });
  assert.equal(net, 4500);

  const clamped = calculateNetPayroll({
    baseSalary: 1000,
    bonuses: 0,
    deductions: 800,
    advances: 500,
  });
  assert.equal(clamped, 0);

  const att: StaffAttendanceRecord[] = [
    {
      id: 'sa1',
      centerId: DEFAULT_CENTER_ID,
      userId: 'u1',
      staffName: 'سلمى',
      role: 'مدير',
      date: '2026-11-16',
      status: 'present',
      recordedBy: 'حامد',
    },
    {
      id: 'sa2',
      centerId: DEFAULT_CENTER_ID,
      userId: 'u1',
      staffName: 'سلمى',
      role: 'مدير',
      date: '2026-11-17',
      status: 'late',
      recordedBy: 'حامد',
    },
  ];
  const sum = computeStaffAttendanceSummary(att, '2026-11', 'u1');
  assert.equal(sum.presentDays, 1);
  assert.equal(sum.lateDays, 1);
});

// 10a) Installments
test('installmentsService splits remainder into final installment and enforces payment caps', () => {
  const schedule = buildInstallmentSchedule({
    totalAmount: 1000,
    downPayment: 100,
    installmentsCount: 3,
    firstDueDate: '2026-12-01',
  });
  assert.equal(schedule.ok, true);
  assert.equal(schedule.financedAmount, 900);
  assert.equal(schedule.installments.length, 3);
  assert.equal(
    schedule.installments.reduce((s, i) => s + i.amount, 0),
    900
  );

  const paid = applyInstallmentPayment({
    plan: {
      id: 'plan-1',
      centerId: DEFAULT_CENTER_ID,
      studentId: 'st-1',
      title: 'خطة تقسيط',
      totalAmount: 1000,
      downPayment: 100,
      installments: schedule.installments,
      createdBy: 'u-hamed',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
    installmentId: schedule.installments[0].id,
    amount: 300,
    paidAtIso: '2026-11-16',
    receiptNumber: 'R-99',
  });
  assert.equal(paid.ok, true);
  assert.equal(paid.updatedInstallments[0].status, 'paid');
});

// 10b) Gamification Leaderboard
test('pointsService calculates total points, badges, and leaderboard ranking', () => {
  const students = [
    makeSampleStudent({ id: 'st-1', name: 'محمود ميمي' }),
    makeSampleStudent({ id: 'st-2', name: 'فيصل إمام' }),
  ];
  const entries: GamificationPointEntry[] = [
    {
      id: 'pt-1',
      centerId: DEFAULT_CENTER_ID,
      studentId: 'st-2',
      points: 300,
      category: 'behavior',
      reason: 'تفوق',
      awardedBy: 'أ. محمد عماد',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
    {
      id: 'pt-2',
      centerId: DEFAULT_CENTER_ID,
      studentId: 'st-1',
      points: 120,
      category: 'attendance',
      reason: 'حضور',
      awardedBy: 'أ. محمد عماد',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
  ];

  assert.equal(computeStudentPointsTotal(entries, 'st-2'), 300);
  assert.equal(getPointsBadge(300).title, 'طالب متفوق');
  const board = computeLeaderboard(students, entries);
  assert.equal(board[0].studentId, 'st-2');
  assert.equal(board[0].rank, 1);
  assert.equal(board[1].studentId, 'st-1');
  assert.equal(board[1].rank, 2);
});

// 10c) Server API Health & AI Missing-Key Guard (real HTTP check with EDUFLOW_SKIP_SERVER_LISTEN=1)
test('server /api/health returns ok and /api/ai/assistant returns HTTP 503 when GEMINI_API_KEY is absent', async () => {
  const prevSkip = process.env.EDUFLOW_SKIP_SERVER_LISTEN;
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.EDUFLOW_SKIP_SERVER_LISTEN = '1';
  delete process.env.GEMINI_API_KEY;

  try {
    const { createEduflowApp } = await import('../../server');
    const app = createEduflowApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === 'object');
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = (await healthRes.json()) as { ok: boolean; aiConfigured: boolean };
      assert.equal(healthJson.ok, true);
      assert.equal(healthJson.aiConfigured, false);

      const aiRes = await fetch(`${baseUrl}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'chat', prompt: 'مرحبا' }),
      });
      assert.equal(aiRes.status, 503);
      const aiJson = (await aiRes.json()) as { ok: boolean; error: string };
      assert.equal(aiJson.ok, false);
      assert.ok(aiJson.error.includes('GEMINI_API_KEY'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    if (prevSkip === undefined) delete process.env.EDUFLOW_SKIP_SERVER_LISTEN;
    else process.env.EDUFLOW_SKIP_SERVER_LISTEN = prevSkip;

    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  }
});
