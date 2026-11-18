import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlatformAuditCsv,
  computeCenterCapacityUsage,
  computeNextPeriodEndIso,
  computePlatformRevenueMetrics,
  computeTrialDaysRemaining,
  computeTrialEndDateIso,
  filterPlatformAuditLogs,
  validatePlatformSettingsPatch,
  validateSaasPlanDraft,
} from './platformService';
import { LocalStorageAdapter, StorageLike } from '../../data/localStorageAdapter';
import { createRepositories, getActivePermissionActor } from '../../data/repositories';
import { DEFAULT_CENTER_ID, PLATFORM_CENTER_ID } from '../../data/seedData';
import { AuthService } from '../auth/authService';
import { can, canAccessScreen, getDefaultHomeScreen, PermissionActor, PermissionError } from '../../permissions/permissions';
import { ScreenId, UserRole } from '../../types/eduflow';

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

test('Free Trial date math and subscription period calculations work accurately', () => {
  assert.equal(computeTrialEndDateIso('2026-11-01T00:00:00.000Z', 14), '2026-11-15');
  assert.equal(computeNextPeriodEndIso('2026-11-01', 'monthly'), '2026-12-01');
  assert.equal(computeNextPeriodEndIso('2026-11-01', 'annual'), '2027-11-01');

  const nowMs = Date.parse('2026-11-10T10:00:00.000Z');
  assert.equal(computeTrialDaysRemaining('2026-11-15', nowMs), 6);
  assert.equal(computeTrialDaysRemaining('2026-11-01', nowMs), 0);
});

test('computePlatformRevenueMetrics tallies MRR, ARR, collected revenue, overdue dues, and center statuses', () => {
  const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
  const metrics = computePlatformRevenueMetrics({
    nowMs,
    centers: [
      {
        id: 'c1',
        name: 'سنتر 1',
        governorate: 'القاهرة',
        city: 'القاهرة',
        address: '',
        phone: '',
        stages: [],
        currentPlanId: 'pro',
        status: 'active',
        createdAt: '2026-11-01',
      },
      {
        id: 'c2',
        name: 'سنتر 2',
        governorate: 'الجيزة',
        city: 'الدقي',
        address: '',
        phone: '',
        stages: [],
        currentPlanId: 'basic',
        status: 'trial',
        createdAt: '2026-11-10',
      },
      {
        id: 'c3',
        name: 'سنتر 3',
        governorate: 'الإسكندرية',
        city: 'سموحة',
        address: '',
        phone: '',
        stages: [],
        currentPlanId: 'enterprise',
        status: 'suspended',
        createdAt: '2026-10-01',
      },
    ],
    subscriptions: [
      {
        id: 'sub1',
        centerId: 'c1',
        centerName: 'سنتر 1',
        planId: 'pro',
        planName: 'الاحترافية',
        status: 'active',
        billingCycle: 'monthly',
        monthlyAmount: 2800,
        currentPeriodStart: '2026-11-01',
        currentPeriodEnd: '2026-11-20',
        nextBillingDate: '2026-11-20',
        autoRenew: true,
        overdueAmount: 0,
        updatedAt: '2026-11-01',
      },
      {
        id: 'sub2',
        centerId: 'c2',
        centerName: 'سنتر 2',
        planId: 'basic',
        planName: 'الأساسية',
        status: 'trial',
        billingCycle: 'monthly',
        monthlyAmount: 1500,
        trialEndsAt: '2026-11-24',
        currentPeriodStart: '2026-11-10',
        currentPeriodEnd: '2026-11-24',
        nextBillingDate: '2026-11-24',
        autoRenew: true,
        overdueAmount: 0,
        updatedAt: '2026-11-10',
      },
      {
        id: 'sub3',
        centerId: 'c3',
        centerName: 'سنتر 3',
        planId: 'enterprise',
        planName: 'المتكاملة',
        status: 'overdue',
        billingCycle: 'monthly',
        monthlyAmount: 4800,
        currentPeriodStart: '2026-10-01',
        currentPeriodEnd: '2026-11-01',
        nextBillingDate: '2026-11-01',
        autoRenew: true,
        overdueAmount: 4800,
        updatedAt: '2026-11-05',
      },
    ],
    payments: [
      {
        id: 'p1',
        centerId: 'c1',
        centerName: 'سنتر 1',
        subscriptionId: 'sub1',
        receiptNo: 'SAAS-1',
        planId: 'pro',
        planName: 'الاحترافية',
        billingCycle: 'monthly',
        amount: 2800,
        method: 'إنستاباي',
        status: 'paid',
        paidAt: '2026-11-01',
        periodLabel: 'نوفمبر 2026',
        recordedBy: 'مدير المنصة',
      },
      {
        id: 'p2',
        centerId: 'c3',
        centerName: 'سنتر 3',
        subscriptionId: 'sub3',
        receiptNo: 'SAAS-2',
        planId: 'enterprise',
        planName: 'المتكاملة',
        billingCycle: 'monthly',
        amount: 4800,
        method: 'تحويل بنكي',
        status: 'paid',
        paidAt: '2026-10-02',
        periodLabel: 'أكتوبر 2026',
        recordedBy: 'مدير المنصة',
      },
    ],
  });

  assert.equal(metrics.totalCenters, 3);
  assert.equal(metrics.activeCenters, 1);
  assert.equal(metrics.trialCenters, 1);
  assert.equal(metrics.suspendedCenters, 1);
  assert.equal(metrics.mrr, 2800);
  assert.equal(metrics.arr, 33600);
  assert.equal(metrics.collectedRevenueTotal, 7600);
  assert.equal(metrics.collectedThisMonth, 2800);
  assert.equal(metrics.overdueDuesTotal, 4800);
  assert.equal(metrics.renewingSoonCount, 1);
});

test('Center capacity check, audit log filtering, CSV export, and plan validations work cleanly', () => {
  const cap = computeCenterCapacityUsage({
    studentsUsed: 140,
    usersUsed: 4,
    groupsUsed: 10,
    plan: { maxStudents: 150, maxUsers: 5, maxGroups: 12 },
  });
  assert.equal(cap.nearLimit, true);
  assert.equal(cap.overLimit, false);

  const logs = [
    {
      id: 'l1',
      centerId: DEFAULT_CENTER_ID,
      actorId: 'u-hamed',
      actorName: 'مسيو حامد البيلي',
      actorRole: UserRole.OWNER,
      action: 'student.create',
      resource: 'students',
      summary: 'إضافة طالب جديد',
      timestamp: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'l2',
      centerId: PLATFORM_CENTER_ID,
      actorId: 'u-superadmin',
      actorName: 'مدير منصة EDUFLOW',
      actorRole: UserRole.SUPER_ADMIN,
      action: 'platform.center_suspend',
      resource: 'centers',
      summary: 'تعليق حساب سنتر اختباري',
      timestamp: '2026-11-16T11:00:00.000Z',
    },
  ];

  const filtered = filterPlatformAuditLogs(logs, {
    centerId: PLATFORM_CENTER_ID,
    actionPrefix: 'platform.',
    search: 'تعليق',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'l2');

  const csv = buildPlatformAuditCsv(filtered, new Map([[DEFAULT_CENTER_ID, 'سنتر حامد البيلي']]));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /المنصة بالكامل/);

  assert.equal(validateSaasPlanDraft({ name: '', monthlyPrice: 100, maxStudents: 50, maxUsers: 3, maxGroups: 5 }).ok, false);
  assert.equal(validatePlatformSettingsPatch({ defaultTrialDays: 0 }).ok, false);
  assert.equal(validatePlatformSettingsPatch({ defaultTrialDays: 14, productName: 'EDUFLOW' }).ok, true);
});

test('Super Admin RBAC, multi-center tenant isolation, and suspended center login blocking', async () => {
  const storage = new MockStorage();
  const adapter = new LocalStorageAdapter({ storage, debounceMs: 0 });
  let actor: PermissionActor | null = null;
  const repos = createRepositories(adapter, {
    getActor: () => {
      const sys = getActivePermissionActor();
      return sys?.role === 'system' ? sys : actor;
    },
    enforcePermissions: true,
  });
  const auth = new AuthService(repos);

  // 1) Super Admin can log in with seeded salted hash credential
  const loginRes = await auth.loginWithCredentials('superadmin@eduflow.eg', 'Super3571', 1_720_000_000_000);
  assert.equal(loginRes.ok, true);
  assert.equal(loginRes.session?.role, UserRole.SUPER_ADMIN);

  const superActor: PermissionActor = {
    userId: 'u-superadmin',
    role: UserRole.SUPER_ADMIN,
    centerId: PLATFORM_CENTER_ID,
  };
  const ownerActor: PermissionActor = {
    userId: 'u-hamed',
    role: UserRole.OWNER,
    centerId: DEFAULT_CENTER_ID,
  };

  // Screen & permission boundaries
  assert.equal(getDefaultHomeScreen(superActor), ScreenId.SUPER_ADMIN);
  assert.equal(canAccessScreen(superActor, ScreenId.SUPER_ADMIN), true);
  assert.equal(canAccessScreen(ownerActor, ScreenId.SUPER_ADMIN), false);
  assert.equal(can(ownerActor, 'update', 'saasPlans'), false);
  assert.equal(can(ownerActor, 'update', 'platformSettings'), false);

  // Owner cannot mutate platform settings or saasPlans via repositories
  actor = ownerActor;
  assert.throws(
    () =>
      repos.meta.setPlatformSettings({
        ...repos.meta.getPlatformSettings(),
        defaultTrialDays: 99,
      }),
    PermissionError
  );

  // Super Admin creates a second center & suspends it; non-Super-Admin owner is isolated and suspended center cannot log in
  actor = superActor;
  const c2 = repos.centers.create({
    id: 'center-test-2',
    name: 'سنتر الاختبار الثاني',
    governorate: 'الجيزة',
    city: 'الدقي',
    address: '',
    phone: '01012345678',
    stages: ['الصف الثالث الثانوي'],
    currentPlanId: 'basic',
    status: 'suspended',
    createdAt: '2026-11-16T00:00:00.000Z',
  });
  assert.equal(repos.centers.list().length, 2);

  // Multi-tenant isolation: owner of center-hamed-elbailey sees ONLY own center
  actor = ownerActor;
  assert.equal(repos.centers.list().length, 1);
  assert.equal(repos.centers.list()[0].id, DEFAULT_CENTER_ID);

  // User in suspended center is blocked from login
  actor = superActor;
  repos.users.create({
    centerId: c2.id,
    name: 'مالك سنتر معلق',
    email: 'suspended@center2.demo',
    phone: '01055556666',
    role: UserRole.OWNER,
    status: 'active',
    salt: 'hamed-elbailey-salt-owner-u1',
    passwordHash: '1da82d7deb7c363f56f3acaf7d4b2e779e163b02c6397ef40f3e5ef3fac4e2b0',
    failedAttempts: 0,
  });

  const blockedLogin = await auth.loginWithCredentials('suspended@center2.demo', 'Hamed3571', 1_720_000_010_000);
  assert.equal(blockedLogin.ok, false);
  assert.match(blockedLogin.error || '', /إيقاف حساب السنتر/);
});
