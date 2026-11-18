import {
  ActivityLogEntry,
  Center,
  PlatformSettings,
  SaasPaymentRecord,
  SaasPlanConfig,
  SaasSubscriptionRecord,
  UserRole,
} from '../../types/eduflow';
import { buildUtf8BomCsv } from '../export/excelExport';

export interface PlatformRevenueMetrics {
  totalCenters: number;
  activeCenters: number;
  trialCenters: number;
  suspendedCenters: number;
  disabledCenters: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  overdueSubscriptions: number;
  graceSubscriptions: number;
  renewingSoonCount: number;
  mrr: number;
  arr: number;
  collectedRevenueTotal: number;
  collectedThisMonth: number;
  overdueDuesTotal: number;
  pendingPaymentsTotal: number;
}

export interface CenterCapacityStatus {
  studentsUsed: number;
  studentsMax: number;
  studentsPct: number;
  usersUsed: number;
  usersMax: number;
  usersPct: number;
  groupsUsed: number;
  groupsMax: number;
  groupsPct: number;
  nearLimit: boolean;
  overLimit: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTrialEndDateIso(startIso: string, trialDays: number): string {
  const safeDays = Math.max(1, Math.min(365, Math.round(trialDays || 14)));
  const base = new Date(startIso);
  const startMs = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  const end = new Date(startMs + safeDays * MS_PER_DAY);
  return end.toISOString().slice(0, 10);
}

export function computeTrialDaysRemaining(
  trialEndsAtIso?: string,
  nowMs = Date.now()
): number {
  if (!trialEndsAtIso) return 0;
  const parsed = new Date(
    trialEndsAtIso.length === 10 ? `${trialEndsAtIso}T23:59:59.999Z` : trialEndsAtIso
  );
  if (Number.isNaN(parsed.getTime())) return 0;
  const diff = parsed.getTime() - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

export function computeNextPeriodEndIso(
  startIso: string,
  billingCycle: 'monthly' | 'annual'
): string {
  const base = new Date(startIso.length === 10 ? `${startIso}T00:00:00.000Z` : startIso);
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(d.getTime());
  if (billingCycle === 'annual') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

export function computePlatformRevenueMetrics(params: {
  centers: Center[];
  subscriptions: SaasSubscriptionRecord[];
  payments: SaasPaymentRecord[];
  nowMs?: number;
}): PlatformRevenueMetrics {
  const nowMs = params.nowMs ?? Date.now();
  const monthPrefix = new Date(nowMs).toISOString().slice(0, 7);

  let activeCenters = 0;
  let trialCenters = 0;
  let suspendedCenters = 0;
  let disabledCenters = 0;

  for (const c of params.centers) {
    const st = c.status || 'active';
    if (st === 'active') activeCenters += 1;
    else if (st === 'trial') trialCenters += 1;
    else if (st === 'suspended') suspendedCenters += 1;
    else if (st === 'disabled') disabledCenters += 1;
  }

  let activeSubscriptions = 0;
  let trialSubscriptions = 0;
  let overdueSubscriptions = 0;
  let graceSubscriptions = 0;
  let renewingSoonCount = 0;
  let mrr = 0;
  let overdueDuesTotal = 0;

  for (const sub of params.subscriptions) {
    if (sub.status === 'active') {
      activeSubscriptions += 1;
      mrr += sub.monthlyAmount;
    } else if (sub.status === 'trial') {
      trialSubscriptions += 1;
    } else if (sub.status === 'grace_period') {
      graceSubscriptions += 1;
      mrr += sub.monthlyAmount;
    } else if (sub.status === 'overdue') {
      overdueSubscriptions += 1;
    }

    overdueDuesTotal += Math.max(0, sub.overdueAmount || 0);

    if (
      (sub.status === 'active' || sub.status === 'trial' || sub.status === 'grace_period') &&
      sub.nextBillingDate
    ) {
      const daysUntil = computeTrialDaysRemaining(sub.nextBillingDate, nowMs);
      if (daysUntil >= 0 && daysUntil <= 7) {
        renewingSoonCount += 1;
      }
    }
  }

  let collectedRevenueTotal = 0;
  let collectedThisMonth = 0;
  let pendingPaymentsTotal = 0;

  for (const pay of params.payments) {
    if (pay.status === 'paid') {
      collectedRevenueTotal += pay.amount;
      if (pay.paidAt.startsWith(monthPrefix)) {
        collectedThisMonth += pay.amount;
      }
    } else if (pay.status === 'pending') {
      pendingPaymentsTotal += pay.amount;
    }
  }

  return {
    totalCenters: params.centers.length,
    activeCenters,
    trialCenters,
    suspendedCenters,
    disabledCenters,
    activeSubscriptions,
    trialSubscriptions,
    overdueSubscriptions,
    graceSubscriptions,
    renewingSoonCount,
    mrr,
    arr: mrr * 12,
    collectedRevenueTotal,
    collectedThisMonth,
    overdueDuesTotal,
    pendingPaymentsTotal,
  };
}

export function computeCenterCapacityUsage(params: {
  studentsUsed: number;
  usersUsed: number;
  groupsUsed: number;
  plan: Pick<SaasPlanConfig, 'maxStudents' | 'maxUsers' | 'maxGroups'>;
}): CenterCapacityStatus {
  const safeMax = (n: number) => Math.max(1, n);
  const studentsMax = safeMax(params.plan.maxStudents);
  const usersMax = safeMax(params.plan.maxUsers);
  const groupsMax = safeMax(params.plan.maxGroups);

  const studentsPct = Math.round((params.studentsUsed / studentsMax) * 100);
  const usersPct = Math.round((params.usersUsed / usersMax) * 100);
  const groupsPct = Math.round((params.groupsUsed / groupsMax) * 100);

  const overLimit =
    params.studentsUsed > studentsMax ||
    params.usersUsed > usersMax ||
    params.groupsUsed > groupsMax;
  const nearLimit =
    !overLimit && (studentsPct >= 85 || usersPct >= 85 || groupsPct >= 85);

  return {
    studentsUsed: params.studentsUsed,
    studentsMax,
    studentsPct,
    usersUsed: params.usersUsed,
    usersMax,
    usersPct,
    groupsUsed: params.groupsUsed,
    groupsMax,
    groupsPct,
    nearLimit,
    overLimit,
  };
}

export interface AuditLogFilterParams {
  centerId?: string;
  actorRole?: string;
  actionPrefix?: string;
  search?: string;
}

export function filterPlatformAuditLogs(
  logs: ActivityLogEntry[],
  filter: AuditLogFilterParams
): ActivityLogEntry[] {
  const q = (filter.search || '').trim().toLowerCase();
  return logs.filter((entry) => {
    if (filter.centerId && filter.centerId !== 'all' && entry.centerId !== filter.centerId) {
      return false;
    }
    if (
      filter.actorRole &&
      filter.actorRole !== 'all' &&
      String(entry.actorRole) !== filter.actorRole
    ) {
      return false;
    }
    if (
      filter.actionPrefix &&
      filter.actionPrefix !== 'all' &&
      !entry.action.startsWith(filter.actionPrefix)
    ) {
      return false;
    }
    if (q) {
      const hay = `${entry.summary} ${entry.action} ${entry.resource} ${entry.actorName} ${entry.resourceId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildPlatformAuditCsv(
  logs: ActivityLogEntry[],
  centerNamesById: Map<string, string>
): string {
  const headers = [
    'التاريخ والوقت',
    'السنتر / النطاق',
    'المنفذ',
    'الدور',
    'الإجراء',
    'المورد',
    'الملخص',
  ];
  const rows = logs.map((entry) => [
    entry.timestamp,
    entry.centerId === 'platform'
      ? 'المنصة بالكامل'
      : centerNamesById.get(entry.centerId) || entry.centerId,
    entry.actorName,
    String(entry.actorRole),
    entry.action,
    entry.resource,
    entry.summary,
  ]);
  return buildUtf8BomCsv(headers, rows);
}

export function validateSaasPlanDraft(draft: {
  name: string;
  monthlyPrice: number;
  maxStudents: number;
  maxUsers: number;
  maxGroups: number;
}): { ok: boolean; error?: string } {
  if (!draft.name.trim()) {
    return { ok: false, error: 'أدخل اسم الباقة.' };
  }
  if (!Number.isFinite(draft.monthlyPrice) || draft.monthlyPrice < 0) {
    return { ok: false, error: 'أدخل سعراً شهرياً صحيحاً (0 فأكثر).' };
  }
  if (!Number.isFinite(draft.maxStudents) || draft.maxStudents < 1) {
    return { ok: false, error: 'الحد الأقصى للطلاب يجب أن يكون 1 على الأقل.' };
  }
  if (!Number.isFinite(draft.maxUsers) || draft.maxUsers < 1) {
    return { ok: false, error: 'الحد الأقصى للمستخدمين يجب أن يكون 1 على الأقل.' };
  }
  if (!Number.isFinite(draft.maxGroups) || draft.maxGroups < 1) {
    return { ok: false, error: 'الحد الأقصى للمجموعات يجب أن يكون 1 على الأقل.' };
  }
  return { ok: true };
}

export function validatePlatformSettingsPatch(
  patch: Partial<PlatformSettings>
): { ok: boolean; error?: string } {
  if (patch.productName !== undefined && !patch.productName.trim()) {
    return { ok: false, error: 'اسم المنتج لا يمكن أن يكون فارغاً.' };
  }
  if (
    patch.defaultTrialDays !== undefined &&
    (!Number.isFinite(patch.defaultTrialDays) ||
      patch.defaultTrialDays < 1 ||
      patch.defaultTrialDays > 365)
  ) {
    return { ok: false, error: 'مدة الفترة التجريبية يجب أن تكون بين 1 و 365 يوماً.' };
  }
  if (
    patch.enabledLanguages !== undefined &&
    patch.enabledLanguages.length === 0
  ) {
    return { ok: false, error: 'يجب تفعيل لغة واحدة على الأقل.' };
  }
  return { ok: true };
}

export const ALL_PLATFORM_USER_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.RECEPTIONIST,
  UserRole.TEACHER,
  UserRole.PARENT,
  UserRole.STUDENT,
];
