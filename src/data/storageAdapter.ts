import {
  ActivityLogEntry,
  AppNotification,
  Assessment,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  AttendanceSession,
  CashRegisterShift,
  Center,
  CenterSettings,
  ConsentRecord,
  DiscountRecord,
  Expense,
  FaceTemplateRecord,
  FileAssetRecord,
  GamificationPointEntry,
  Group,
  Guardian,
  InstallmentPlan,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  LessonItem,
  MessageTemplate,
  OnlineExam,
  OnlineExamAttempt,
  OutboxMessage,
  PaymentRecord,
  PlatformSettings,
  RegistrationLead,
  Room,
  SaasPaymentRecord,
  SaasPlanConfig,
  SaasSubscriptionRecord,
  ScheduledJobRunRecord,
  SettlementRecord,
  StaffAttendanceRecord,
  StaffPayrollRecord,
  Student,
  StudentDeviceSession,
  StudentGuardianLink,
  StudentPortalAccount,
  SystemUser,
  Teacher,
  WebhookEventRecord,
} from '../types/eduflow';
import {
  DEFAULT_CENTER_ID,
  INITIAL_ACTIVITY_LOG,
  INITIAL_ASSESSMENTS,
  INITIAL_ASSIGNMENTS,
  INITIAL_ASSIGNMENT_SUBMISSIONS,
  INITIAL_ATTENDANCE_RECORDS,
  INITIAL_CASH_SHIFTS,
  INITIAL_CENTERS,
  INITIAL_CENTER_SETTINGS,
  INITIAL_CONSENTS,
  INITIAL_DISCOUNTS,
  INITIAL_EXAM_ATTEMPTS,
  INITIAL_EXPENSES,
  INITIAL_FACE_TEMPLATES,
  INITIAL_FILE_ASSETS,
  INITIAL_GROUPS,
  INITIAL_GUARDIANS,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_INVENTORY_ITEMS,
  INITIAL_INVENTORY_TRANSACTIONS,
  INITIAL_INVOICES,
  INITIAL_LEADS,
  INITIAL_LESSONS,
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_ONLINE_EXAMS,
  INITIAL_PAYMENTS,
  INITIAL_PLATFORM_SETTINGS,
  INITIAL_POINT_ENTRIES,
  INITIAL_ROOMS,
  INITIAL_SAAS_PAYMENTS,
  INITIAL_SAAS_PLANS,
  INITIAL_SAAS_SUBSCRIPTIONS,
  INITIAL_SCHEDULED_JOB_RUNS,
  INITIAL_SESSIONS,
  INITIAL_SETTLEMENTS,
  INITIAL_STAFF_ATTENDANCE,
  INITIAL_STAFF_PAYROLLS,
  INITIAL_STUDENTS,
  INITIAL_STUDENT_ACCOUNTS,
  INITIAL_STUDENT_GUARDIANS,
  INITIAL_STUDENT_SESSIONS,
  INITIAL_TEACHERS,
  INITIAL_TEMPLATES,
  INITIAL_USERS,
  INITIAL_WEBHOOK_EVENTS,
  STAGES_LIST,
} from './seedData';

export const CURRENT_SCHEMA_VERSION = 4;

export type EntityKey =
  | 'centers'
  | 'users'
  | 'guardians'
  | 'studentGuardians'
  | 'students'
  | 'teachers'
  | 'groups'
  | 'sessions'
  | 'attendanceRecords'
  | 'invoices'
  | 'payments'
  | 'discounts'
  | 'expenses'
  | 'settlements'
  | 'messages'
  | 'assessments'
  | 'activityLog'
  | 'consents'
  | 'faceTemplates'
  | 'rooms'
  | 'notifications'
  | 'studentAccounts'
  | 'studentSessions'
  | 'webhookEvents'
  | 'scheduledJobRuns'
  | 'fileAssets'
  | 'lessons'
  | 'onlineExams'
  | 'examAttempts'
  | 'assignments'
  | 'assignmentSubmissions'
  | 'cashShifts'
  | 'inventoryItems'
  | 'inventoryTransactions'
  | 'leads'
  | 'staffAttendance'
  | 'staffPayrolls'
  | 'installmentPlans'
  | 'pointEntries'
  | 'saasSubscriptions'
  | 'saasPayments';

export interface EntityCollectionsMap {
  centers: Center[];
  users: SystemUser[];
  guardians: Guardian[];
  studentGuardians: StudentGuardianLink[];
  students: Student[];
  teachers: Teacher[];
  groups: Group[];
  sessions: AttendanceSession[];
  attendanceRecords: AttendanceRecord[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  discounts: DiscountRecord[];
  expenses: Expense[];
  settlements: SettlementRecord[];
  messages: OutboxMessage[];
  assessments: Assessment[];
  activityLog: ActivityLogEntry[];
  consents: ConsentRecord[];
  faceTemplates: FaceTemplateRecord[];
  rooms: Room[];
  notifications: AppNotification[];
  studentAccounts: StudentPortalAccount[];
  studentSessions: StudentDeviceSession[];
  webhookEvents: WebhookEventRecord[];
  scheduledJobRuns: ScheduledJobRunRecord[];
  fileAssets: FileAssetRecord[];
  lessons: LessonItem[];
  onlineExams: OnlineExam[];
  examAttempts: OnlineExamAttempt[];
  assignments: Assignment[];
  assignmentSubmissions: AssignmentSubmission[];
  cashShifts: CashRegisterShift[];
  inventoryItems: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  leads: RegistrationLead[];
  staffAttendance: StaffAttendanceRecord[];
  staffPayrolls: StaffPayrollRecord[];
  installmentPlans: InstallmentPlan[];
  pointEntries: GamificationPointEntry[];
  saasSubscriptions: SaasSubscriptionRecord[];
  saasPayments: SaasPaymentRecord[];
}

export interface EduflowMetaMap {
  stages: string[];
  templates: MessageTemplate[];
  centerSettings: CenterSettings;
  saasPlans: SaasPlanConfig[];
  platformSettings: PlatformSettings;
}

export interface EduflowBackupPayload {
  app: 'EDUFLOW';
  schemaVersion: number;
  exportedAt: string;
  centerId: string;
  collections: EntityCollectionsMap;
  meta: EduflowMetaMap;
}

export const ALL_ENTITY_KEYS: EntityKey[] = [
  'centers',
  'users',
  'guardians',
  'studentGuardians',
  'students',
  'teachers',
  'groups',
  'sessions',
  'attendanceRecords',
  'invoices',
  'payments',
  'discounts',
  'expenses',
  'settlements',
  'messages',
  'assessments',
  'activityLog',
  'consents',
  'faceTemplates',
  'rooms',
  'notifications',
  'studentAccounts',
  'studentSessions',
  'webhookEvents',
  'scheduledJobRuns',
  'fileAssets',
  'lessons',
  'onlineExams',
  'examAttempts',
  'assignments',
  'assignmentSubmissions',
  'cashShifts',
  'inventoryItems',
  'inventoryTransactions',
  'leads',
  'staffAttendance',
  'staffPayrolls',
  'installmentPlans',
  'pointEntries',
  'saasSubscriptions',
  'saasPayments',
];

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export function createInitialCollections(): EntityCollectionsMap {
  return deepClone({
    centers: INITIAL_CENTERS,
    users: INITIAL_USERS,
    guardians: INITIAL_GUARDIANS,
    studentGuardians: INITIAL_STUDENT_GUARDIANS,
    students: INITIAL_STUDENTS,
    teachers: INITIAL_TEACHERS,
    groups: INITIAL_GROUPS,
    sessions: INITIAL_SESSIONS,
    attendanceRecords: INITIAL_ATTENDANCE_RECORDS,
    invoices: INITIAL_INVOICES,
    payments: INITIAL_PAYMENTS,
    discounts: INITIAL_DISCOUNTS,
    expenses: INITIAL_EXPENSES,
    settlements: INITIAL_SETTLEMENTS,
    messages: INITIAL_MESSAGES,
    assessments: INITIAL_ASSESSMENTS,
    activityLog: INITIAL_ACTIVITY_LOG,
    consents: INITIAL_CONSENTS,
    faceTemplates: INITIAL_FACE_TEMPLATES,
    rooms: INITIAL_ROOMS,
    notifications: INITIAL_NOTIFICATIONS,
    studentAccounts: INITIAL_STUDENT_ACCOUNTS,
    studentSessions: INITIAL_STUDENT_SESSIONS,
    webhookEvents: INITIAL_WEBHOOK_EVENTS,
    scheduledJobRuns: INITIAL_SCHEDULED_JOB_RUNS,
    fileAssets: INITIAL_FILE_ASSETS,
    lessons: INITIAL_LESSONS,
    onlineExams: INITIAL_ONLINE_EXAMS,
    examAttempts: INITIAL_EXAM_ATTEMPTS,
    assignments: INITIAL_ASSIGNMENTS,
    assignmentSubmissions: INITIAL_ASSIGNMENT_SUBMISSIONS,
    cashShifts: INITIAL_CASH_SHIFTS,
    inventoryItems: INITIAL_INVENTORY_ITEMS,
    inventoryTransactions: INITIAL_INVENTORY_TRANSACTIONS,
    leads: INITIAL_LEADS,
    staffAttendance: INITIAL_STAFF_ATTENDANCE,
    staffPayrolls: INITIAL_STAFF_PAYROLLS,
    installmentPlans: INITIAL_INSTALLMENT_PLANS,
    pointEntries: INITIAL_POINT_ENTRIES,
    saasSubscriptions: INITIAL_SAAS_SUBSCRIPTIONS,
    saasPayments: INITIAL_SAAS_PAYMENTS,
  });
}

export function createInitialMeta(): EduflowMetaMap {
  return deepClone({
    stages: STAGES_LIST,
    templates: INITIAL_TEMPLATES,
    centerSettings: INITIAL_CENTER_SETTINGS,
    saasPlans: INITIAL_SAAS_PLANS,
    platformSettings: INITIAL_PLATFORM_SETTINGS,
  });
}

/**
 * Migrates persisted or restored snapshots from older schema versions to CURRENT_SCHEMA_VERSION.
 * Any v1 snapshot containing only legacy center-1 demo data is safely replaced with سنتر حامد البيلي.
 */
export function migrateSnapshot(
  rawCollections: Partial<EntityCollectionsMap>,
  rawMeta: Partial<EduflowMetaMap>,
  fromVersion: number
): { schemaVersion: number; collections: EntityCollectionsMap; meta: EduflowMetaMap } {
  const defaults = createInitialCollections();
  const defaultMeta = createInitialMeta();

  // If upgrading from v1 legacy "center-1" seed snapshot, cleanly reset to سنتر حامد البيلي v2 seed
  const isLegacyCenter1Snapshot =
    fromVersion < 2 &&
    Array.isArray(rawCollections.centers) &&
    rawCollections.centers.length > 0 &&
    rawCollections.centers.every((c) => c.id === 'center-1');

  if (isLegacyCenter1Snapshot) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      collections: defaults,
      meta: defaultMeta,
    };
  }

  const merged: EntityCollectionsMap = {
    centers: Array.isArray(rawCollections.centers) ? rawCollections.centers : defaults.centers,
    users: Array.isArray(rawCollections.users) ? rawCollections.users : defaults.users,
    guardians: Array.isArray(rawCollections.guardians) ? rawCollections.guardians : defaults.guardians,
    studentGuardians: Array.isArray(rawCollections.studentGuardians)
      ? rawCollections.studentGuardians
      : defaults.studentGuardians,
    students: Array.isArray(rawCollections.students) ? rawCollections.students : defaults.students,
    teachers: Array.isArray(rawCollections.teachers) ? rawCollections.teachers : defaults.teachers,
    groups: Array.isArray(rawCollections.groups) ? rawCollections.groups : defaults.groups,
    sessions: Array.isArray(rawCollections.sessions) ? rawCollections.sessions : defaults.sessions,
    attendanceRecords: Array.isArray(rawCollections.attendanceRecords)
      ? rawCollections.attendanceRecords
      : defaults.attendanceRecords,
    invoices: Array.isArray(rawCollections.invoices) ? rawCollections.invoices : defaults.invoices,
    payments: Array.isArray(rawCollections.payments) ? rawCollections.payments : defaults.payments,
    discounts: Array.isArray(rawCollections.discounts) ? rawCollections.discounts : defaults.discounts,
    expenses: Array.isArray(rawCollections.expenses) ? rawCollections.expenses : defaults.expenses,
    settlements: Array.isArray(rawCollections.settlements)
      ? rawCollections.settlements
      : defaults.settlements,
    messages: Array.isArray(rawCollections.messages) ? rawCollections.messages : defaults.messages,
    assessments: Array.isArray(rawCollections.assessments)
      ? rawCollections.assessments
      : defaults.assessments,
    activityLog: Array.isArray(rawCollections.activityLog)
      ? rawCollections.activityLog
      : defaults.activityLog,
    consents: Array.isArray(rawCollections.consents) ? rawCollections.consents : defaults.consents,
    faceTemplates: Array.isArray(rawCollections.faceTemplates)
      ? rawCollections.faceTemplates
      : defaults.faceTemplates,
    rooms: Array.isArray(rawCollections.rooms) ? rawCollections.rooms : defaults.rooms,
    notifications: Array.isArray(rawCollections.notifications)
      ? rawCollections.notifications
      : defaults.notifications,
    studentAccounts: Array.isArray(rawCollections.studentAccounts)
      ? rawCollections.studentAccounts
      : defaults.studentAccounts,
    studentSessions: Array.isArray(rawCollections.studentSessions)
      ? rawCollections.studentSessions
      : defaults.studentSessions,
    webhookEvents: Array.isArray(rawCollections.webhookEvents)
      ? rawCollections.webhookEvents
      : defaults.webhookEvents,
    scheduledJobRuns: Array.isArray(rawCollections.scheduledJobRuns)
      ? rawCollections.scheduledJobRuns
      : defaults.scheduledJobRuns,
    fileAssets: Array.isArray(rawCollections.fileAssets)
      ? rawCollections.fileAssets
      : defaults.fileAssets,
    lessons: Array.isArray(rawCollections.lessons) ? rawCollections.lessons : defaults.lessons,
    onlineExams: Array.isArray(rawCollections.onlineExams)
      ? rawCollections.onlineExams
      : defaults.onlineExams,
    examAttempts: Array.isArray(rawCollections.examAttempts)
      ? rawCollections.examAttempts
      : defaults.examAttempts,
    assignments: Array.isArray(rawCollections.assignments)
      ? rawCollections.assignments
      : defaults.assignments,
    assignmentSubmissions: Array.isArray(rawCollections.assignmentSubmissions)
      ? rawCollections.assignmentSubmissions
      : defaults.assignmentSubmissions,
    cashShifts: Array.isArray(rawCollections.cashShifts)
      ? rawCollections.cashShifts
      : defaults.cashShifts,
    inventoryItems: Array.isArray(rawCollections.inventoryItems)
      ? rawCollections.inventoryItems
      : defaults.inventoryItems,
    inventoryTransactions: Array.isArray(rawCollections.inventoryTransactions)
      ? rawCollections.inventoryTransactions
      : defaults.inventoryTransactions,
    leads: Array.isArray(rawCollections.leads) ? rawCollections.leads : defaults.leads,
    staffAttendance: Array.isArray(rawCollections.staffAttendance)
      ? rawCollections.staffAttendance
      : defaults.staffAttendance,
    staffPayrolls: Array.isArray(rawCollections.staffPayrolls)
      ? rawCollections.staffPayrolls
      : defaults.staffPayrolls,
    installmentPlans: Array.isArray(rawCollections.installmentPlans)
      ? rawCollections.installmentPlans
      : defaults.installmentPlans,
    pointEntries: Array.isArray(rawCollections.pointEntries)
      ? rawCollections.pointEntries
      : defaults.pointEntries,
    saasSubscriptions: Array.isArray(rawCollections.saasSubscriptions)
      ? rawCollections.saasSubscriptions
      : defaults.saasSubscriptions,
    saasPayments: Array.isArray(rawCollections.saasPayments)
      ? rawCollections.saasPayments
      : defaults.saasPayments,
  };

  // Ensure Super Admin user exists on migration from older v2/v3 browser snapshots
  if (!merged.users.some((u) => u.id === 'u-superadmin' || u.email === 'superadmin@eduflow.eg')) {
    const seededSuperAdmin = defaults.users.find((u) => u.id === 'u-superadmin');
    if (seededSuperAdmin) {
      merged.users = [seededSuperAdmin, ...merged.users];
    }
  }

  merged.centers = merged.centers.map((c) => ({
    ...c,
    status: c.status || 'active',
  }));

  if (fromVersion <= CURRENT_SCHEMA_VERSION) {
    merged.students = merged.students.map((st, idx) => {
      const fullName = st.fullName || st.name;
      const parentName = st.parent?.name || st.parentName || '';
      const parentPhone = st.parent?.phone || st.parentPhone || '';
      return {
        ...st,
        centerId: st.centerId || DEFAULT_CENTER_ID,
        code: st.code || `S-${String(101 + idx).padStart(6, '0')}`,
        fullName,
        name: fullName,
        parent: { name: parentName, phone: parentPhone },
        parentName,
        parentPhone,
        createdAt: st.createdAt || '2026-11-16T00:00:00.000Z',
      };
    });

    merged.teachers = merged.teachers.map((t) => ({
      ...t,
      centerId: t.centerId || DEFAULT_CENTER_ID,
      compensation:
        t.compensation ||
        (t.compensationType === 'fixed_rent'
          ? { type: 'rent', rentAmount: t.compensationValue }
          : t.compensationType === 'per_session'
            ? { type: 'per_session', perSessionAmount: t.compensationValue }
            : { type: 'percent', centerPercent: Math.max(0, 100 - t.compensationValue) }),
    }));

    const roomMap = new Map(merged.rooms.map((r) => [r.id, r.name]));
    merged.groups = merged.groups.map((g) => ({
      ...g,
      centerId: g.centerId || DEFAULT_CENTER_ID,
      room: g.room || roomMap.get(g.roomId) || g.roomId,
    }));

    merged.sessions = merged.sessions.map((s) => ({
      ...s,
      centerId: s.centerId || DEFAULT_CENTER_ID,
      type: s.type || 'regular',
    }));

    merged.invoices = merged.invoices.map((inv) => ({
      ...inv,
      centerId: inv.centerId || DEFAULT_CENTER_ID,
      number: inv.number || inv.invoiceNumber,
      invoiceNumber: inv.invoiceNumber || inv.number,
      baseAmount: typeof inv.baseAmount === 'number' ? inv.baseAmount : inv.total,
      discountLines: Array.isArray(inv.discountLines) ? inv.discountLines : [],
      netAmount: typeof inv.netAmount === 'number' ? inv.netAmount : inv.total,
      createdAt: inv.createdAt || '2026-11-16T00:00:00.000Z',
    }));

    merged.payments = merged.payments.map((p) => ({
      ...p,
      centerId: p.centerId || DEFAULT_CENTER_ID,
    }));

    merged.expenses = merged.expenses.map((e) => ({
      ...e,
      centerId: e.centerId || DEFAULT_CENTER_ID,
    }));

    merged.assessments = merged.assessments.map((a) => ({
      ...a,
      centerId: a.centerId || DEFAULT_CENTER_ID,
    }));
  }

  const meta: EduflowMetaMap = {
    stages: Array.isArray(rawMeta.stages) ? rawMeta.stages : defaultMeta.stages,
    templates: Array.isArray(rawMeta.templates) ? rawMeta.templates : defaultMeta.templates,
    centerSettings: rawMeta.centerSettings
      ? {
          ...defaultMeta.centerSettings,
          ...rawMeta.centerSettings,
          discountPolicy: {
            ...defaultMeta.centerSettings.discountPolicy!,
            ...(rawMeta.centerSettings.discountPolicy || {}),
          },
          receiptSettings: {
            ...defaultMeta.centerSettings.receiptSettings!,
            ...(rawMeta.centerSettings.receiptSettings || {}),
          },
          integrations: {
            ...defaultMeta.centerSettings.integrations!,
            ...(rawMeta.centerSettings.integrations || {}),
          },
          planFeatureOverrides:
            rawMeta.centerSettings.planFeatureOverrides ||
            defaultMeta.centerSettings.planFeatureOverrides ||
            {},
        }
      : defaultMeta.centerSettings,
    saasPlans:
      Array.isArray(rawMeta.saasPlans) && rawMeta.saasPlans.length > 0
        ? rawMeta.saasPlans
        : defaultMeta.saasPlans,
    platformSettings: rawMeta.platformSettings
      ? {
          ...defaultMeta.platformSettings,
          ...rawMeta.platformSettings,
        }
      : defaultMeta.platformSettings,
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: merged,
    meta,
  };
}

/**
 * StorageAdapter interface: screens and repositories talk only to this contract.
 * A future SupabaseAdapter can implement these methods against Postgres + RLS
 * without touching any screen component.
 */
export interface StorageAdapter {
  getCollection<K extends EntityKey>(key: K): EntityCollectionsMap[K];
  setCollection<K extends EntityKey>(key: K, items: EntityCollectionsMap[K]): void;
  getMeta<K extends keyof EduflowMetaMap>(key: K): EduflowMetaMap[K];
  setMeta<K extends keyof EduflowMetaMap>(key: K, value: EduflowMetaMap[K]): void;
  getRawValue<T>(key: string, fallback: T): T;
  setRawValue<T>(key: string, value: T, immediate?: boolean): void;
  removeRawValue(key: string): void;
  flush(): void;
  exportBackup(): EduflowBackupPayload;
  validateBackup(payload: unknown): {
    valid: boolean;
    error?: string;
    summary?: { students: number; teachers: number; groups: number; invoices: number; payments: number };
    parsed?: EduflowBackupPayload;
  };
  importBackup(payload: unknown): EduflowBackupPayload;
  resetToSeed(): void;
  subscribe(listener: () => void): () => void;
  setErrorHandler(handler: ((message: string) => void) | null): void;
}
