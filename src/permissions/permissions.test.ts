import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageAdapter, StorageLike } from '../data/localStorageAdapter';
import { createRepositories } from '../data/repositories';
import { DEFAULT_CENTER_ID } from '../data/seedData';
import {
  can,
  canAccessScreen,
  getDefaultHomeScreen,
  normalizePhoneDigits,
  PermissionActor,
  PermissionError,
} from './permissions';
import { ScreenId, UserRole } from '../types/eduflow';

class MockStorage implements StorageLike {
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

const ownerActor: PermissionActor = {
  userId: 'u-hamed',
  role: UserRole.OWNER,
  centerId: DEFAULT_CENTER_ID,
};

const adminActor: PermissionActor = {
  userId: 'u-salma',
  role: UserRole.ADMIN,
  centerId: DEFAULT_CENTER_ID,
};

const accountantActor: PermissionActor = {
  userId: 'u-mostafa',
  role: UserRole.ACCOUNTANT,
  centerId: DEFAULT_CENTER_ID,
};

const receptionistActor: PermissionActor = {
  userId: 'u-rec-test',
  role: UserRole.RECEPTIONIST,
  centerId: DEFAULT_CENTER_ID,
};

const teacherActor: PermissionActor = {
  userId: 'u-mohamed',
  role: UserRole.TEACHER,
  centerId: DEFAULT_CENTER_ID,
  teacherId: 't-mohamed',
};

const mimiParentActor: PermissionActor = {
  userId: 'u-mimi',
  role: UserRole.PARENT,
  centerId: DEFAULT_CENTER_ID,
  guardianId: 'g-mimi',
};

const ibrahimParentActor: PermissionActor = {
  userId: 'u-ibrahim',
  role: UserRole.PARENT,
  centerId: DEFAULT_CENTER_ID,
  guardianId: 'g-ibrahim',
};

test('Permission matrix: Owner & Admin boundaries', () => {
  // Owner has full access
  assert.equal(can(ownerActor, 'change_plan', 'subscription'), true);
  assert.equal(can(ownerActor, 'delete_center', 'centers'), true);
  assert.equal(can(ownerActor, 'enable_biometrics', 'biometrics'), true);
  assert.equal(can(ownerActor, 'manage_owners', 'users'), true);

  // Admin: full operational control EXCEPT plan change, delete center, enable biometrics, managing owners
  assert.equal(can(adminActor, 'create', 'students'), true);
  assert.equal(can(adminActor, 'settle', 'settlements'), true);
  assert.equal(can(adminActor, 'update', 'settings'), true);
  assert.equal(can(adminActor, 'view', 'subscription'), true);

  assert.equal(can(adminActor, 'change_plan', 'subscription'), false);
  assert.equal(can(adminActor, 'delete_center', 'centers'), false);
  assert.equal(can(adminActor, 'enable_biometrics', 'biometrics'), false);
  assert.equal(can(adminActor, 'manage_owners', 'users'), false);
  assert.equal(
    can(adminActor, 'update', 'users', { targetUserRole: UserRole.OWNER }),
    false
  );
  assert.equal(
    can(adminActor, 'update', 'users', { targetUserRole: UserRole.RECEPTIONIST }),
    true
  );
});

test('Permission matrix: Accountant, Receptionist, Teacher, and Parent', () => {
  // Accountant: finance + exports; view-only on students/teachers/groups; templates & account only in settings
  assert.equal(can(accountantActor, 'create', 'invoices'), true);
  assert.equal(can(accountantActor, 'create', 'expenses'), true);
  assert.equal(can(accountantActor, 'settle', 'settlements'), true);
  assert.equal(can(accountantActor, 'export', 'financialReports'), true);
  assert.equal(can(accountantActor, 'view', 'students'), true);
  assert.equal(can(accountantActor, 'create', 'students'), false);
  assert.equal(can(accountantActor, 'update', 'students'), false);
  assert.equal(can(accountantActor, 'take_attendance', 'sessions'), false);
  assert.equal(can(accountantActor, 'update', 'messageTemplates'), true);
  assert.equal(can(accountantActor, 'update', 'settings'), false);
  assert.equal(can(accountantActor, 'view', 'settings', { settingTab: 'templates' }), true);
  assert.equal(can(accountantActor, 'view', 'settings', { settingTab: 'center' }), false);

  // Receptionist: students, attendance, create payments, print receipts, WhatsApp; blocked from editing/deleting payments, expenses, discounts, reports
  assert.equal(can(receptionistActor, 'create', 'students'), true);
  assert.equal(can(receptionistActor, 'take_attendance', 'sessions'), true);
  assert.equal(can(receptionistActor, 'create', 'payments'), true);
  assert.equal(can(receptionistActor, 'print', 'payments'), true);
  assert.equal(can(receptionistActor, 'send_whatsapp', 'messages'), true);
  assert.equal(can(receptionistActor, 'update', 'payments'), false);
  assert.equal(can(receptionistActor, 'delete', 'payments'), false);
  assert.equal(can(receptionistActor, 'view', 'expenses'), false);
  assert.equal(can(receptionistActor, 'create', 'expenses'), false);
  assert.equal(can(receptionistActor, 'create', 'discounts'), false);
  assert.equal(can(receptionistActor, 'view', 'financialReports'), false);
  assert.equal(can(receptionistActor, 'view', 'settlements'), false);

  // Teacher: scoped to own teacherId / groups
  const sampleGroups = [
    { id: 'g-moh', teacherId: 't-mohamed' },
    { id: 'g-ahm', teacherId: 't-ahmed' },
  ];
  assert.equal(
    can(teacherActor, 'take_attendance', 'sessions', { groupId: 'g-moh', groups: sampleGroups }),
    true
  );
  assert.equal(
    can(teacherActor, 'take_attendance', 'sessions', { groupId: 'g-ahm', groups: sampleGroups }),
    false
  );
  assert.equal(
    can(teacherActor, 'enter_assessments', 'assessments', { groupId: 'g-moh', groups: sampleGroups }),
    true
  );
  assert.equal(
    can(teacherActor, 'enter_assessments', 'assessments', { groupId: 'g-ahm', groups: sampleGroups }),
    false
  );
  assert.equal(can(teacherActor, 'view', 'teacherShares', { teacherId: 't-mohamed' }), true);
  assert.equal(can(teacherActor, 'view', 'teacherShares', { teacherId: 't-ahmed' }), false);
  assert.equal(can(teacherActor, 'view', 'expenses'), false);
  assert.equal(can(teacherActor, 'view', 'invoices'), false);

  // Parent: parentPortal only + own linked student scoping
  assert.equal(normalizePhoneDigits('+20 100-234-9871'), '01002349871');
  assert.equal(can(mimiParentActor, 'view', 'parentPortal'), true);
  assert.equal(
    can(mimiParentActor, 'view', 'students', { studentId: 'st-mahmoud', guardianIds: ['g-mimi'] }),
    true
  );
  assert.equal(
    can(mimiParentActor, 'view', 'students', { studentId: 'st-faisal', guardianIds: ['g-ibrahim'] }),
    false
  );
  assert.equal(can(mimiParentActor, 'create', 'students'), false);
  assert.equal(can(mimiParentActor, 'view', 'expenses'), false);
});

test('Screen guards & default home screen by role', () => {
  assert.equal(getDefaultHomeScreen(ownerActor), ScreenId.DASHBOARD);
  assert.equal(getDefaultHomeScreen(mimiParentActor), ScreenId.PARENT_PORTAL);
  assert.equal(getDefaultHomeScreen(null), ScreenId.LOGIN);

  assert.equal(canAccessScreen(mimiParentActor, ScreenId.DASHBOARD), false);
  assert.equal(canAccessScreen(mimiParentActor, ScreenId.STUDENTS), false);
  assert.equal(canAccessScreen(mimiParentActor, ScreenId.PARENT_PORTAL), true);

  assert.equal(canAccessScreen(receptionistActor, ScreenId.PAYMENTS), true);
  assert.equal(canAccessScreen(receptionistActor, ScreenId.EXPENSES), false);
  assert.equal(canAccessScreen(receptionistActor, ScreenId.REPORTS), false);
  assert.equal(canAccessScreen(receptionistActor, ScreenId.SETTINGS), false);

  assert.equal(canAccessScreen(accountantActor, ScreenId.SETTINGS), true);
  assert.equal(canAccessScreen(accountantActor, ScreenId.TAKE_ATTENDANCE), false);
  assert.equal(canAccessScreen(accountantActor, ScreenId.SUBSCRIPTION), false);

  assert.equal(canAccessScreen(teacherActor, ScreenId.TEACHERS), false);
  assert.equal(canAccessScreen(teacherActor, ScreenId.TEACHER_PROFILE), true);
  assert.equal(canAccessScreen(teacherActor, ScreenId.PAYMENTS), false);
  assert.equal(canAccessScreen(teacherActor, ScreenId.REPORTS), false);
});

test('Repository-level enforcement throws PermissionError on unauthorized writes across roles', () => {
  const storage = new MockStorage();
  const adapter = new LocalStorageAdapter({ storage, debounceMs: 0 });

  let activeActor: PermissionActor | null = ownerActor;
  const repos = createRepositories(adapter, {
    getActor: () => activeActor,
    enforcePermissions: true,
  });

  // Seed 2 groups so teacher-ownership check can be tested even with clean initial groups
  const gMoh = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة محمد عماد',
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
  const gAhm = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة أحمد جاويش',
    subject: 'لغة فرنسية',
    teacherId: 't-ahmed',
    stage: 'الصف الثالث الثانوي',
    days: ['الأحد'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1',
    roomId: 'r1',
    capacity: 30,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  });
  repos.students.update('st-mahmoud', { groupIds: [gMoh.id] });

  // 1) Receptionist can create payment, CANNOT create expense or update/delete payment
  activeActor = receptionistActor;
  const createdPay = repos.payments.create({
    centerId: DEFAULT_CENTER_ID,
    receiptNumber: 'RCP-TEST-1',
    invoiceId: 'inv-101',
    studentId: 'st-mahmoud',
    groupId: gMoh.id,
    amount: 100,
    remainingAfter: 300,
    method: 'نقدي',
    date: '2026-11-16',
    recordedBy: 'استقبال',
  });
  assert.equal(createdPay.receiptNumber, 'RCP-TEST-1');

  assert.throws(
    () => repos.payments.update(createdPay.id, { amount: 200 }),
    PermissionError
  );
  assert.throws(() => repos.payments.remove(createdPay.id), PermissionError);
  assert.throws(
    () =>
      repos.expenses.create({
        centerId: DEFAULT_CENTER_ID,
        date: '2026-11-16',
        category: 'أخرى',
        description: 'محاولة غير مصرح بها',
        amount: 50,
        addedBy: 'u-rec-test',
      }),
    PermissionError
  );
  assert.throws(
    () =>
      repos.discounts.create({
        centerId: DEFAULT_CENTER_ID,
        studentId: 'st-mahmoud',
        title: 'خصم غير مصرح',
        type: 'fixed',
        value: 50,
        amount: 50,
        createdBy: 'u-rec-test',
        createdAt: new Date().toISOString(),
      }),
    PermissionError
  );

  // 2) Accountant CANNOT create or update students, CANNOT update general settings
  activeActor = accountantActor;
  assert.throws(
    () =>
      repos.students.create({
        centerId: DEFAULT_CENTER_ID,
        code: '',
        fullName: 'طالب غير مصرح',
        name: 'طالب غير مصرح',
        stage: 'الصف الثالث الثانوي',
        parent: { name: 'ولي أمر', phone: '01000000001' },
        parentName: 'ولي أمر',
        parentPhone: '01000000001',
        groupIds: [gMoh.id],
        status: 'active',
        paymentStatus: 'pending',
        lastAttendance: 'لم يحضر بعد',
        attendanceRate: 100,
        notes: [],
        createdAt: new Date().toISOString(),
      }),
    PermissionError
  );
  assert.throws(() => repos.students.update('st-mahmoud', { status: 'inactive' }), PermissionError);
  assert.throws(
    () =>
      repos.meta.setCenterSettings({
        ...repos.meta.getCenterSettings(),
        name: 'تعديل غير مصرح',
      }),
    PermissionError
  );
  // Accountant CAN create expenses & update message templates
  const accExp = repos.expenses.create({
    centerId: DEFAULT_CENTER_ID,
    date: '2026-11-16',
    category: 'مستلزمات',
    description: 'أقلام سبورة',
    amount: 120,
    addedBy: 'u-mostafa',
  });
  assert.equal(accExp.amount, 120);

  // 3) Admin CANNOT change subscription plan or edit Owner user
  activeActor = adminActor;
  assert.throws(
    () =>
      repos.meta.setCenterSettings({
        ...repos.meta.getCenterSettings(),
        currentPlanId: 'enterprise',
      }),
    PermissionError
  );
  assert.throws(() => repos.users.update('u-hamed', { name: 'تعديل المالك' }), PermissionError);
  assert.throws(() => repos.users.update('u-mostafa', { role: UserRole.OWNER }), PermissionError);

  // 4) Teacher CANNOT create assessment for another teacher's group
  activeActor = teacherActor;
  const visibleGroups = repos.groups.list(); // scoped to t-mohamed only
  assert.equal(visibleGroups.length, 1);
  assert.equal(visibleGroups[0].teacherId, 't-mohamed');

  assert.throws(
    () =>
      repos.assessments.create({
        centerId: DEFAULT_CENTER_ID,
        title: 'اختبار غير مصرح',
        type: 'كويز',
        groupId: gAhm.id,
        date: '2026-11-16',
        maxScore: 50,
        status: 'draft',
        grades: [],
      }),
    PermissionError
  );

  // 5) Parent CANNOT write anything
  activeActor = mimiParentActor;
  assert.throws(
    () => repos.students.update('st-mahmoud', { fullName: 'تعديل ولي الأمر' }),
    PermissionError
  );
});

test('Repository-level read scoping isolates Teacher and Guardians (ميمي البنا / إبراهيم إمام) strictly', () => {
  const storage = new MockStorage();
  const adapter = new LocalStorageAdapter({ storage, debounceMs: 0 });

  let activeActor: PermissionActor | null = ownerActor;
  const repos = createRepositories(adapter, {
    getActor: () => activeActor,
    enforcePermissions: true,
  });

  const gMoh = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة 1',
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
  const gAhm = repos.groups.create({
    centerId: DEFAULT_CENTER_ID,
    name: 'مجموعة 2',
    subject: 'لغة فرنسية',
    teacherId: 't-ahmed',
    stage: 'الصف الثالث الثانوي',
    days: ['الأحد'],
    startTime: '16:00',
    endTime: '18:00',
    room: 'قاعة 1',
    roomId: 'r1',
    capacity: 30,
    monthlyPrice: 400,
    startDate: '2026-11-16',
    status: 'active',
  });
  repos.students.update('st-mahmoud', { groupIds: [gMoh.id] });
  repos.students.update('st-faisal', { groupIds: [gAhm.id] });

  // Teacher t-mohamed sees ONLY own groups, own students, own teacher record, NO invoices/expenses
  activeActor = teacherActor;
  const teacherGroups = repos.groups.list();
  assert.equal(teacherGroups.length, 1);
  assert.ok(teacherGroups.every((g) => g.teacherId === 't-mohamed'));

  const teacherStudents = repos.students.list();
  assert.equal(teacherStudents.length, 1);
  assert.equal(teacherStudents[0].id, 'st-mahmoud');

  assert.equal(repos.invoices.list().length, 0);
  assert.equal(repos.payments.list().length, 0);
  assert.equal(repos.expenses.list().length, 0);
  assert.equal(repos.teachers.list().length, 1);
  assert.equal(repos.teachers.get('t-ahmed'), undefined);

  // Guardian 1: ميمي البنا sees ONLY محمود ميمي
  activeActor = mimiParentActor;
  const mimiStudents = repos.students.list();
  assert.equal(mimiStudents.length, 1);
  assert.equal(mimiStudents[0].id, 'st-mahmoud');
  assert.equal(mimiStudents[0].name, 'محمود ميمي');
  assert.equal(repos.students.get('st-faisal'), undefined);
  assert.ok(repos.invoices.list().every((inv) => inv.studentId === 'st-mahmoud'));
  assert.equal(repos.expenses.list().length, 0);
  assert.equal(repos.teachers.list().length, 0);

  // Guardian 2: إبراهيم إمام sees ONLY فيصل إمام
  activeActor = ibrahimParentActor;
  const ibrahimStudents = repos.students.list();
  assert.equal(ibrahimStudents.length, 1);
  assert.equal(ibrahimStudents[0].id, 'st-faisal');
  assert.equal(ibrahimStudents[0].name, 'فيصل إمام');
  assert.equal(repos.students.get('st-mahmoud'), undefined);
  assert.ok(repos.invoices.list().every((inv) => inv.studentId === 'st-faisal'));
});
