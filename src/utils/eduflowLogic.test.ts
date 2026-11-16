import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendanceTrendSeries,
  buildMonthlyRevenueDistribution,
  calculateTeacherShare,
  computeAssessmentSummary,
  computeAttendanceStats,
  computeCenterFinancialOverview,
  computeInvoiceStatus,
  detectGroupConflicts,
  formatEGP,
  getOverdueBucket,
  interpolateTemplate,
  isGroupConflictingAt,
  validateAssessmentScore,
  validatePaymentAmount,
} from './eduflowLogic';
import { AttendanceSession, Group } from '../types/eduflow';
import {
  DEFAULT_CENTER_ID,
  INITIAL_EXPENSES,
  INITIAL_GROUPS,
  INITIAL_INVOICES,
  INITIAL_PAYMENTS,
  INITIAL_SESSIONS,
  INITIAL_SETTLEMENTS,
  INITIAL_STUDENTS,
  INITIAL_TEACHERS,
} from '../data/seedData';

const sampleGroups: Group[] = [
  {
    id: 'g1',
    centerId: DEFAULT_CENTER_ID,
    name: 'لغة فرنسية - ثالثة ثانوي (أ)',
    subject: 'لغة فرنسية',
    teacherId: 't-mohamed',
    stage: 'الصف الثالث الثانوي',
    days: ['السبت', 'الثلاثاء'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1 - الرئيسية',
    roomId: 'r1',
    capacity: 40,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  },
];

test('formatEGP uses Western digits and ج currency suffix', () => {
  assert.equal(formatEGP(2800), '2,800 ج');
  assert.equal(formatEGP(400), '400 ج');
});

test('detectGroupConflicts and isGroupConflictingAt isolate exact day and hour overlaps', () => {
  const roomConflict = detectGroupConflicts(
    {
      teacherId: 't-ahmed',
      roomId: 'r1',
      days: ['السبت', 'الأربعاء'],
      startTime: '17:00',
      endTime: '19:00',
    },
    sampleGroups
  );
  assert.equal(roomConflict.length, 1);
  assert.equal(roomConflict[0].reason, 'room');
  assert.equal(roomConflict[0].day, 'السبت');

  const tuesdayExtra: Group = {
    id: 'g7',
    centerId: DEFAULT_CENTER_ID,
    name: 'مراجعة نهائية',
    subject: 'لغة فرنسية',
    teacherId: 't-fares',
    stage: 'الصف الثالث الثانوي',
    days: ['الثلاثاء'],
    startTime: '17:00',
    endTime: '19:00',
    room: 'قاعة 1 - الرئيسية',
    roomId: 'r1',
    capacity: 40,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  };
  const all = [...sampleGroups, tuesdayExtra];
  // Saturday has NO conflict for g1
  assert.equal(isGroupConflictingAt(sampleGroups[0], 'السبت', all, 16), false);
  assert.equal(isGroupConflictingAt(sampleGroups[0], 'السبت', all, 17), false);
  // Tuesday 16:00 has no overlap yet, Tuesday 17:00 overlaps!
  assert.equal(isGroupConflictingAt(sampleGroups[0], 'الثلاثاء', all, 16), false);
  assert.equal(isGroupConflictingAt(sampleGroups[0], 'الثلاثاء', all, 17), true);
});

test('validatePaymentAmount enforces positive amount and remaining balance ceiling', () => {
  assert.equal(validatePaymentAmount(0, 400).valid, false);
  assert.equal(validatePaymentAmount(500, 400).valid, false);
  const partial = validatePaymentAmount(250, 400);
  assert.equal(partial.valid, true);
  assert.equal(partial.remainingAfter, 150);
});

test('computeInvoiceStatus and getOverdueBucket classify invoices properly', () => {
  assert.equal(computeInvoiceStatus(400, 400, 10), 'paid');
  assert.equal(computeInvoiceStatus(400, 200, 5), 'overdue');
  assert.equal(computeInvoiceStatus(400, 200, 0), 'partial');
  assert.equal(computeInvoiceStatus(400, 0, 0), 'pending');

  assert.equal(getOverdueBucket(0), null);
  assert.equal(getOverdueBucket(5), '1-7');
  assert.equal(getOverdueBucket(18), '8-30');
  assert.equal(getOverdueBucket(42), '30+');
});

test('computeAttendanceStats tallies all four attendance states', () => {
  const stats = computeAttendanceStats([
    { studentId: 'st-mahmoud', status: 'present' },
    { studentId: 'st-faisal', status: 'present' },
    { studentId: 's3', status: 'late' },
    { studentId: 's4', status: 'absent' },
    { studentId: 's5', status: 'unrecorded' },
  ]);
  assert.deepEqual(stats, {
    present: 2,
    late: 1,
    absent: 1,
    unrecorded: 1,
    total: 5,
  });
});

test('calculateTeacherShare handles per_session, percentage, and fixed_rent modes', () => {
  assert.deepEqual(calculateTeacherShare(800, 'per_session', 200, 2), {
    teacherShare: 400,
    centerShare: 400,
  });
  assert.deepEqual(calculateTeacherShare(10000, 'percentage', 70), {
    teacherShare: 7000,
    centerShare: 3000,
  });
  assert.deepEqual(calculateTeacherShare(10000, 'fixed_rent', 2500), {
    teacherShare: 7500,
    centerShare: 2500,
  });
});

test('validateAssessmentScore and computeAssessmentSummary compute grades accurately', () => {
  assert.equal(validateAssessmentScore(55, 50, false).valid, false);
  assert.equal(validateAssessmentScore(48, 50, false).valid, true);

  const summary = computeAssessmentSummary(
    [
      { studentId: 's1', score: 45, absent: false },
      { studentId: 's2', score: 35, absent: false },
      { studentId: 's3', score: 20, absent: false },
      { studentId: 's4', score: null, absent: true },
    ],
    50
  );
  assert.equal(summary.gradedCount, 3);
  assert.equal(summary.absentCount, 1);
  assert.equal(summary.highest, 45);
  assert.equal(summary.lowest, 20);
  assert.equal(summary.average, 33.3);
});

test('interpolateTemplate substitutes Arabic variables cleanly', () => {
  const msg = interpolateTemplate(
    'ولي أمر الطالب {اسم_الطالب}، نود إبلاغكم بغيابه اليوم {التاريخ} في مجموعة {المجموعة}.',
    {
      اسم_الطالب: 'محمود ميمي',
      التاريخ: '16/11/2026',
      المجموعة: 'لغة فرنسية 3ث',
    }
  );
  assert.equal(
    msg,
    'ولي أمر الطالب محمود ميمي، نود إبلاغكم بغيابه اليوم 16/11/2026 في مجموعة لغة فرنسية 3ث.'
  );
});

test('buildAttendanceTrendSeries returns [] when empty and orders recorded sessions chronologically', () => {
  assert.deepEqual(buildAttendanceTrendSeries(INITIAL_SESSIONS), []);

  const fixtureSessions: AttendanceSession[] = [
    {
      id: 'sess-2',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'g1',
      date: '2026-11-16',
      timeLabel: '16:00',
      roomId: 'r1',
      type: 'regular',
      status: 'recorded',
      entries: [
        { studentId: 'st-mahmoud', status: 'present' },
        { studentId: 'st-faisal', status: 'absent' },
      ],
    },
    {
      id: 'sess-1',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'g1',
      date: '2026-11-12',
      timeLabel: '16:00',
      roomId: 'r1',
      type: 'regular',
      status: 'recorded',
      entries: [
        { studentId: 'st-mahmoud', status: 'present' },
        { studentId: 'st-faisal', status: 'present' },
      ],
    },
    {
      id: 'sess-cancelled',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'g1',
      date: '2026-11-18',
      timeLabel: '16:00',
      roomId: 'r1',
      type: 'regular',
      status: 'cancelled',
      entries: [{ studentId: 'st-mahmoud', status: 'absent' }],
    },
  ];
  const series = buildAttendanceTrendSeries(fixtureSessions);
  assert.equal(series.length, 2);
  assert.equal(series[0].date, '2026-11-12');
  assert.equal(series[0].attendanceRate, 100);
  assert.equal(series[1].date, '2026-11-16');
  assert.equal(series[1].attendanceRate, 50);
});

test('buildMonthlyRevenueDistribution reflects general invoices on initial seed and multi-subject groups', () => {
  const initialSlices = buildMonthlyRevenueDistribution(
    INITIAL_GROUPS,
    INITIAL_STUDENTS,
    INITIAL_INVOICES,
    INITIAL_PAYMENTS
  );
  assert.equal(initialSlices.length, 1);
  assert.equal(initialSlices[0].subject, 'رسوم شهرية عامة');
  assert.equal(initialSlices[0].amount, 800);
  assert.equal(initialSlices[0].percentage, 100);
});

test('computeCenterFinancialOverview matches all 8 سنتر حامد البيلي initial metrics accurately', () => {
  const overview = computeCenterFinancialOverview({
    students: INITIAL_STUDENTS,
    teachers: INITIAL_TEACHERS,
    groups: INITIAL_GROUPS,
    sessions: INITIAL_SESSIONS,
    invoices: INITIAL_INVOICES,
    payments: INITIAL_PAYMENTS,
    expenses: INITIAL_EXPENSES,
    settlements: INITIAL_SETTLEMENTS,
  });

  // 1. الإيراد الشهري المتوقع = 800 ج (2 × 400 ج)
  assert.equal(overview.expectedStudentRevenue, 800);
  // 2. المحصّل الفعلي = 0 ج
  assert.equal(overview.collectedRevenue, 0);
  // 3. المتبقي لدى الطلاب = 800 ج
  assert.equal(overview.outstandingReceivables, 800);
  // 4. الحصص المكتملة = 0
  assert.equal(overview.completedSessionsCount, 0);
  // 5. مستحقات كل مدرس = 0 ج
  assert.equal(overview.teacherBreakdowns.length, 3);
  for (const tb of overview.teacherBreakdowns) {
    assert.equal(tb.ratePerSession, 200);
    assert.equal(tb.completedSessionsCount, 0);
    assert.equal(tb.accruedCompensation, 0);
  }
  // 6. إجمالي تعويضات المدرسين = 0 ج
  assert.equal(overview.totalTeacherCompensation, 0);
  // 7. المصروفات = 0 ج
  assert.equal(overview.totalExpenses, 0);
  // 8. صافي النتيجة التشغيلية (المحصّل مقابل التقديري)
  assert.equal(overview.netCollectedOperatingResult, 0);
  assert.equal(overview.estimatedOperatingResult, 800);
});

test('computeCenterFinancialOverview dynamically credits strictly status==="recorded" sessions, payments, and expenses', () => {
  const dynSessions: AttendanceSession[] = [
    {
      id: 's-rec-1',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'general',
      teacherId: 't-mohamed',
      date: '2026-11-16',
      timeLabel: '16:00',
      roomId: 'r1',
      type: 'regular',
      status: 'recorded',
      entries: [],
    },
    {
      id: 's-rec-2',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'general',
      teacherId: 't-ahmed',
      date: '2026-11-17',
      timeLabel: '18:00',
      roomId: 'r1',
      type: 'regular',
      status: 'recorded',
      entries: [],
    },
    {
      id: 's-cancel',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'general',
      teacherId: 't-fares',
      date: '2026-11-18',
      timeLabel: '18:00',
      roomId: 'r1',
      type: 'regular',
      status: 'cancelled',
      entries: [],
    },
    {
      id: 's-pending',
      centerId: DEFAULT_CENTER_ID,
      groupId: 'general',
      teacherId: 't-fares',
      date: '2026-11-19',
      timeLabel: '18:00',
      roomId: 'r1',
      type: 'regular',
      status: 'pending',
      entries: [],
    },
  ];

  const dynOverview = computeCenterFinancialOverview({
    students: INITIAL_STUDENTS,
    teachers: INITIAL_TEACHERS,
    groups: INITIAL_GROUPS,
    sessions: dynSessions,
    invoices: [{ ...INITIAL_INVOICES[0], paid: 400, status: 'paid' }, INITIAL_INVOICES[1]],
    payments: [
      {
        id: 'pay-1',
        centerId: DEFAULT_CENTER_ID,
        receiptNumber: 'RCP-1',
        invoiceId: 'inv-101',
        studentId: 'st-mahmoud',
        groupId: 'general',
        amount: 400,
        remainingAfter: 0,
        method: 'نقدي',
        date: '2026-11-16',
        recordedBy: 'مصطفى الفقي',
      },
    ],
    expenses: [
      {
        id: 'exp-1',
        centerId: DEFAULT_CENTER_ID,
        date: '2026-11-16',
        category: 'مستلزمات',
        description: 'ملازم',
        amount: 150,
        addedBy: 'مصطفى الفقي',
      },
    ],
    settlements: INITIAL_SETTLEMENTS,
  });

  assert.equal(dynOverview.expectedStudentRevenue, 800);
  assert.equal(dynOverview.collectedRevenue, 400);
  assert.equal(dynOverview.outstandingReceivables, 400);
  assert.equal(dynOverview.completedSessionsCount, 2);
  assert.equal(dynOverview.teacherBreakdowns.find((b) => b.teacherId === 't-mohamed')?.accruedCompensation, 200);
  assert.equal(dynOverview.teacherBreakdowns.find((b) => b.teacherId === 't-ahmed')?.accruedCompensation, 200);
  assert.equal(dynOverview.teacherBreakdowns.find((b) => b.teacherId === 't-fares')?.accruedCompensation, 0);
  assert.equal(dynOverview.totalTeacherCompensation, 400);
  assert.equal(dynOverview.totalExpenses, 150);
  // Estimated: 800 - 400 - 150 = 250; Collected net (with 0 settlements paid out yet): 400 - 0 - 150 = 250
  assert.equal(dynOverview.estimatedOperatingResult, 250);
  assert.equal(dynOverview.netCollectedOperatingResult, 250);
});
