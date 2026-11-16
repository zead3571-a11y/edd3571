import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageAdapter, StorageLike } from '../data/localStorageAdapter';
import {
  createRepositories,
  getActivePermissionActor,
  setActivePermissionActor,
} from '../data/repositories';
import { DEFAULT_CENTER_ID } from '../data/seedData';
import { PermissionError } from '../permissions/permissions';
import { UserRole } from '../types/eduflow';
import {
  buildInvoicesCsv,
  buildReportCsv,
  buildStudentsCsv,
  sanitizeCsvCell,
} from './export/excelExport';
import {
  applyDiscountToInvoiceState,
  canDeleteInvoiceBatch,
  previewBulkInvoices,
} from './billing/invoicesAndDiscounts';
import { calculateTeacherSettlement } from './settlements/teacherSettlement';
import {
  buildAbsenceMessage,
  buildLatePaymentMessage,
  buildReceiptMessage,
  buildWhatsAppUrl,
  toWhatsAppPhone,
} from './messaging/whatsappService';
import {
  encodeStudentQrPayload,
  generateQrDataUrl,
  parseStudentQrPayload,
} from './qr/qrService';
import {
  createDeterministicFaceHash,
  verifyFaceAttendanceMatch,
} from './biometrics/faceAttendanceService';

class MemStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

test('Phase 3: CSV export neutralizes spreadsheet formula injection and includes UTF-8 BOM', () => {
  assert.equal(sanitizeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(sanitizeCsvCell('+cmd|calc'), "'+cmd|calc");
  assert.equal(sanitizeCsvCell('@evil'), "'@evil");
  assert.equal(sanitizeCsvCell('أحمد, علي'), '"أحمد, علي"');

  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  const repos = createRepositories(adapter);
  const csv = buildStudentsCsv(repos.students.list(), repos.groups.list());
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM');
  assert.ok(csv.includes('كود الطالب'));
  assert.ok(csv.includes('S-000101'));

  const invCsv = buildInvoicesCsv(
    repos.invoices.list(),
    repos.students.list(),
    repos.groups.list()
  );
  assert.ok(invCsv.includes('رقم الفاتورة'));

  const overdueReport = buildReportCsv('overdue', {
    payments: repos.payments.list(),
    expenses: repos.expenses.list(),
    invoices: repos.invoices.list(),
    groups: repos.groups.list(),
    teachers: repos.teachers.list(),
    sessions: repos.sessions.list(),
    students: repos.students.list(),
  });
  assert.equal(overdueReport.filename, 'eduflow-overdue-report.csv');
  assert.ok(overdueReport.csv.includes('أيام التأخير'));
});

test('Phase 4: Bulk invoice preview applies sibling & scholarship discounts idempotently', () => {
  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  const repos = createRepositories(adapter);

  const testGroup = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'فرنساوي - ثالثة ثانوي',
    subject: 'لغة فرنسية',
    teacherId: 't-mohamed',
    stage: 'الصف الثالث الثانوي',
    days: ['السبت', 'الثلاثاء'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1',
    roomId: 'r1',
    capacity: 30,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  });
  const thirdStudent = repos.students.create({
    centerId: DEFAULT_CENTER_ID,
    code: '',
    fullName: 'طالب منحة تفوق',
    name: 'طالب منحة تفوق',
    stage: 'الصف الثالث الثانوي',
    parent: { name: 'ولي أمر ثالث', phone: '01099887766' },
    parentName: 'ولي أمر ثالث',
    parentPhone: '01099887766',
    groupIds: [testGroup.id],
    status: 'active',
    paymentStatus: 'pending',
    lastAttendance: 'لم يحضر بعد',
    attendanceRate: 100,
    notes: [],
    standingDiscountConfig: {
      type: 'scholarship',
      value: 100,
      reason: 'منحة تفوق 100%',
    },
    createdAt: new Date().toISOString(),
  });

  const students = repos.students.list();
  const groups = repos.groups.list();
  const existingInvoices = repos.invoices.list();
  const settings = repos.meta.getCenterSettings();

  // Give 1st & 2nd students matching parentPhone to test sibling detection
  const sharedSiblingPhone = '01001112233';
  const testStudents = students.map((s, idx) => {
    if (idx === 0 || idx === 1) {
      return {
        ...s,
        parentPhone: sharedSiblingPhone,
        parent: { ...s.parent, phone: sharedSiblingPhone },
        groupIds: [testGroup.id],
      };
    }
    return s;
  });

  const preview1 = previewBulkInvoices({
    students: testStudents,
    groups,
    existingInvoices,
    monthInput: '2026-12',
    groupIds: groups.map((g) => g.id),
    dueDay: 1,
    discountPolicy: {
      siblingEnabled: true,
      secondChildPercent: 10,
      thirdPlusChildPercent: 20,
    },
  });

  assert.equal(preview1.itemsToCreate.length, 3);
  const sibItem = preview1.itemsToCreate.find((i) => i.siblingRank === 2);
  assert.ok(sibItem, 'One of the two siblings should receive rank 2 discount');
  assert.equal(sibItem.siblingRank, 2);
  assert.ok(sibItem.discountTotal > 0, 'Second sibling should receive discount');

  const freeItem = preview1.itemsToCreate.find((i) => i.student.id === thirdStudent.id);
  assert.ok(freeItem);
  assert.equal(freeItem.netAmount, 0);
  assert.equal(freeItem.isScholarshipFree, true);

  // Batch deletion guard: unpaid batch can be deleted, paid batch cannot
  const batchInvoices = [
    { ...existingInvoices[0], id: 'b-inv-1', batchId: 'batch-1', paid: 0 },
    { ...existingInvoices[0], id: 'b-inv-2', batchId: 'batch-1', paid: 0 },
  ];
  assert.equal(canDeleteInvoiceBatch(batchInvoices, 'batch-1'), true);
  assert.equal(
    canDeleteInvoiceBatch(
      [{ ...batchInvoices[0], paid: 100 }, batchInvoices[1]],
      'batch-1'
    ),
    false
  );

  // Manual discount requires non-empty reason and clamps net >= 0
  const invTarget = existingInvoices[0];
  const badRes = applyDiscountToInvoiceState({
    invoice: invTarget,
    category: 'manual',
    mode: 'fixed',
    value: 50,
    reason: '   ',
  });
  assert.equal(badRes.ok, false);

  const goodRes = applyDiscountToInvoiceState({
    invoice: { ...invTarget, baseAmount: 400, netAmount: 400, total: 400, discountLines: [] },
    category: 'manual',
    mode: 'fixed',
    value: 600,
    reason: 'تسوية إدارية خاصة',
  });
  assert.equal(goodRes.ok, true);
  assert.equal(goodRes.updatedInvoice?.netAmount, 0);
  assert.ok(settings);
});

test('Phase 5: Teacher settlement handles per_session (200 EGP/completed session), percent, and carry-forward', () => {
  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  const repos = createRepositories(adapter);

  const mohamed = repos.teachers.get('t-mohamed')!;
  const group = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة لغة فرنسية',
    subject: 'لغة فرنسية',
    teacherId: mohamed.id,
    stage: 'الصف الثالث الثانوي',
    days: ['السبت'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1',
    roomId: 'r1',
    capacity: 25,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  });

  // 2 recorded sessions + 1 cancelled + 1 pending => strictly 2 * 200 = 400 EGP
  const s1 = repos.sessions.create({
    centerId: DEFAULT_CENTER_ID,
    groupId: group.id,
    teacherId: mohamed.id,
    date: '2026-11-10',
    timeLabel: '16:00',
    roomId: 'r1',
    type: 'regular',
    status: 'recorded',
    entries: [],
  });
  const s2 = repos.sessions.create({
    centerId: DEFAULT_CENTER_ID,
    groupId: group.id,
    teacherId: mohamed.id,
    date: '2026-11-14',
    timeLabel: '16:00',
    roomId: 'r1',
    type: 'regular',
    status: 'recorded',
    entries: [],
  });
  const sCancelled = repos.sessions.create({
    centerId: DEFAULT_CENTER_ID,
    groupId: group.id,
    teacherId: mohamed.id,
    date: '2026-11-15',
    timeLabel: '16:00',
    roomId: 'r1',
    type: 'regular',
    status: 'cancelled',
    entries: [],
  });
  assert.ok(s1 && s2 && sCancelled);

  const perSessionCalc = calculateTeacherSettlement({
    teacher: mohamed,
    groups: repos.groups.list(),
    invoices: repos.invoices.list(),
    payments: repos.payments.list(),
    sessions: repos.sessions.list(),
    settlements: [],
    monthInput: '2026-11',
    basis: 'cash',
    manualLines: [{ id: 'ml-1', type: 'bonus', amount: 100, reason: 'حافز التزام' }],
    applyCarryForward: true,
  });

  assert.equal(perSessionCalc.sessionsHeldTotal, 2);
  assert.equal(perSessionCalc.teacherGross, 400);
  assert.equal(perSessionCalc.bonusesTotal, 100);
  assert.equal(perSessionCalc.netPayable, 500);

  // Percentage teacher & negative carry-forward check
  const pctTeacher = repos.teachers.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مدرس نسبة تجريبي',
    phone: '',
    subjects: ['لغة فرنسية'],
    compensationType: 'percentage',
    compensationValue: 70,
    compensation: { type: 'percent', centerPercent: 30 },
    hasLoginAccess: false,
    color: '#0F766E',
  });

  const calcNegative = calculateTeacherSettlement({
    teacher: pctTeacher,
    groups: repos.groups.list(),
    invoices: repos.invoices.list(),
    payments: repos.payments.list(),
    sessions: repos.sessions.list(),
    settlements: [],
    monthInput: '2026-11',
    basis: 'cash',
    manualLines: [{ id: 'ml-2', type: 'advance', amount: 999999, reason: 'سلفة كبيرة' }],
    applyCarryForward: true,
  });
  assert.equal(calcNegative.hasNegativeWarning, true);
  assert.equal(calcNegative.netPayable, 0);
  assert.ok(calcNegative.carriedForwardOut > 0);
});

test('Phase 8: WhatsApp formatting normalizes Egyptian phone numbers and builds wa.me URL', () => {
  assert.equal(toWhatsAppPhone('01002349871'), '201002349871');
  assert.equal(toWhatsAppPhone('+201002349871'), '201002349871');

  const url = buildWhatsAppUrl('01002349871', 'مرحباً بكم في سنتر حامد البيلي');
  assert.ok(url.startsWith('https://wa.me/201002349871?text='));

  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  const repos = createRepositories(adapter);
  const student = repos.students.list()[0];
  const invoice = repos.invoices.list()[0];

  const group = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة 3ث',
    subject: 'لغة فرنسية',
    teacherId: 't-mohamed',
    stage: 'الصف الثالث الثانوي',
    days: ['السبت'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1',
    roomId: 'r1',
    capacity: 30,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  });
  const session = repos.sessions.create({
    centerId: DEFAULT_CENTER_ID,
    groupId: group.id,
    teacherId: 't-mohamed',
    date: '2026-11-16',
    timeLabel: '16:00',
    roomId: 'r1',
    type: 'regular',
    status: 'recorded',
    entries: [{ studentId: student.id, status: 'absent' }],
  });
  const payment = repos.payments.create({
    centerId: DEFAULT_CENTER_ID,
    receiptNumber: 'RCP-202611-001',
    invoiceId: invoice.id,
    studentId: student.id,
    groupId: group.id,
    amount: 400,
    remainingAfter: 0,
    method: 'نقدي',
    date: '2026-11-16',
    recordedBy: 'مسيو حامد البيلي',
  });

  const absMsg = buildAbsenceMessage('تغيب {اسم_الطالب} عن {المجموعة} بتاريخ {التاريخ}', {
    student,
    group,
    session,
  });
  assert.ok(absMsg.includes(student.name));

  const lateMsg = buildLatePaymentMessage('مستحق {المبلغ} ج للطالب {اسم_الطالب}', {
    student,
    group,
    invoice,
  });
  assert.ok(lateMsg.includes(student.name));

  const recMsg = buildReceiptMessage({
    centerName: 'سنتر حامد البيلي',
    student,
    group,
    payment,
  });
  assert.ok(recMsg.includes(payment.receiptNumber));
});

test('Phase 9: QR encoding/parsing & image data URL generation work deterministically', async () => {
  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  const repos = createRepositories(adapter);
  const students = repos.students.list();
  const target = students[0];

  const payload = encodeStudentQrPayload(target);
  assert.ok(payload.startsWith('EDUFLOW:STUDENT:'));

  const parsedFromPayload = parseStudentQrPayload(payload, students);
  assert.equal(parsedFromPayload?.id, target.id);

  const parsedFromCode = parseStudentQrPayload(target.code, students);
  assert.equal(parsedFromCode?.id, target.id);

  const dataUrl = await generateQrDataUrl(payload);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
});

test('Phase 10: Biometric face matching enforces parent consent and owner-only settings toggle', async () => {
  const adapter = new LocalStorageAdapter({ storage: new MemStorage(), debounceMs: 0 });
  setActivePermissionActor({ userId: 'u-hamed', role: UserRole.OWNER, centerId: DEFAULT_CENTER_ID });
  const repos = createRepositories(adapter, {
    getActor: getActivePermissionActor,
    enforcePermissions: true,
  });
  const student = repos.students.list()[0];
  const signature = `face:${student.code}`;
  const hash = await createDeterministicFaceHash(signature);

  // Without consent -> blocked
  const noConsent = verifyFaceAttendanceMatch({
    student,
    consents: [],
    faceTemplates: [
      {
        id: 'ft-1',
        centerId: DEFAULT_CENTER_ID,
        studentId: student.id,
        descriptorHash: hash,
        enrolledAt: new Date().toISOString(),
        enrolledBy: 'test',
        status: 'active',
      },
    ],
    capturedHash: hash,
  });
  assert.equal(noConsent.matched, false);

  // With active consent + matching hash -> matched >= 95%
  const matched = verifyFaceAttendanceMatch({
    student,
    consents: [
      {
        id: 'c-1',
        centerId: DEFAULT_CENTER_ID,
        studentId: student.id,
        parentPhone: student.parentPhone,
        type: 'biometric_face',
        granted: true,
        grantedAt: new Date().toISOString(),
        capturedBy: 'u-hamed',
      },
    ],
    faceTemplates: [
      {
        id: 'ft-1',
        centerId: DEFAULT_CENTER_ID,
        studentId: student.id,
        descriptorHash: hash,
        enrolledAt: new Date().toISOString(),
        enrolledBy: 'test',
        status: 'active',
      },
    ],
    capturedHash: hash,
  });
  assert.equal(matched.matched, true);
  assert.ok(matched.confidence >= 95);

  // Repository guard: Admin cannot flip biometricFaceEnabled, Owner can
  const prevSettings = repos.meta.getCenterSettings();
  setActivePermissionActor({
    userId: 'u-salma',
    role: UserRole.ADMIN,
    centerId: DEFAULT_CENTER_ID,
  });
  assert.throws(
    () =>
      repos.meta.setCenterSettings({
        ...prevSettings,
        biometricFaceEnabled: !prevSettings.biometricFaceEnabled,
      }),
    PermissionError
  );

  setActivePermissionActor({
    userId: 'u-hamed',
    role: UserRole.OWNER,
    centerId: DEFAULT_CENTER_ID,
  });
  repos.meta.setCenterSettings({
    ...prevSettings,
    biometricFaceEnabled: true,
  });
  assert.equal(repos.meta.getCenterSettings().biometricFaceEnabled, true);
  setActivePermissionActor(null);
});
