import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendanceHistoryPdf,
  buildFinancialReportPdf,
  buildSessionAttendancePdf,
  buildStudentParentReportPdf,
} from './pdfExportLogic';
import {
  DEFAULT_CENTER_ID,
  INITIAL_ASSESSMENTS,
  INITIAL_CENTER_SETTINGS,
  INITIAL_EXPENSES,
  INITIAL_GROUPS,
  INITIAL_INVOICES,
  INITIAL_PAYMENTS,
  INITIAL_SESSIONS,
  INITIAL_STUDENTS,
  INITIAL_TEACHERS,
} from '../data/seedData';
import { AttendanceSession, Group } from '../types/eduflow';

test('buildFinancialReportPdf computes revenue, expenses, and share summary', () => {
  const payload = buildFinancialReportPdf({
    centerSettings: INITIAL_CENTER_SETTINGS,
    payments: INITIAL_PAYMENTS,
    expenses: INITIAL_EXPENSES,
    invoices: INITIAL_INVOICES,
    groups: INITIAL_GROUPS,
    students: INITIAL_STUDENTS,
    teachers: INITIAL_TEACHERS,
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    groupFilter: 'all',
    focusTab: 'all',
  });

  assert.equal(payload.tables.length, 4);
  assert.ok(payload.title.includes('التقرير المالي'));
  assert.ok(payload.shareText.includes('سنتر حامد البيلي'));
  assert.equal(payload.kpis.length, 4);
});

test('buildAttendanceHistoryPdf filters by student and builds parent greeting', () => {
  const payload = buildAttendanceHistoryPdf({
    centerSettings: INITIAL_CENTER_SETTINGS,
    sessions: INITIAL_SESSIONS,
    groups: INITIAL_GROUPS,
    teachers: INITIAL_TEACHERS,
    students: INITIAL_STUDENTS,
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    groupFilter: 'all',
    studentFilter: 'st-mahmoud',
  });

  assert.equal(payload.tables.length, 2);
  assert.ok(payload.parentGreeting?.includes('محمود ميمي'));
  assert.equal(payload.parentPhone, '');
});

test('buildSessionAttendancePdf summarizes a single session roster', () => {
  const grp: Group = {
    id: 'g-pdf-1',
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة لغة فرنسية',
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
  };
  const session: AttendanceSession = {
    id: 'sess-pdf-1',
    centerId: DEFAULT_CENTER_ID,
    groupId: grp.id,
    teacherId: 't-mohamed',
    date: '2026-11-16',
    timeLabel: '16:00',
    roomId: 'r1',
    type: 'regular',
    status: 'recorded',
    entries: [
      { studentId: 'st-mahmoud', status: 'present' },
      { studentId: 'st-faisal', status: 'late' },
    ],
  };
  const tch = INITIAL_TEACHERS.find((t) => t.id === grp.teacherId);

  const payload = buildSessionAttendancePdf({
    centerSettings: INITIAL_CENTER_SETTINGS,
    session,
    group: grp,
    teacher: tch,
    students: INITIAL_STUDENTS,
  });

  assert.equal(payload.kind, 'attendance_session');
  assert.equal(payload.tables[0].rows.length, session.entries.length);
  assert.ok(payload.shareText.includes('حاضر:'));
});

test('buildStudentParentReportPdf includes attendance, invoices, and assessments', () => {
  const student = INITIAL_STUDENTS[0];
  const payload = buildStudentParentReportPdf({
    centerSettings: INITIAL_CENTER_SETTINGS,
    student,
    groups: INITIAL_GROUPS,
    sessions: INITIAL_SESSIONS,
    invoices: INITIAL_INVOICES,
    assessments: INITIAL_ASSESSMENTS,
  });

  assert.equal(payload.kind, 'student_parent_report');
  assert.equal(payload.tables.length, 3);
  assert.ok(payload.shareText.includes('محمود ميمي'));
});
