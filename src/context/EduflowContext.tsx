import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityLogEntry,
  AppNotification,
  Assessment,
  AssessmentGrade,
  AttendanceEntry,
  AttendanceRecord,
  AttendanceSession,
  AuthSession,
  Center,
  CenterSettings,
  ConsentRecord,
  DiscountRecord,
  Expense,
  FaceTemplateRecord,
  FileAssetRecord,
  Group,
  Guardian,
  IntegrationConfig,
  IntegrationKey,
  Invoice,
  ListStateMode,
  MessageTemplate,
  OutboxMessage,
  PaymentRecord,
  Room,
  ScheduledJobRunRecord,
  ScreenId,
  SettlementManualLine,
  SettlementRecord,
  StandingDiscountConfig,
  Student,
  StudentDeviceSession,
  StudentGuardianLink,
  StudentPortalAccount,
  SystemUser,
  Teacher,
  UserRole,
  WebhookEventRecord,
  WebhookProviderKey,
} from '../types/eduflow';
import {
  BooleanPlanFeatureKey,
  DEFAULT_CENTER_ID,
  DEFAULT_INTEGRATIONS,
  isStudentPortalEnabled,
} from '../data/seedData';
import {
  defaultStorageAdapter,
  repositories,
  runWithSystemActor,
  setActivePermissionActor,
} from '../data/repositories';
import { EduflowBackupPayload } from '../data/storageAdapter';
import { authService, LoginResult } from '../features/auth/authService';
import {
  BulkPrintSlipItem,
  STUDENT_AUTH_SESSION_STORAGE_KEY,
  StudentAuthSession,
  studentAuthService,
  StudentLoginResult,
} from '../features/studentPortal/studentAuthService';
import {
  applyDiscountToInvoiceState,
  canDeleteInvoiceBatch,
  previewBulkInvoices,
} from '../features/billing/invoicesAndDiscounts';
import { calculateTeacherSettlement } from '../features/settlements/teacherSettlement';
import {
  createDeterministicFaceHash,
  hasActiveBiometricConsent,
} from '../features/biometrics/faceAttendanceService';
import { computeInvoiceStatus, formatDateDDMMYYYY } from '../utils/eduflowLogic';
import { PdfDocumentPayload } from '../utils/pdfExportLogic';
import { createPasswordCredential } from '../utils/authCrypto';
import {
  assertCan,
  can,
  canAccessScreen,
  getDefaultHomeScreen,
  PermissionActor,
  PermissionError,
} from '../permissions/permissions';
import {
  CheckoutSessionResult,
  GatewayPaymentMethod,
  JobRunOutcome,
  MessagingSendResult,
  MockCheckoutOutcome,
  WebhookProcessResult,
  defaultJobScheduler,
  defaultMockPaymobProvider,
  defaultMockWhatsAppProvider,
  defaultStorageProvider,
  processIncomingWebhook,
} from '../features/integrations';

export interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'error' | 'info';
}

interface PrefilledGroupSlot {
  day?: string;
  startTime?: string;
  roomId?: string;
}

const PUBLIC_SCREENS = new Set<ScreenId>([
  ScreenId.LANDING,
  ScreenId.LOGIN,
  ScreenId.ONBOARDING,
  ScreenId.PARENT_PORTAL,
  ScreenId.STUDENT_LOGIN,
]);

interface EduflowContextValue {
  currentScreen: ScreenId;
  navigate: (screen: ScreenId) => void;
  intendedScreen: ScreenId | null;

  // Auth & Role Preview
  authSession: AuthSession | null;
  studentAuthSession: StudentAuthSession | null;
  studentPortalAvailable: boolean;
  currentUser: SystemUser | null;
  currentActor: PermissionActor | null;
  currentRole: UserRole;
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  canUseRoleSwitcher: boolean;
  setCurrentRole: (role: UserRole) => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<LoginResult>;
  activateParentByPhone: (phone: string, newPassword: string) => Promise<LoginResult>;
  logout: () => void;

  // Student Portal Auth & Staff Account Management (Phase 11)
  issueStudentAccessCode: (
    studentId: string,
    isRegenerate?: boolean
  ) => Promise<{ account: StudentPortalAccount; plainCode: string } | null>;
  bulkGenerateStudentSlips: (studentIds: string[]) => Promise<BulkPrintSlipItem[]>;
  toggleStudentPortalAccountStatus: (
    studentId: string,
    nextStatus: 'active' | 'suspended'
  ) => boolean;
  revokeAllStudentPortalSessions: (studentId: string) => number;
  revokeSingleStudentPortalSession: (sessionId: string) => boolean;
  loginStudentWithCode: (params: {
    accessCode: string;
    pin?: string;
    kickOldestDevice?: boolean;
  }) => Promise<StudentLoginResult>;
  completeStudentFirstLoginPin: (params: {
    accessCode: string;
    newPin: string;
    kickOldestDevice?: boolean;
  }) => Promise<StudentLoginResult>;
  changeStudentPortalPin: (
    oldPin: string,
    newPin: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logoutStudent: () => void;
  resetPasswordByEmail: (email: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  changeMyPassword: (
    oldPassword: string,
    newPassword: string,
    displayName?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  registerCenterOwner: (payload: {
    ownerName: string;
    ownerPhone: string;
    ownerEmail: string;
    password: string;
    centerName: string;
    governorate: string;
    city: string;
    centerPhone: string;
    stages: string[];
    rooms: { name: string; capacity: number }[];
    firstTeacher?: { name: string; subject: string; phone: string };
  }) => Promise<AuthSession>;

  listStateMode: ListStateMode;
  setListStateMode: (mode: ListStateMode) => void;
  newCenterEmptyMode: boolean;
  setNewCenterEmptyMode: (val: boolean) => void;

  // Data collections (read via repositories)
  centers: Center[];
  guardians: Guardian[];
  studentGuardians: StudentGuardianLink[];
  students: Student[];
  teachers: Teacher[];
  groups: Group[];
  rooms: Room[];
  stages: string[];
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
  studentAccounts: StudentPortalAccount[];
  studentSessions: StudentDeviceSession[];
  webhookEvents: WebhookEventRecord[];
  scheduledJobs: ScheduledJobRunRecord[];
  fileAssets: FileAssetRecord[];
  notifications: AppNotification[];
  templates: MessageTemplate[];
  users: SystemUser[];
  centerSettings: CenterSettings;

  // Phase 17: Integrations, Webhooks, Scheduler & Storage Foundation
  updateIntegrationConfig: (
    key: IntegrationKey,
    patch: Partial<Pick<IntegrationConfig, 'enabled' | 'mode'>>
  ) => void;
  testIntegrationConnection: (key: IntegrationKey) => Promise<{ ok: boolean; message: string }>;
  startMockPaymobCheckout: (params: {
    amount: number;
    method: GatewayPaymentMethod;
    invoiceId?: string;
  }) => Promise<CheckoutSessionResult | null>;
  simulateMockPaymobOutcome: (
    txId: string,
    outcome: MockCheckoutOutcome
  ) => Promise<{
    result: WebhookProcessResult;
    rawBody: string;
    signature: string;
  } | null>;
  replayWebhookEvent: (params: {
    provider: WebhookProviderKey;
    rawBody: string;
    signature: string;
    tamperSignature?: boolean;
  }) => Promise<WebhookProcessResult | null>;
  testWhatsAppProvider: (params: {
    mode: 'template' | 'text_inside_24h' | 'text_outside_24h';
    phone: string;
    simulateStatus: 'sent' | 'delivered' | 'read' | 'failed';
  }) => Promise<{ sendResult: MessagingSendResult; webhookResult?: WebhookProcessResult } | null>;
  testStorageUpload: (file: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    category: FileAssetRecord['category'];
  }) => Promise<{ ok: boolean; errorAr?: string; asset?: FileAssetRecord }>;
  runScheduledJobNow: (jobName: string) => Promise<JobRunOutcome | null>;
  runAllDueJobsNow: () => Promise<JobRunOutcome[]>;
  togglePlanFeatureOverride: (
    planId: CenterSettings['currentPlanId'],
    flagKey: BooleanPlanFeatureKey,
    value: boolean
  ) => void;

  // Backup / Restore / Reset (Settings > البيانات)
  exportBackupJson: () => EduflowBackupPayload;
  validateBackupJson: (
    payload: unknown
  ) => ReturnType<typeof defaultStorageAdapter.validateBackup>;
  importBackupJson: (payload: unknown) => EduflowBackupPayload;
  resetDemoData: () => void;

  // Selected entities & global drawers/modals
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  selectedTeacherId: string;
  setSelectedTeacherId: (id: string) => void;
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
  lastSavedSessionId: string | null;

  // Global Add/Edit Student Drawer
  studentDrawerOpen: boolean;
  editingStudent: Student | null;
  openAddStudent: () => void;
  openEditStudent: (student: Student) => void;
  closeStudentDrawer: () => void;
  saveStudent: (
    data: Omit<
      Student,
      | 'id'
      | 'centerId'
      | 'code'
      | 'fullName'
      | 'parent'
      | 'createdAt'
      | 'paymentStatus'
      | 'lastAttendance'
      | 'attendanceRate'
      | 'notes'
    >,
    existingId?: string
  ) => Student;
  deactivateStudent: (studentId: string) => void;
  bulkMoveStudentsToGroup: (studentIds: string[], groupId: string) => void;
  bulkDeactivateStudents: (studentIds: string[]) => void;
  addStudentNote: (studentId: string, text: string) => void;

  // Global Record Payment Drawer & Receipt Modal
  paymentDrawerOpen: boolean;
  paymentPreselectedStudentId: string | null;
  paymentPreselectedInvoiceId: string | null;
  activeReceipt: PaymentRecord | null;
  setActiveReceipt: (r: PaymentRecord | null) => void;
  openRecordPayment: (studentId?: string, invoiceId?: string) => void;
  closeRecordPayment: () => void;
  recordPayment: (payload: {
    invoiceId: string;
    amount: number;
    method: PaymentRecord['method'];
    date: string;
    note?: string;
  }) => PaymentRecord | null;
  generateMonthlyInvoices: (
    monthInput: string,
    groupIds: string[],
    dueDay?: number
  ) => { createdCount: number; skippedCount: number; batchId: string | null };
  deleteInvoiceBatch: (batchId: string) => boolean;
  applyInvoiceDiscount: (payload: {
    invoiceId: string;
    category: 'scholarship' | 'waiver' | 'manual';
    mode: 'fixed' | 'percent';
    value: number;
    reason: string;
  }) => boolean;
  settleTeacherMonth: (payload: {
    teacherId: string;
    monthInput: string;
    basis: 'cash' | 'invoiced';
    manualLines: SettlementManualLine[];
    paymentMethod: PaymentRecord['method'];
    applyCarryForward: boolean;
    note?: string;
    recordAsExpense?: boolean;
  }) => SettlementRecord | null;
  logExcelExport: (label: string) => void;

  // Global Create/Edit Group Drawer
  groupDrawerOpen: boolean;
  editingGroup: Group | null;
  prefilledSlot: PrefilledGroupSlot | null;
  openCreateGroup: (slot?: PrefilledGroupSlot) => void;
  openEditGroup: (group: Group) => void;
  closeGroupDrawer: () => void;
  saveGroup: (
    groupData: Omit<Group, 'id' | 'centerId' | 'room'> & { room?: string },
    existingId?: string
  ) => Group;
  updateGroupStudents: (groupId: string, studentIds: string[]) => void;

  // Teachers CRUD
  addOrUpdateTeacher: (
    teacherData: Omit<Teacher, 'id' | 'centerId' | 'color' | 'compensation'>,
    existingId?: string
  ) => void;

  // Attendance Actions (Manual, QR, Face, Makeup)
  saveAttendanceSession: (sessionId: string, entries: AttendanceEntry[]) => void;
  createMakeupSession: (payload: {
    groupId: string;
    date: string;
    timeLabel: string;
    roomId: string;
    originalSessionId?: string;
    studentIds: string[];
  }) => AttendanceSession | null;
  compensateAbsentStudent: (payload: {
    originalSessionId: string;
    studentId: string;
    makeupSessionId: string;
    note?: string;
  }) => boolean;
  markStudentAttendanceByMethod: (payload: {
    sessionId: string;
    studentId: string;
    status: 'present' | 'late';
    method: 'qr' | 'face';
    confidence?: number;
    note?: string;
  }) => boolean;

  // WhatsApp Outbox
  queueWhatsAppMessages: (
    items: {
      studentId?: string;
      recipientName: string;
      recipientPhone: string;
      templateId?: string;
      body: string;
      sessionId?: string;
      invoiceId?: string;
    }[]
  ) => OutboxMessage[];
  markOutboxMessageSent: (
    messageId: string,
    opts?: { sessionId?: string; studentId?: string; invoiceId?: string }
  ) => void;

  // Biometrics & Consents
  saveBiometricConsent: (payload: { studentId: string; granted: boolean }) => ConsentRecord | null;
  enrollFaceTemplate: (payload: {
    studentId: string;
    sampleSignature: string;
  }) => Promise<FaceTemplateRecord | null>;
  deleteFaceTemplate: (studentId: string) => boolean;

  // Expenses CRUD
  addExpense: (exp: Omit<Expense, 'id' | 'centerId' | 'addedBy'>) => void;
  deleteExpense: (id: string) => void;

  // Assessments CRUD
  createAssessment: (data: Omit<Assessment, 'id' | 'centerId' | 'status' | 'grades'>) => Assessment;
  updateAssessmentGrades: (assessmentId: string, grades: AssessmentGrade[]) => void;

  // Notifications
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;

  // Settings & Subscription
  updateCenterSettings: (partial: Partial<CenterSettings>) => void;
  addRoom: (name: string, capacity: number) => void;
  updateRoom: (id: string, name: string, capacity: number) => void;
  deleteRoom: (id: string) => void;
  addStage: (stageName: string) => void;
  deleteStage: (stageName: string) => void;
  inviteUser: (
    u: Omit<
      SystemUser,
      'id' | 'centerId' | 'status' | 'passwordHash' | 'salt' | 'failedAttempts'
    >
  ) => Promise<void>;
  updateTemplate: (id: MessageTemplate['id'], body: string) => void;

  // Locked Feature Modal
  lockedFeatureModal: { open: boolean; featureName: string; requiredPlan: string };
  openLockedFeatureModal: (featureName: string, requiredPlan?: string) => void;
  closeLockedFeatureModal: () => void;

  // PDF Export & Parent Share Modal
  activePdfPayload: PdfDocumentPayload | null;
  openPdfExport: (payload: PdfDocumentPayload) => void;
  closePdfExport: () => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (title: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
}

const EduflowContext = createContext<EduflowContextValue | null>(null);

function clearViewQueryParam() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.has('view')) {
    params.delete('view');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }
}

function parseScreenFromHash(hashStr: string): ScreenId | null {
  const clean = hashStr.replace(/^#\/?/, '').trim().split('?')[0];
  if (!clean) return null;
  if (clean === 'home') return ScreenId.LANDING;
  if (clean === 'signup') return ScreenId.ONBOARDING;
  if (clean === 'student' || clean === 'student-portal') return ScreenId.STUDENT_PORTAL;
  if (clean === 'student-login') return ScreenId.STUDENT_LOGIN;
  if (clean === 'parent' || clean === 'parent-portal') return ScreenId.PARENT_PORTAL;
  if (Object.values(ScreenId).includes(clean as ScreenId)) {
    return clean as ScreenId;
  }
  return null;
}

function resolveInitialScreen(
  staffSession: AuthSession | null,
  studentSession: StudentAuthSession | null
): {
  initial: ScreenId;
  intended: ScreenId | null;
} {
  if (typeof window === 'undefined') {
    return { initial: ScreenId.LANDING, intended: null };
  }
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  let requested: ScreenId | null = parseScreenFromHash(window.location.hash);
  if (!requested && view) {
    if (view === 'home') requested = ScreenId.LANDING;
    else if (view === 'signup') requested = ScreenId.ONBOARDING;
    else if (view === 'student' || view === 'student-portal') requested = ScreenId.STUDENT_PORTAL;
    else if (view === 'student-login') requested = ScreenId.STUDENT_LOGIN;
    else if (Object.values(ScreenId).includes(view as ScreenId)) {
      requested = view as ScreenId;
    }
  }

  const sessionActor: PermissionActor | null = studentSession
    ? {
        userId: studentSession.studentId,
        role: UserRole.STUDENT,
        centerId: studentSession.centerId,
        studentId: studentSession.studentId,
      }
    : staffSession
    ? {
        userId: staffSession.userId,
        role: staffSession.role,
        centerId: staffSession.centerId,
        teacherId: staffSession.teacherId,
        studentId: staffSession.studentId,
        guardianId: staffSession.guardianId,
        parentPhone: staffSession.parentPhone,
      }
    : null;

  if (requested) {
    // Student logged in and attempting a staff URL -> route to requested ScreenId so ScreenRouter blocks it via AccessDeniedScreen
    if (studentSession && !canAccessScreen(sessionActor, requested)) {
      if (requested === ScreenId.STUDENT_LOGIN) {
        return { initial: ScreenId.STUDENT_PORTAL, intended: null };
      }
      return { initial: requested, intended: null };
    }

    if (sessionActor && (requested === ScreenId.LOGIN || requested === ScreenId.ONBOARDING)) {
      const last = authService.getLastScreen() as ScreenId | null;
      const candidate =
        last &&
        Object.values(ScreenId).includes(last) &&
        !PUBLIC_SCREENS.has(last) &&
        canAccessScreen(sessionActor, last)
          ? last
          : getDefaultHomeScreen(sessionActor);
      return {
        initial: candidate,
        intended: null,
      };
    }
    if (requested === ScreenId.STUDENT_LOGIN && studentSession) {
      return { initial: ScreenId.STUDENT_PORTAL, intended: null };
    }
    if (PUBLIC_SCREENS.has(requested)) {
      if (sessionActor && !canAccessScreen(sessionActor, requested)) {
        return { initial: getDefaultHomeScreen(sessionActor), intended: null };
      }
      return { initial: requested, intended: null };
    }
    if (sessionActor) {
      return {
        initial: canAccessScreen(sessionActor, requested)
          ? requested
          : getDefaultHomeScreen(sessionActor),
        intended: null,
      };
    }
    if (requested === ScreenId.STUDENT_PORTAL) {
      return { initial: ScreenId.STUDENT_LOGIN, intended: ScreenId.STUDENT_PORTAL };
    }
    return { initial: ScreenId.LOGIN, intended: requested };
  }

  if (studentSession) {
    return { initial: ScreenId.STUDENT_PORTAL, intended: null };
  }

  if (sessionActor) {
    const last = authService.getLastScreen() as ScreenId | null;
    if (
      last &&
      Object.values(ScreenId).includes(last) &&
      !PUBLIC_SCREENS.has(last) &&
      canAccessScreen(sessionActor, last)
    ) {
      return { initial: last, intended: null };
    }
    return { initial: getDefaultHomeScreen(sessionActor), intended: null };
  }

  return { initial: ScreenId.LANDING, intended: null };
}

export const EduflowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    authService.getPersistedSession()
  );
  const [studentAuthSession, setStudentAuthSession] = useState<StudentAuthSession | null>(() =>
    studentAuthService.getPersistedStudentSession()
  );
  const [demoMode, setDemoModeState] = useState<boolean>(() => authService.getDemoMode());
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);

  const initialRoute = useMemo(
    () => resolveInitialScreen(authSession, studentAuthSession),
    []
  );
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(initialRoute.initial);
  const [intendedScreen, setIntendedScreen] = useState<ScreenId | null>(initialRoute.intended);

  const [listStateMode, setListStateMode] = useState<ListStateMode>('ready');
  const [newCenterEmptyMode, setNewCenterEmptyMode] = useState<boolean>(false);

  const canUseRoleSwitcher = Boolean(
    !studentAuthSession && authSession && authSession.role === UserRole.OWNER && demoMode
  );

  const currentRole: UserRole = studentAuthSession
    ? UserRole.STUDENT
    : canUseRoleSwitcher && previewRole
    ? previewRole
    : authSession?.role || UserRole.OWNER;

  const currentActor: PermissionActor | null = useMemo(() => {
    if (studentAuthSession) {
      return {
        userId: studentAuthSession.studentId,
        role: UserRole.STUDENT,
        centerId: studentAuthSession.centerId,
        studentId: studentAuthSession.studentId,
      };
    }
    if (!authSession) return null;
    if (canUseRoleSwitcher && previewRole) {
      const previewTeacherId =
        authSession.teacherId ||
        (previewRole === UserRole.TEACHER
          ? defaultStorageAdapter.getCollection('teachers')[0]?.id
          : undefined);
      const previewGuardian =
        previewRole === UserRole.PARENT
          ? defaultStorageAdapter.getCollection('guardians')[0]
          : undefined;
      return {
        userId: authSession.userId,
        role: previewRole,
        centerId: authSession.centerId,
        teacherId: previewRole === UserRole.TEACHER ? previewTeacherId : undefined,
        guardianId:
          previewRole === UserRole.PARENT
            ? authSession.guardianId || previewGuardian?.id
            : undefined,
        parentPhone:
          previewRole === UserRole.PARENT
            ? authSession.parentPhone || previewGuardian?.phone
            : undefined,
      };
    }
    return {
      userId: authSession.userId,
      role: authSession.role,
      centerId: authSession.centerId,
      teacherId: authSession.teacherId,
      studentId: authSession.studentId,
      guardianId: authSession.guardianId,
      parentPhone: authSession.parentPhone,
    };
  }, [authSession, studentAuthSession, canUseRoleSwitcher, previewRole]);

  // Keep repository enforcement strictly synchronized with the active actor
  setActivePermissionActor(currentActor);

  const [syncTick, setSyncTick] = useState(0);

  // Read live collections strictly from repositories (scoped by currentActor inside repositories)
  const centers = useMemo(() => repositories.centers.list(), [syncTick, currentActor]);
  const guardians = useMemo(() => repositories.guardians.list(), [syncTick, currentActor]);
  const studentGuardians = useMemo(
    () => repositories.studentGuardians.list(),
    [syncTick, currentActor]
  );
  const students = useMemo(() => repositories.students.list(), [syncTick, currentActor]);
  const teachers = useMemo(() => repositories.teachers.list(), [syncTick, currentActor]);
  const groups = useMemo(() => repositories.groups.list(), [syncTick, currentActor]);
  const rooms = useMemo(() => repositories.rooms.list(), [syncTick, currentActor]);
  const stages = useMemo(() => repositories.meta.getStages(), [syncTick, currentActor]);
  const sessions = useMemo(() => repositories.sessions.list(), [syncTick, currentActor]);
  const attendanceRecords = useMemo(
    () => repositories.attendanceRecords.list(),
    [syncTick, currentActor]
  );
  const invoices = useMemo(() => repositories.invoices.list(), [syncTick, currentActor]);
  const payments = useMemo(() => repositories.payments.list(), [syncTick, currentActor]);
  const discounts = useMemo(() => repositories.discounts.list(), [syncTick, currentActor]);
  const expenses = useMemo(() => repositories.expenses.list(), [syncTick, currentActor]);
  const settlements = useMemo(() => repositories.settlements.list(), [syncTick, currentActor]);
  const messages = useMemo(() => repositories.messages.list(), [syncTick, currentActor]);
  const assessments = useMemo(() => repositories.assessments.list(), [syncTick, currentActor]);
  const activityLog = useMemo(() => repositories.activityLog.list(), [syncTick, currentActor]);
  const consents = useMemo(() => repositories.consents.list(), [syncTick, currentActor]);
  const faceTemplates = useMemo(
    () => repositories.faceTemplates.list(),
    [syncTick, currentActor]
  );
  const studentAccounts = useMemo(
    () => repositories.studentAccounts.list(),
    [syncTick, currentActor]
  );
  const studentSessions = useMemo(
    () => repositories.studentSessions.list(),
    [syncTick, currentActor]
  );
  const webhookEvents = useMemo(
    () => repositories.webhookEvents.list(),
    [syncTick, currentActor]
  );
  const fileAssets = useMemo(
    () => repositories.fileAssets.list(),
    [syncTick, currentActor]
  );
  const notifications = useMemo(
    () => repositories.notifications.list(),
    [syncTick, currentActor]
  );
  const templates = useMemo(() => repositories.meta.getTemplates(), [syncTick, currentActor]);
  const users = useMemo(() => repositories.users.list(), [syncTick, currentActor]);
  const centerSettings = useMemo(
    () => repositories.meta.getCenterSettings(),
    [syncTick, currentActor]
  );
  const scheduledJobs = useMemo(() => {
    if (!can(currentActor, 'view', 'scheduledJobs')) return [];
    const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
    const defs = defaultJobScheduler.getRegisteredDefinitions();
    const stored = repositories.scheduledJobRuns.list({ centerId: cid });
    const byName = new Map(stored.map((j) => [j.jobName, j]));
    const fallbackNow = Date.now();
    return defs.map((def) => {
      const existing = byName.get(def.name);
      if (existing) return existing;
      return {
        id: `pending-${def.name}`,
        centerId: cid,
        jobName: def.name,
        label: def.label,
        scheduleLabel: def.scheduleLabel,
        intervalMs: def.intervalMs,
        enabled: true,
        nextRunAt: new Date(fallbackNow + def.intervalMs).toISOString(),
        lastSummary: 'لم يتم التشغيل بعد',
        runCount: 0,
      };
    });
  }, [syncTick, currentActor]);
  const studentPortalAvailable = isStudentPortalEnabled(centerSettings);

  const currentUser = useMemo(
    () => (authSession ? users.find((u) => u.id === authSession.userId) || null : null),
    [authSession, users]
  );

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => students[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(() => teachers[0]?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(() => sessions[0]?.id || '');
  const [lastSavedSessionId, setLastSavedSessionId] = useState<string | null>(null);

  // Student drawer
  const [studentDrawerOpen, setStudentDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Payment drawer & receipt
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [paymentPreselectedStudentId, setPaymentPreselectedStudentId] = useState<string | null>(
    null
  );
  const [paymentPreselectedInvoiceId, setPaymentPreselectedInvoiceId] = useState<string | null>(
    null
  );
  const [activeReceipt, setActiveReceipt] = useState<PaymentRecord | null>(null);

  // Group drawer
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [prefilledSlot, setPrefilledSlot] = useState<PrefilledGroupSlot | null>(null);

  // Locked feature modal
  const [lockedFeatureModal, setLockedFeatureModal] = useState<{
    open: boolean;
    featureName: string;
    requiredPlan: string;
  }>({
    open: false,
    featureName: '',
    requiredPlan: 'الباقة الاحترافية',
  });

  // PDF Export Modal
  const [activePdfPayload, setActivePdfPayload] = useState<PdfDocumentPayload | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((title: string, type: ToastMessage['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Subscribe to LocalStorageAdapter updates (local writes + cross-tab 'storage' events)
  useEffect(() => {
    defaultStorageAdapter.setErrorHandler((msg) => showToast(msg, 'error'));
    const unsubscribe = defaultStorageAdapter.subscribe(() => {
      setSyncTick((t) => t + 1);
      const nextSession = authService.getPersistedSession();
      const nextStudentSession = studentAuthService.getPersistedStudentSession();
      setAuthSession(nextSession);
      setStudentAuthSession((prev) => {
        if (prev && !nextStudentSession && !nextSession) {
          setCurrentScreen(ScreenId.STUDENT_LOGIN);
        }
        return nextStudentSession;
      });
      setDemoModeState(authService.getDemoMode());
    });
    return () => {
      unsubscribe();
      defaultStorageAdapter.setErrorHandler(null);
    };
  }, [showToast]);

  // Listen to browser hash URL changes so manual URL access (e.g. #/dashboard as student) is checked strictly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const requested = parseScreenFromHash(window.location.hash);
      if (!requested) return;
      const activeStudent = studentAuthService.getPersistedStudentSession();
      const activeStaff = authService.getPersistedSession();

      if (activeStudent) {
        if (requested === ScreenId.STUDENT_LOGIN) {
          setCurrentScreen(ScreenId.STUDENT_PORTAL);
          return;
        }
        // If student attempts any staff screen by URL, set currentScreen so ScreenRouter blocks it via AccessDeniedScreen
        setCurrentScreen(requested);
        return;
      }

      if (!activeStaff) {
        if (PUBLIC_SCREENS.has(requested)) {
          setCurrentScreen(requested);
        } else if (requested === ScreenId.STUDENT_PORTAL) {
          setIntendedScreen(ScreenId.STUDENT_PORTAL);
          setCurrentScreen(ScreenId.STUDENT_LOGIN);
        } else {
          setIntendedScreen(requested);
          setCurrentScreen(ScreenId.LOGIN);
        }
        return;
      }

      setCurrentScreen(requested);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const appendActivityLog = useCallback(
    (entry: {
      action: string;
      resource: string;
      resourceId?: string;
      summary: string;
      before?: unknown;
      after?: unknown;
    }) => {
      const actor = authService.getPersistedSession();
      runWithSystemActor(() => {
        repositories.activityLog.create({
          centerId: actor?.centerId || DEFAULT_CENTER_ID,
          actorId: actor?.userId || 'system',
          actorName: actor?.name || 'النظام',
          actorRole: currentActor?.role || actor?.role || currentRole,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          summary: entry.summary,
          before: entry.before,
          after: entry.after,
          timestamp: new Date().toISOString(),
        });
      });
    },
    [currentActor?.role, currentRole]
  );

  const runPermitted = useCallback(
    <T,>(fn: () => T, fallback?: T): T => {
      try {
        return fn();
      } catch (err) {
        if (err instanceof PermissionError) {
          showToast(err.message, 'error');
          return fallback as T;
        }
        throw err;
      }
    },
    [showToast]
  );

  const syncUrlHash = useCallback((screen: ScreenId) => {
    if (typeof window === 'undefined') return;
    const targetHash = `#/${screen}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, []);

  const navigate = useCallback(
    (screen: ScreenId) => {
      clearViewQueryParam();
      const activeStudent = studentAuthService.getPersistedStudentSession();
      const activeStaff = authService.getPersistedSession();

      if (activeStudent) {
        if (screen === ScreenId.STUDENT_LOGIN) {
          setCurrentScreen(ScreenId.STUDENT_PORTAL);
          syncUrlHash(ScreenId.STUDENT_PORTAL);
          return;
        }
        if (
          !canAccessScreen(
            {
              userId: activeStudent.studentId,
              role: UserRole.STUDENT,
              centerId: activeStudent.centerId,
              studentId: activeStudent.studentId,
            },
            screen
          )
        ) {
          showToast('ليس لديك صلاحية للوصول إلى صفحات الإدارة', 'error');
          setCurrentScreen(ScreenId.STUDENT_PORTAL);
          syncUrlHash(ScreenId.STUDENT_PORTAL);
          return;
        }
        setCurrentScreen(screen);
        syncUrlHash(screen);
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        return;
      }

      if (!PUBLIC_SCREENS.has(screen) && !activeStaff) {
        if (screen === ScreenId.STUDENT_PORTAL) {
          setIntendedScreen(ScreenId.STUDENT_PORTAL);
          setCurrentScreen(ScreenId.STUDENT_LOGIN);
          syncUrlHash(ScreenId.STUDENT_LOGIN);
          showToast('يرجى تسجيل الدخول بكود الطالب للمتابعة', 'info');
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          return;
        }
        setIntendedScreen(screen);
        setCurrentScreen(ScreenId.LOGIN);
        syncUrlHash(ScreenId.LOGIN);
        showToast('يرجى تسجيل الدخول للمتابعة إلى لوحة التحكم', 'info');
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        return;
      }
      if (activeStaff && currentActor && !canAccessScreen(currentActor, screen)) {
        const fallbackScreen = getDefaultHomeScreen(currentActor);
        showToast('ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
        setCurrentScreen(fallbackScreen);
        syncUrlHash(fallbackScreen);
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        return;
      }
      setCurrentScreen(screen);
      syncUrlHash(screen);
      if (!PUBLIC_SCREENS.has(screen)) {
        authService.setLastScreen(screen);
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [currentActor, showToast, syncUrlHash]
  );

  const setDemoMode = useCallback(
    (enabled: boolean) => {
      if (authSession?.role !== UserRole.OWNER) {
        showToast('تفعيل وضع معاينة الأدوار متاح لمالك السنتر فقط', 'error');
        return;
      }
      authService.setDemoMode(enabled);
      setDemoModeState(enabled);
      if (!enabled) setPreviewRole(null);
      appendActivityLog({
        action: 'settings.demo_mode',
        resource: 'centerSettings',
        summary: enabled
          ? 'تفعيل وضع معاينة الأدوار (Demo Mode)'
          : 'إيقاف وضع معاينة الأدوار (Demo Mode)',
        after: { demoMode: enabled },
      });
      showToast(
        enabled ? 'تم تفعيل وضع معاينة الأدوار للمالك' : 'تم إيقاف وضع معاينة الأدوار',
        'info'
      );
    },
    [authSession?.role, appendActivityLog, showToast]
  );

  const setCurrentRole = useCallback(
    (role: UserRole) => {
      if (!canUseRoleSwitcher) {
        showToast('تبديل الدور غير متاح للحسابات العادية', 'error');
        return;
      }
      const prev = currentRole;
      setPreviewRole(role);
      if (role === UserRole.TEACHER) {
        setSelectedTeacherId(authSession?.teacherId || teachers[0]?.id || '');
      }
      if (role === UserRole.PARENT) {
        setCurrentScreen(ScreenId.PARENT_PORTAL);
      } else if (currentScreen === ScreenId.PARENT_PORTAL) {
        setCurrentScreen(ScreenId.DASHBOARD);
      }
      appendActivityLog({
        action: 'role.preview_switch',
        resource: 'authSession',
        summary: `معاينة النظام بدور (${role})`,
        before: { role: prev },
        after: { role },
      });
    },
    [authSession?.teacherId, teachers, canUseRoleSwitcher, currentRole, currentScreen, appendActivityLog, showToast]
  );

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string): Promise<LoginResult> => {
      const result = await authService.loginWithCredentials(identifier, password);
      if (result.ok && result.session) {
        clearViewQueryParam();
        defaultStorageAdapter.removeRawValue(STUDENT_AUTH_SESSION_STORAGE_KEY);
        setStudentAuthSession(null);
        const nextActor: PermissionActor = {
          userId: result.session.userId,
          role: result.session.role,
          centerId: result.session.centerId,
          teacherId: result.session.teacherId,
          studentId: result.session.studentId,
          guardianId: result.session.guardianId,
          parentPhone: result.session.parentPhone,
        };
        setActivePermissionActor(nextActor);
        setAuthSession(result.session);
        setPreviewRole(null);
        if (result.session.role === UserRole.TEACHER && result.session.teacherId) {
          setSelectedTeacherId(result.session.teacherId);
        }
        const defaultHome = getDefaultHomeScreen(nextActor);
        const dest =
          intendedScreen && canAccessScreen(nextActor, intendedScreen)
            ? intendedScreen
            : defaultHome;
        setIntendedScreen(null);
        setCurrentScreen(dest);
        syncUrlHash(dest);
        if (!PUBLIC_SCREENS.has(dest)) {
          authService.setLastScreen(dest);
        }
        showToast(`مرحباً ${result.session.name} — تم تسجيل الدخول بنجاح`);
      }
      return result;
    },
    [intendedScreen, showToast, syncUrlHash]
  );

  const activateParentByPhone = useCallback(
    async (phone: string, newPassword: string): Promise<LoginResult> => {
      const result = await authService.activateParentByPhone(phone, newPassword);
      if (result.ok && result.session) {
        clearViewQueryParam();
        defaultStorageAdapter.removeRawValue(STUDENT_AUTH_SESSION_STORAGE_KEY);
        setStudentAuthSession(null);
        const nextActor: PermissionActor = {
          userId: result.session.userId,
          role: result.session.role,
          centerId: result.session.centerId,
          guardianId: result.session.guardianId,
          parentPhone: result.session.parentPhone,
        };
        setActivePermissionActor(nextActor);
        setAuthSession(result.session);
        setPreviewRole(null);
        setCurrentScreen(ScreenId.PARENT_PORTAL);
        syncUrlHash(ScreenId.PARENT_PORTAL);
        showToast('تم تفعيل حساب ولي الأمر بنجاح');
      }
      return result;
    },
    [showToast, syncUrlHash]
  );

  const logout = useCallback(() => {
    clearViewQueryParam();
    authService.logout(authSession);
    setActivePermissionActor(null);
    setAuthSession(null);
    setPreviewRole(null);
    setIntendedScreen(null);
    setCurrentScreen(ScreenId.LOGIN);
    syncUrlHash(ScreenId.LOGIN);
    showToast('تم تسجيل الخروج بنجاح', 'info');
  }, [authSession, showToast, syncUrlHash]);

  // Student Portal Actions (Phase 11)
  const issueStudentAccessCode = useCallback<EduflowContextValue['issueStudentAccessCode']>(
    async (studentId, isRegenerate) => {
      try {
        const res = await studentAuthService.createOrRegenerateAccessCode(
          studentId,
          currentActor,
          { isRegenerate }
        );
        showToast(
          isRegenerate
            ? 'تم إعادة توليد كود الدخول وإنهاء كل الجلسات السابقة'
            : 'تم إنشاء كود دخول منصة الطالب بنجاح'
        );
        return res;
      } catch (err) {
        if (err instanceof PermissionError) {
          showToast(err.message, 'error');
          return null;
        }
        throw err;
      }
    },
    [currentActor, showToast]
  );

  const bulkGenerateStudentSlips = useCallback<EduflowContextValue['bulkGenerateStudentSlips']>(
    async (studentIds) => {
      try {
        const items = await studentAuthService.bulkGenerateCodesForPrint(
          studentIds,
          currentActor
        );
        if (items.length > 0) {
          showToast(`تم تجهيز ${items.length} بطاقة دخول جاهزة للطباعة`);
        }
        return items;
      } catch (err) {
        if (err instanceof PermissionError) {
          showToast(err.message, 'error');
          return [];
        }
        throw err;
      }
    },
    [currentActor, showToast]
  );

  const toggleStudentPortalAccountStatus = useCallback<
    EduflowContextValue['toggleStudentPortalAccountStatus']
  >(
    (studentId, nextStatus) =>
      runPermitted(() => {
        const updated = studentAuthService.suspendOrActivateAccount(
          studentId,
          nextStatus,
          currentActor
        );
        if (!updated) return false;
        showToast(
          nextStatus === 'suspended'
            ? 'تم إيقاف حساب الطالب وإنهاء جلساته النشطة'
            : 'تم تفعيل حساب منصة الطالب',
          nextStatus === 'suspended' ? 'info' : 'success'
        );
        return true;
      }, false),
    [currentActor, runPermitted, showToast]
  );

  const revokeAllStudentPortalSessions = useCallback<
    EduflowContextValue['revokeAllStudentPortalSessions']
  >(
    (studentId) =>
      runPermitted(() => {
        const count = studentAuthService.revokeAllStudentSessions(studentId, currentActor);
        const nextSess = studentAuthService.getPersistedStudentSession();
        setStudentAuthSession(nextSess);
        showToast(
          count > 0 ? `تم إنهاء ${count} جلسات نشطة للطالب` : 'لا توجد جلسات نشطة حالياً',
          'info'
        );
        return count;
      }, 0),
    [currentActor, runPermitted, showToast]
  );

  const revokeSingleStudentPortalSession = useCallback<
    EduflowContextValue['revokeSingleStudentPortalSession']
  >(
    (sessionId) =>
      runPermitted(() => {
        const ok = studentAuthService.revokeSingleSession(sessionId, currentActor);
        if (ok) {
          const nextSess = studentAuthService.getPersistedStudentSession();
          setStudentAuthSession(nextSess);
          if (!nextSess && currentRole === UserRole.STUDENT) {
            setCurrentScreen(ScreenId.STUDENT_LOGIN);
            syncUrlHash(ScreenId.STUDENT_LOGIN);
          }
          showToast('تم تسجيل الخروج من الجهاز المحدد بنجاح', 'info');
        }
        return ok;
      }, false),
    [currentActor, currentRole, runPermitted, showToast, syncUrlHash]
  );

  const loginStudentWithCode = useCallback<EduflowContextValue['loginStudentWithCode']>(
    async (params) => {
      const res = await studentAuthService.loginWithCode(params);
      if (res.ok && res.session) {
        clearViewQueryParam();
        const nextActor: PermissionActor = {
          userId: res.session.studentId,
          role: UserRole.STUDENT,
          centerId: res.session.centerId,
          studentId: res.session.studentId,
        };
        setAuthSession(null);
        setPreviewRole(null);
        setActivePermissionActor(nextActor);
        setStudentAuthSession(res.session);
        setCurrentScreen(ScreenId.STUDENT_PORTAL);
        syncUrlHash(ScreenId.STUDENT_PORTAL);
        showToast(`مرحباً ${res.session.studentName} في بوابة الطالب`);
      }
      return res;
    },
    [showToast, syncUrlHash]
  );

  const completeStudentFirstLoginPin = useCallback<
    EduflowContextValue['completeStudentFirstLoginPin']
  >(
    async (params) => {
      const res = await studentAuthService.completeFirstLoginPinSetup(params);
      if (res.ok && res.session) {
        clearViewQueryParam();
        const nextActor: PermissionActor = {
          userId: res.session.studentId,
          role: UserRole.STUDENT,
          centerId: res.session.centerId,
          studentId: res.session.studentId,
        };
        setAuthSession(null);
        setPreviewRole(null);
        setActivePermissionActor(nextActor);
        setStudentAuthSession(res.session);
        setCurrentScreen(ScreenId.STUDENT_PORTAL);
        syncUrlHash(ScreenId.STUDENT_PORTAL);
        showToast('تم تعيين رمز المرور وتفعيل دخولك بنجاح');
      }
      return res;
    },
    [showToast, syncUrlHash]
  );

  const changeStudentPortalPin = useCallback<EduflowContextValue['changeStudentPortalPin']>(
    async (oldPin, newPin) => {
      if (!studentAuthSession) return { ok: false, error: 'لا توجد جلسة طالب نشطة.' };
      const res = await studentAuthService.changeStudentPin({
        studentId: studentAuthSession.studentId,
        oldPin,
        newPin,
      });
      if (res.ok) {
        showToast('تم تحديث رمز المرور (PIN) بنجاح');
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      return res;
    },
    [studentAuthSession, showToast]
  );

  const logoutStudent = useCallback(() => {
    clearViewQueryParam();
    studentAuthService.logoutCurrentDevice(studentAuthSession);
    setActivePermissionActor(null);
    setStudentAuthSession(null);
    setCurrentScreen(ScreenId.STUDENT_LOGIN);
    syncUrlHash(ScreenId.STUDENT_LOGIN);
    showToast('تم تسجيل خروجك من بوابة الطالب', 'info');
  }, [studentAuthSession, showToast, syncUrlHash]);

  const resetPasswordByEmail = useCallback(
    async (email: string, newPassword: string) => {
      const res = await authService.resetPasswordByEmail(email, newPassword);
      if (res.ok) {
        showToast('تم تحديث كلمة السر بنجاح. يمكنك الدخول الآن.');
      }
      return res;
    },
    [showToast]
  );

  const changeMyPassword = useCallback(
    async (oldPassword: string, newPassword: string, displayName?: string) => {
      if (!authSession) return { ok: false, error: 'لا توجد جلسة دخول نشطة.' };
      const res = await authService.changePassword(
        authSession.userId,
        oldPassword,
        newPassword,
        displayName
      );
      if (res.ok) {
        setAuthSession(authService.getPersistedSession());
        showToast('تم تحديث بيانات حسابك الشخصي بنجاح');
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      return res;
    },
    [authSession, showToast]
  );

  const registerCenterOwner = useCallback(
    async (payload: Parameters<typeof authService.registerCenterOwner>[0]) => {
      clearViewQueryParam();
      defaultStorageAdapter.removeRawValue(STUDENT_AUTH_SESSION_STORAGE_KEY);
      setStudentAuthSession(null);
      const session = await authService.registerCenterOwner(payload);
      setAuthSession(session);
      setPreviewRole(null);
      return session;
    },
    []
  );

  // Backup / Restore / Reset
  const exportBackupJson = useCallback(() => {
    const payload = defaultStorageAdapter.exportBackup();
    appendActivityLog({
      action: 'data.backup_export',
      resource: 'centers',
      resourceId: payload.centerId,
      summary: `تصدير نسخة احتياطية JSON (${payload.collections.students.length} طالب، ${payload.collections.payments.length} دفعة)`,
    });
    defaultStorageAdapter.flush();
    return payload;
  }, [appendActivityLog]);

  const validateBackupJson = useCallback(
    (payload: unknown) => defaultStorageAdapter.validateBackup(payload),
    []
  );

  const importBackupJson = useCallback(
    (payload: unknown) => {
      const restored = defaultStorageAdapter.importBackup(payload);
      appendActivityLog({
        action: 'data.backup_restore',
        resource: 'centers',
        resourceId: restored.centerId,
        summary: `استعادة نسخة احتياطية JSON (${restored.collections.students.length} طالب، ${restored.collections.payments.length} دفعة)`,
      });
      defaultStorageAdapter.flush();
      showToast('تمت استعادة النسخة الاحتياطية بنجاح');
      return restored;
    },
    [appendActivityLog, showToast]
  );

  const resetDemoData = useCallback(() => {
    defaultStorageAdapter.resetToSeed();
    appendActivityLog({
      action: 'data.seed_reset',
      resource: 'centers',
      resourceId: DEFAULT_CENTER_ID,
      summary: 'إعادة تعيين جميع بيانات السنتر إلى البيانات التجريبية الافتراضية',
    });
    defaultStorageAdapter.flush();
    showToast('تمت إعادة تعيين البيانات التجريبية بنجاح', 'info');
  }, [appendActivityLog, showToast]);

  // Student CRUD via repositories
  const openAddStudent = useCallback(() => {
    setEditingStudent(null);
    setStudentDrawerOpen(true);
  }, []);

  const openEditStudent = useCallback((student: Student) => {
    setEditingStudent(student);
    setStudentDrawerOpen(true);
  }, []);

  const closeStudentDrawer = useCallback(() => {
    setStudentDrawerOpen(false);
    setEditingStudent(null);
  }, []);

  const saveStudent = useCallback<EduflowContextValue['saveStudent']>(
    (data, existingId) =>
      runPermitted(() => {
        if (existingId) {
          const before = repositories.students.get(existingId);
          const updated = repositories.students.update(existingId, {
            ...data,
            fullName: data.name,
            parent: { name: data.parentName, phone: data.parentPhone },
          });
          appendActivityLog({
            action: 'student.update',
            resource: 'students',
            resourceId: existingId,
            summary: `تحديث بيانات الطالب "${data.name}"`,
            before: before ? { name: before.name, groupIds: before.groupIds } : undefined,
            after: { name: data.name, groupIds: data.groupIds },
          });
          showToast('تم حفظ تعديلات بيانات الطالب بنجاح');
          return updated!;
        }

        const created = repositories.students.create({
          ...data,
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          code: '',
          fullName: data.name,
          parent: { name: data.parentName, phone: data.parentPhone },
          paymentStatus: 'pending',
          lastAttendance: 'لم يحضر بعد',
          attendanceRate: 100,
          notes: [],
          createdAt: new Date().toISOString(),
        });
        appendActivityLog({
          action: 'student.create',
          resource: 'students',
          resourceId: created.id,
          summary: `إضافة طالب جديد "${created.name}" (${created.code})`,
          after: { id: created.id, code: created.code, name: created.name },
        });
        showToast(`تمت إضافة الطالب "${created.name}" (${created.code}) بنجاح`);
        return created;
      }),
    [authSession?.centerId, appendActivityLog, runPermitted, showToast]
  );

  const deactivateStudent = useCallback(
    (studentId: string) =>
      runPermitted(() => {
        const before = repositories.students.get(studentId);
        repositories.students.update(studentId, { status: 'inactive' });
        appendActivityLog({
          action: 'student.deactivate',
          resource: 'students',
          resourceId: studentId,
          summary: `إيقاف قيد الطالب "${before?.name || studentId}"`,
          before: { status: before?.status },
          after: { status: 'inactive' },
        });
        showToast('تم إيقاف قيد الطالب بنجاح', 'info');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const bulkMoveStudentsToGroup = useCallback(
    (studentIds: string[], groupId: string) =>
      runPermitted(() => {
        studentIds.forEach((sid) => {
          const st = repositories.students.get(sid);
          if (!st) return;
          const nextGroups = st.groupIds.includes(groupId) ? st.groupIds : [...st.groupIds, groupId];
          repositories.students.update(sid, { groupIds: nextGroups });
        });
        appendActivityLog({
          action: 'student.bulk_move',
          resource: 'students',
          summary: `نقل ${studentIds.length} طلاب إلى مجموعة جديدة`,
          after: { studentIds, groupId },
        });
        showToast(`تم نقل ${studentIds.length} طلاب إلى المجموعة المختارة`);
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const bulkDeactivateStudents = useCallback(
    (studentIds: string[]) =>
      runPermitted(() => {
        studentIds.forEach((sid) => {
          repositories.students.update(sid, { status: 'inactive' });
        });
        appendActivityLog({
          action: 'student.bulk_deactivate',
          resource: 'students',
          summary: `إيقاف قيد ${studentIds.length} طلاب`,
          after: { studentIds, status: 'inactive' },
        });
        showToast(`تم إيقاف ${studentIds.length} طلاب`, 'info');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const addStudentNote = useCallback(
    (studentId: string, text: string) =>
      runPermitted(() => {
        const st = repositories.students.get(studentId);
        if (!st) return;
        const actorName = authSession?.name || 'إدارة السنتر';
        const note = {
          id: `n-${Date.now()}`,
          date: formatDateDDMMYYYY(new Date()),
          author: `${actorName} (${currentRole})`,
          text,
        };
        repositories.students.update(studentId, { notes: [note, ...st.notes] });
        showToast('تمت إضافة الملاحظة إلى سجل الطالب');
      }),
    [authSession?.name, currentRole, runPermitted, showToast]
  );

  // Payments via repositories
  const openRecordPayment = useCallback((studentId?: string, invoiceId?: string) => {
    setPaymentPreselectedStudentId(studentId || null);
    setPaymentPreselectedInvoiceId(invoiceId || null);
    setPaymentDrawerOpen(true);
  }, []);

  const closeRecordPayment = useCallback(() => {
    setPaymentDrawerOpen(false);
    setPaymentPreselectedStudentId(null);
    setPaymentPreselectedInvoiceId(null);
  }, []);

  const recordPayment = useCallback(
    (payload: {
      invoiceId: string;
      amount: number;
      method: PaymentRecord['method'];
      date: string;
      note?: string;
    }): PaymentRecord | null =>
      runPermitted(() => {
        const targetInvoice = repositories.invoices.get(payload.invoiceId);
        if (!targetInvoice) return null;

        const newPaid = targetInvoice.paid + payload.amount;
        const remainingAfter = Math.max(0, targetInvoice.total - newPaid);
        const nextStatus = computeInvoiceStatus(
          targetInvoice.total,
          newPaid,
          remainingAfter === 0 ? 0 : targetInvoice.daysOverdue
        );

        const actorName = authSession?.name || 'إدارة السنتر';
        const receipt = repositories.payments.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          receiptNumber: `RCP-${Math.floor(8850 + Math.random() * 900)}`,
          invoiceId: targetInvoice.id,
          studentId: targetInvoice.studentId,
          groupId: targetInvoice.groupId,
          amount: payload.amount,
          remainingAfter,
          method: payload.method,
          date: payload.date,
          recordedBy: `${actorName} (${currentRole})`,
          note: payload.note,
        });

        runWithSystemActor(() => {
          repositories.invoices.update(targetInvoice.id, {
            paid: newPaid,
            status: nextStatus,
            daysOverdue: remainingAfter === 0 ? 0 : targetInvoice.daysOverdue,
          });
          repositories.students.update(targetInvoice.studentId, { paymentStatus: nextStatus });
        });

        appendActivityLog({
          action: 'payment.create',
          resource: 'payments',
          resourceId: receipt.id,
          summary: `تسجيل دفعة ${payload.amount} ج (${receipt.receiptNumber}) لفاتورة ${targetInvoice.invoiceNumber}`,
          before: { paid: targetInvoice.paid, status: targetInvoice.status },
          after: { paid: newPaid, status: nextStatus, amount: payload.amount, method: payload.method },
        });

        showToast(`تم تسجيل الدفعة وإصدار الإيصال رقم ${receipt.receiptNumber}`);
        return receipt;
      }, null),
    [authSession, currentRole, appendActivityLog, runPermitted, showToast]
  );

  const logExcelExport = useCallback(
    (label: string) => {
      appendActivityLog({
        action: 'export.excel',
        resource: 'reports',
        summary: `تصدير ملف Excel/CSV: ${label}`,
        after: { label },
      });
    },
    [appendActivityLog]
  );

  const generateMonthlyInvoices = useCallback(
    (monthInput: string, groupIds: string[], dueDay = 1) =>
      runPermitted(
        () => {
          const currentInvoices = repositories.invoices.list();
          const allStudents = repositories.students.list();
          const allGroups = repositories.groups.list();
          const settings = repositories.meta.getCenterSettings();
          const preview = previewBulkInvoices({
            students: allStudents,
            groups: allGroups,
            existingInvoices: currentInvoices,
            monthInput,
            groupIds,
            dueDay,
            discountPolicy: settings.discountPolicy,
          });

          if (preview.itemsToCreate.length === 0) {
            showToast(
              `لم يتم إنشاء فواتير جديدة (تم تخطي ${preview.skippedCount} فاتورة مُنشأة مسبقاً)`,
              'info'
            );
            return { createdCount: 0, skippedCount: preview.skippedCount, batchId: null };
          }

          const batchId = `batch-${Date.now()}`;
          const actorName = authSession?.name || 'إدارة السنتر';
          let seq = currentInvoices.length + 110;

          preview.itemsToCreate.forEach((item) => {
            seq += 1;
            const invNum = `INV-${preview.monthKey.replace('-', '')}-${seq}`;
            const createdInv = repositories.invoices.create({
              centerId: authSession?.centerId || DEFAULT_CENTER_ID,
              number: invNum,
              invoiceNumber: invNum,
              studentId: item.student.id,
              groupId: item.group.id,
              month: preview.monthLabel,
              monthKey: preview.monthKey,
              batchId,
              baseAmount: item.baseAmount,
              discountLines: item.discountLines,
              netAmount: item.netAmount,
              isScholarshipFree: item.isScholarshipFree,
              dueDate: preview.dueDate,
              daysOverdue: 0,
              total: item.netAmount,
              paid: 0,
              status: item.netAmount === 0 ? 'paid' : 'pending',
              createdAt: new Date().toISOString(),
            });

            if (item.discountLines.length > 0 && item.discountTotal > 0) {
              runWithSystemActor(() => {
                repositories.discounts.create({
                  centerId: authSession?.centerId || DEFAULT_CENTER_ID,
                  studentId: item.student.id,
                  invoiceId: createdInv.id,
                  title: item.discountLines.map((d) => d.label).join(' + '),
                  type: 'fixed',
                  category: item.discountLines[0]?.type || 'sibling',
                  value: item.discountTotal,
                  amount: item.discountTotal,
                  reason: 'تطبيق تلقائي عند إصدار الفواتير الشهرية',
                  createdBy: actorName,
                  createdAt: new Date().toISOString(),
                });
              });
            }
          });

          appendActivityLog({
            action: 'invoice.generate_batch',
            resource: 'invoices',
            resourceId: batchId,
            summary: `توليد ${preview.itemsToCreate.length} فاتورة لشهر ${preview.monthLabel} (تم تخطي ${preview.skippedCount})`,
            after: {
              batchId,
              createdCount: preview.itemsToCreate.length,
              skippedCount: preview.skippedCount,
              month: preview.monthLabel,
              totalNet: preview.totalNet,
            },
          });
          showToast(
            `تم إصدار ${preview.itemsToCreate.length} فاتورة لشهر ${preview.monthLabel}${
              preview.skippedCount > 0 ? ` (تخطي ${preview.skippedCount} مكررة)` : ''
            }`
          );
          return {
            createdCount: preview.itemsToCreate.length,
            skippedCount: preview.skippedCount,
            batchId,
          };
        },
        { createdCount: 0, skippedCount: 0, batchId: null }
      ),
    [authSession?.centerId, authSession?.name, appendActivityLog, runPermitted, showToast]
  );

  const deleteInvoiceBatch = useCallback(
    (batchId: string): boolean =>
      runPermitted(() => {
        const all = repositories.invoices.list();
        if (!canDeleteInvoiceBatch(all, batchId)) {
          showToast('لا يمكن حذف الدفعة لوجود مدفوعات مسجلة على إحدى فواتيرها', 'error');
          return false;
        }
        const toDelete = all.filter((inv) => inv.batchId === batchId);
        toDelete.forEach((inv) => {
          repositories.invoices.remove(inv.id);
        });
        appendActivityLog({
          action: 'invoice.delete_batch',
          resource: 'invoices',
          resourceId: batchId,
          summary: `حذف دفعة فواتير (${toDelete.length} فاتورة غير مسددة)`,
          before: { count: toDelete.length, invoiceIds: toDelete.map((i) => i.id) },
        });
        showToast(`تم حذف دفعة الفواتير (${toDelete.length} فاتورة)`, 'info');
        return true;
      }, false),
    [appendActivityLog, runPermitted, showToast]
  );

  const applyInvoiceDiscount = useCallback<EduflowContextValue['applyInvoiceDiscount']>(
    (payload) =>
      runPermitted(() => {
        const inv = repositories.invoices.get(payload.invoiceId);
        if (!inv) return false;
        const result = applyDiscountToInvoiceState({
          invoice: inv,
          category: payload.category,
          mode: payload.mode,
          value: payload.value,
          reason: payload.reason,
        });
        if (!result.ok || !result.updatedInvoice) {
          showToast(result.error || 'تعذر تطبيق الخصم', 'error');
          return false;
        }

        const actorName = authSession?.name || 'إدارة السنتر';
        repositories.discounts.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          studentId: inv.studentId,
          invoiceId: inv.id,
          title: result.updatedInvoice.discountLines.slice(-1)[0]?.label || payload.reason,
          type: payload.mode,
          category: payload.category,
          value: payload.value,
          amount: result.appliedAmount || 0,
          reason: payload.reason.trim(),
          createdBy: `${actorName} (${currentRole})`,
          createdAt: new Date().toISOString(),
        });

        repositories.invoices.update(inv.id, {
          baseAmount: result.updatedInvoice.baseAmount,
          discountLines: result.updatedInvoice.discountLines,
          netAmount: result.updatedInvoice.netAmount,
          total: result.updatedInvoice.total,
          isScholarshipFree: result.updatedInvoice.isScholarshipFree,
          status: result.updatedInvoice.status,
          daysOverdue: result.updatedInvoice.daysOverdue,
        });

        runWithSystemActor(() => {
          repositories.students.update(inv.studentId, {
            paymentStatus: result.updatedInvoice!.status,
          });
        });

        appendActivityLog({
          action: 'discount.apply',
          resource: 'discounts',
          resourceId: inv.id,
          summary: `تطبيق خصم (${result.appliedAmount} ج) على فاتورة ${inv.invoiceNumber} — السبب: ${payload.reason.trim()}`,
          before: { netAmount: inv.netAmount, status: inv.status },
          after: {
            netAmount: result.updatedInvoice.netAmount,
            status: result.updatedInvoice.status,
            reason: payload.reason.trim(),
          },
        });

        showToast('تم تطبيق الخصم وتحديث صافي الفاتورة بنجاح');
        return true;
      }, false),
    [authSession?.centerId, authSession?.name, currentRole, appendActivityLog, runPermitted, showToast]
  );

  const settleTeacherMonth = useCallback<EduflowContextValue['settleTeacherMonth']>(
    (payload) =>
      runPermitted(() => {
        const teacher = repositories.teachers.get(payload.teacherId);
        if (!teacher) return null;
        const calc = calculateTeacherSettlement({
          teacher,
          groups: repositories.groups.list(),
          invoices: repositories.invoices.list(),
          payments: repositories.payments.list(),
          sessions: repositories.sessions.list(),
          settlements: repositories.settlements.list(),
          monthInput: payload.monthInput,
          basis: payload.basis,
          manualLines: payload.manualLines,
          applyCarryForward: payload.applyCarryForward,
        });

        const actorName = authSession?.name || 'إدارة السنتر';
        const settlement = repositories.settlements.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          teacherId: teacher.id,
          month: calc.monthLabel,
          monthKey: calc.monthKey,
          basis: payload.basis,
          collectedByGroup: calc.groupBreakdowns.map((b) => ({
            groupId: b.groupId,
            groupName: b.groupName,
            collected: b.collected,
          })),
          grossRevenue: calc.totalCollected,
          centerDeduction: calc.centerDeduction,
          teacherShare: calc.teacherGross,
          centerShare: calc.centerDeduction,
          manualLines: payload.manualLines,
          carriedForwardIn: calc.carriedForwardIn,
          carriedForwardOut: calc.carriedForwardOut,
          netPayable: calc.netPayable,
          amountPaid: Math.max(0, calc.netPayable),
          paymentMethod: payload.paymentMethod,
          status: 'settled',
          settledAt: new Date().toISOString().slice(0, 10),
          settledBy: `${actorName} (${currentRole})`,
          note: payload.note?.trim() || undefined,
        });

        if (payload.recordAsExpense && calc.netPayable > 0) {
          runWithSystemActor(() => {
            repositories.expenses.create({
              centerId: authSession?.centerId || DEFAULT_CENTER_ID,
              date: new Date().toISOString().slice(0, 10),
              category: 'رواتب',
              description: `تسوية مستحقات ${teacher.name} — ${calc.monthLabel}`,
              amount: calc.netPayable,
              addedBy: `${actorName} (${currentRole})`,
            });
          });
        }

        appendActivityLog({
          action: 'settlement.settle',
          resource: 'settlements',
          resourceId: settlement.id,
          summary: `تسوية وتسليم مستحقات ${teacher.name} لشهر ${calc.monthLabel} بصافي ${calc.netPayable} ج`,
          after: {
            teacherId: teacher.id,
            month: calc.monthLabel,
            basis: payload.basis,
            grossRevenue: calc.totalCollected,
            centerDeduction: calc.centerDeduction,
            netPayable: calc.netPayable,
            carriedForwardOut: calc.carriedForwardOut,
          },
        });

        showToast(`تمت تسوية مستحقات ${teacher.name} لشهر ${calc.monthLabel} بنجاح`);
        return settlement;
      }, null),
    [authSession?.centerId, authSession?.name, currentRole, appendActivityLog, runPermitted, showToast]
  );

  // Groups via repositories
  const openCreateGroup = useCallback((slot?: PrefilledGroupSlot) => {
    setEditingGroup(null);
    setPrefilledSlot(slot || null);
    setGroupDrawerOpen(true);
  }, []);

  const openEditGroup = useCallback((group: Group) => {
    setEditingGroup(group);
    setPrefilledSlot(null);
    setGroupDrawerOpen(true);
  }, []);

  const closeGroupDrawer = useCallback(() => {
    setGroupDrawerOpen(false);
    setEditingGroup(null);
    setPrefilledSlot(null);
  }, []);

  const saveGroup = useCallback<EduflowContextValue['saveGroup']>(
    (groupData, existingId) =>
      runPermitted(() => {
        const roomObj = repositories.rooms.get(groupData.roomId);
        const roomName = groupData.room || roomObj?.name || groupData.roomId;

        if (existingId) {
          const updated = repositories.groups.update(existingId, {
            ...groupData,
            room: roomName,
          });
          showToast('تم تحديث بيانات المجموعة بنجاح');
          return updated!;
        }
        const created = repositories.groups.create({
          ...groupData,
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          room: roomName,
        });
        showToast(`تم إنشاء المجموعة "${created.name}" بنجاح`);
        return created;
      }),
    [authSession?.centerId, runPermitted, showToast]
  );

  const updateGroupStudents = useCallback(
    (groupId: string, studentIds: string[]) =>
      runPermitted(() => {
        repositories.students.list().forEach((st) => {
          const shouldBeIn = studentIds.includes(st.id);
          const currentlyIn = st.groupIds.includes(groupId);
          if (shouldBeIn && !currentlyIn) {
            repositories.students.update(st.id, { groupIds: [...st.groupIds, groupId] });
          } else if (!shouldBeIn && currentlyIn) {
            repositories.students.update(st.id, {
              groupIds: st.groupIds.filter((id) => id !== groupId),
            });
          }
        });
        showToast('تم تحديث قائمة طلاب المجموعة');
      }),
    [runPermitted, showToast]
  );

  // Teachers via repositories
  const addOrUpdateTeacher = useCallback<EduflowContextValue['addOrUpdateTeacher']>(
    (teacherData, existingId) =>
      runPermitted(() => {
        const palette = ['#0F766E', '#1D4ED8', '#B45309', '#7E22CE', '#BE123C', '#047857'];
        const compensation =
          teacherData.compensationType === 'fixed_rent'
            ? {
                type: 'rent' as const,
                rentAmount: teacherData.compensationValue,
                rentMode: teacherData.rentMode || 'monthly',
              }
            : teacherData.compensationType === 'per_session'
            ? {
                type: 'per_session' as const,
                perSessionAmount: teacherData.compensationValue,
              }
            : {
                type: 'percent' as const,
                centerPercent: Math.max(0, 100 - teacherData.compensationValue),
              };

        if (existingId) {
          repositories.teachers.update(existingId, { ...teacherData, compensation });
          showToast('تم تحديث بيانات المدرس');
        } else {
          const currentCount = repositories.teachers.list().length;
          const created = repositories.teachers.create({
            ...teacherData,
            centerId: authSession?.centerId || DEFAULT_CENTER_ID,
            compensation,
            color: palette[currentCount % palette.length],
          });
          showToast(`تمت إضافة المدرس "${created.name}" بنجاح`);
        }
      }),
    [authSession?.centerId, runPermitted, showToast]
  );

  // Attendance via repositories (updates both sessions & attendanceRecords)
  const saveAttendanceSession = useCallback(
    (sessionId: string, entries: AttendanceEntry[]) =>
      runPermitted(() => {
        const preparedEntries: AttendanceEntry[] = entries.map((e) =>
          e.status === 'absent' ? { ...e, messageStatus: e.messageStatus || 'ready' } : e
        );
        repositories.sessions.update(sessionId, {
          status: 'recorded',
          savedAt: 'الآن',
          entries: preparedEntries,
        });

        const actorName = authSession?.name || 'إدارة السنتر';
        const nowIso = new Date().toISOString();
        const existingRecords = repositories.attendanceRecords
          .list()
          .filter((r) => r.sessionId === sessionId);

        preparedEntries.forEach((entry) => {
          const match = existingRecords.find((r) => r.studentId === entry.studentId);
          if (match) {
            repositories.attendanceRecords.update(match.id, {
              status: entry.status,
              method: match.method || 'manual',
              markedBy: actorName,
              markedAt: nowIso,
              note: entry.note,
            });
          } else {
            repositories.attendanceRecords.create({
              centerId: authSession?.centerId || DEFAULT_CENTER_ID,
              sessionId,
              studentId: entry.studentId,
              status: entry.status,
              method: 'manual',
              markedBy: actorName,
              markedAt: nowIso,
              note: entry.note,
            });
          }
        });

        setLastSavedSessionId(sessionId);
        showToast('تم حفظ الحضور وتجهيز رسائل أولياء الأمور للغائبين');
      }),
    [authSession?.centerId, authSession?.name, runPermitted, showToast]
  );

  const createMakeupSession = useCallback<EduflowContextValue['createMakeupSession']>(
    (payload) =>
      runPermitted(() => {
        const created = repositories.sessions.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          groupId: payload.groupId,
          date: payload.date,
          type: 'makeup',
          originalSessionId: payload.originalSessionId,
          timeLabel: payload.timeLabel,
          roomId: payload.roomId,
          status: 'pending',
          entries: payload.studentIds.map((sid) => ({
            studentId: sid,
            status: 'unrecorded',
          })),
        });
        appendActivityLog({
          action: 'session.makeup_create',
          resource: 'sessions',
          resourceId: created.id,
          summary: `إنشاء حصة تعويضية بتاريخ ${payload.date} (${payload.studentIds.length} طلاب)`,
          after: {
            sessionId: created.id,
            groupId: payload.groupId,
            originalSessionId: payload.originalSessionId,
            studentIds: payload.studentIds,
          },
        });
        setSelectedSessionId(created.id);
        showToast('تم إنشاء الحصة التعويضية بنجاح');
        return created;
      }, null),
    [authSession?.centerId, appendActivityLog, runPermitted, showToast]
  );

  const compensateAbsentStudent = useCallback<EduflowContextValue['compensateAbsentStudent']>(
    (payload) =>
      runPermitted(() => {
        const origSess = repositories.sessions.get(payload.originalSessionId);
        const makeupSess = repositories.sessions.get(payload.makeupSessionId);
        if (!origSess || !makeupSess) return false;

        const actorName = authSession?.name || 'إدارة السنتر';
        const nowIso = new Date().toISOString();

        // Mark in original session's attendanceRecord with compensatedBy
        const existingRec = repositories.attendanceRecords
          .list()
          .find(
            (r) => r.sessionId === origSess.id && r.studentId === payload.studentId
          );
        const beforeState = existingRec ? { compensatedBy: existingRec.compensatedBy } : null;

        if (existingRec) {
          repositories.attendanceRecords.update(existingRec.id, {
            compensatedBy: makeupSess.id,
            note: payload.note || existingRec.note || 'تم التعويض بحصة تعويضية',
          });
        } else {
          repositories.attendanceRecords.create({
            centerId: authSession?.centerId || DEFAULT_CENTER_ID,
            sessionId: origSess.id,
            studentId: payload.studentId,
            status: 'absent',
            method: 'manual',
            markedBy: actorName,
            markedAt: nowIso,
            compensatedBy: makeupSess.id,
            note: payload.note || 'تم التعويض بحصة تعويضية',
          });
        }

        // Update or append student as present in the makeup session
        const hasEntry = makeupSess.entries.some((e) => e.studentId === payload.studentId);
        const nextEntries: AttendanceEntry[] = hasEntry
          ? makeupSess.entries.map((e) =>
              e.studentId === payload.studentId
                ? { ...e, status: 'present', note: payload.note || 'تعويض غياب' }
                : e
            )
          : [
              ...makeupSess.entries,
              {
                studentId: payload.studentId,
                status: 'present',
                note: payload.note || 'تعويض غياب',
              },
            ];
        repositories.sessions.update(makeupSess.id, { entries: nextEntries });

        const makeupRec = repositories.attendanceRecords
          .list()
          .find(
            (r) => r.sessionId === makeupSess.id && r.studentId === payload.studentId
          );
        if (makeupRec) {
          repositories.attendanceRecords.update(makeupRec.id, {
            status: 'present',
            markedBy: actorName,
            markedAt: nowIso,
            note: payload.note || 'تعويض غياب',
          });
        } else {
          repositories.attendanceRecords.create({
            centerId: authSession?.centerId || DEFAULT_CENTER_ID,
            sessionId: makeupSess.id,
            studentId: payload.studentId,
            status: 'present',
            method: 'manual',
            markedBy: actorName,
            markedAt: nowIso,
            note: payload.note || 'تعويض غياب',
          });
        }

        appendActivityLog({
          action: 'attendance.compensate',
          resource: 'attendanceRecords',
          resourceId: payload.studentId,
          summary: `تسجيل تعويض غياب الطالب في حصة تعويضية (${makeupSess.date})`,
          before: beforeState,
          after: { compensatedBy: makeupSess.id, date: makeupSess.date },
        });
        showToast('تم تسجيل تعويض الغياب في الحصة التعويضية');
        return true;
      }, false),
    [authSession?.centerId, authSession?.name, appendActivityLog, runPermitted, showToast]
  );

  const markStudentAttendanceByMethod = useCallback<
    EduflowContextValue['markStudentAttendanceByMethod']
  >(
    (payload) =>
      runPermitted(() => {
        const sess = repositories.sessions.get(payload.sessionId);
        if (!sess) return false;
        const actorName = authSession?.name || 'إدارة السنتر';
        const nowIso = new Date().toISOString();

        const hasEntry = sess.entries.some((e) => e.studentId === payload.studentId);
        const nextEntries: AttendanceEntry[] = hasEntry
          ? sess.entries.map((e) =>
              e.studentId === payload.studentId
                ? {
                    ...e,
                    status: payload.status,
                    note: payload.note || e.note,
                  }
                : e
            )
          : [
              ...sess.entries,
              {
                studentId: payload.studentId,
                status: payload.status,
                note: payload.note,
              },
            ];
        repositories.sessions.update(sess.id, {
          entries: nextEntries,
          status: sess.status === 'upcoming' ? 'pending' : sess.status,
        });

        const existingRec = repositories.attendanceRecords
          .list()
          .find((r) => r.sessionId === sess.id && r.studentId === payload.studentId);

        if (existingRec) {
          repositories.attendanceRecords.update(existingRec.id, {
            status: payload.status,
            method: payload.method,
            confidence: payload.confidence,
            markedBy: actorName,
            markedAt: nowIso,
            note: payload.note,
          });
        } else {
          repositories.attendanceRecords.create({
            centerId: authSession?.centerId || DEFAULT_CENTER_ID,
            sessionId: sess.id,
            studentId: payload.studentId,
            status: payload.status,
            method: payload.method,
            confidence: payload.confidence,
            markedBy: actorName,
            markedAt: nowIso,
            note: payload.note,
          });
        }

        appendActivityLog({
          action:
            payload.method === 'qr' ? 'attendance.qr_checkin' : 'attendance.face_checkin',
          resource: 'attendanceRecords',
          resourceId: payload.studentId,
          summary: `تسجيل حضور طالب بطريقة (${payload.method === 'qr' ? 'QR' : 'بصمة الوجه'})`,
          after: {
            sessionId: sess.id,
            studentId: payload.studentId,
            status: payload.status,
            method: payload.method,
            confidence: payload.confidence,
          },
        });
        return true;
      }, false),
    [authSession?.centerId, authSession?.name, appendActivityLog, runPermitted]
  );

  const queueWhatsAppMessages = useCallback<EduflowContextValue['queueWhatsAppMessages']>(
    (items) =>
      runPermitted(() => {
        const nowIso = new Date().toISOString();
        const created: OutboxMessage[] = items.map((item) =>
          repositories.messages.create({
            centerId: authSession?.centerId || DEFAULT_CENTER_ID,
            studentId: item.studentId,
            recipientName: item.recipientName,
            recipientPhone: item.recipientPhone,
            channel: 'whatsapp',
            templateId: item.templateId,
            body: item.body,
            status: 'ready',
            createdAt: nowIso,
          })
        );
        appendActivityLog({
          action: 'whatsapp.queue',
          resource: 'messages',
          summary: `تجهيز ${created.length} رسالة واتساب في صندوق الإرسال`,
          after: { count: created.length },
        });
        return created;
      }, []),
    [authSession?.centerId, appendActivityLog, runPermitted]
  );

  const markOutboxMessageSent = useCallback<EduflowContextValue['markOutboxMessageSent']>(
    (messageId, opts) =>
      runPermitted(() => {
        const nowIso = new Date().toISOString();
        repositories.messages.update(messageId, {
          status: 'sent',
          sentAt: nowIso,
        });
        if (opts?.sessionId && opts?.studentId) {
          const sess = repositories.sessions.get(opts.sessionId);
          if (sess) {
            repositories.sessions.update(sess.id, {
              entries: sess.entries.map((e) =>
                e.studentId === opts.studentId ? { ...e, messageStatus: 'sent' } : e
              ),
            });
          }
        }
        if (opts?.invoiceId) {
          repositories.invoices.update(opts.invoiceId, {
            lastReminderDate: nowIso.slice(0, 10),
          });
        }
        showToast('تم تحديث حالة الرسالة إلى مُرسلة');
      }),
    [runPermitted, showToast]
  );

  const saveBiometricConsent = useCallback<EduflowContextValue['saveBiometricConsent']>(
    (payload) =>
      runPermitted(() => {
        const st = repositories.students.get(payload.studentId);
        if (!st) return null;
        const actorName = authSession?.name || 'إدارة السنتر';
        const nowIso = new Date().toISOString();
        const existing = repositories.consents
          .list()
          .filter((c) => c.studentId === st.id && c.type === 'biometric_face');
        const wasGranted = hasActiveBiometricConsent(existing, st.id);

        if (!payload.granted) {
          existing.forEach((c) => {
            if (!c.revokedAt) {
              repositories.consents.update(c.id, { granted: false, revokedAt: nowIso });
            }
          });
          appendActivityLog({
            action: 'biometrics.consent',
            resource: 'consents',
            resourceId: st.id,
            summary: `إلغاء موافقة ولي الأمر على بصمة الوجه للطالب "${st.name}"`,
            before: { granted: wasGranted },
            after: { granted: false },
          });
          showToast('تم إلغاء موافقة بصمة الوجه', 'info');
          return null;
        }

        const created = repositories.consents.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          studentId: st.id,
          parentPhone: st.parentPhone,
          type: 'biometric_face',
          granted: true,
          grantedAt: nowIso,
          capturedBy: `${actorName} (${currentRole})`,
        });

        appendActivityLog({
          action: 'biometrics.consent',
          resource: 'consents',
          resourceId: created.id,
          summary: `توثيق موافقة ولي الأمر على بصمة الوجه للطالب "${st.name}"`,
          before: { granted: wasGranted },
          after: { granted: true, parentPhone: st.parentPhone },
        });
        showToast('تم تسجيل موافقة ولي الأمر على بصمة الوجه بنجاح');
        return created;
      }, null),
    [authSession?.centerId, authSession?.name, currentRole, appendActivityLog, runPermitted, showToast]
  );

  const enrollFaceTemplate = useCallback<EduflowContextValue['enrollFaceTemplate']>(
    async (payload) => {
      try {
        const st = repositories.students.get(payload.studentId);
        if (!st) return null;
        const allConsents = repositories.consents.list();
        if (!hasActiveBiometricConsent(allConsents, st.id)) {
          showToast('يجب توثيق موافقة ولي الأمر أولاً قبل تسجيل بصمة الوجه', 'error');
          return null;
        }
        const descriptorHash = await createDeterministicFaceHash(payload.sampleSignature);
        const existingActive = repositories.faceTemplates
          .list()
          .filter((f) => f.studentId === st.id && f.status === 'active');
        existingActive.forEach((f) => {
          repositories.faceTemplates.update(f.id, { status: 'deleted' });
        });

        const actorName = authSession?.name || 'إدارة السنتر';
        const created = repositories.faceTemplates.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          studentId: st.id,
          descriptorHash,
          enrolledAt: new Date().toISOString(),
          enrolledBy: `${actorName} (${currentRole})`,
          status: 'active',
        });

        appendActivityLog({
          action: 'biometrics.enroll',
          resource: 'faceTemplates',
          resourceId: created.id,
          summary: `تسجيل بصمة وجه مشفرة للطالب "${st.name}"`,
          before: { previousTemplates: existingActive.length },
          after: { templateId: created.id, status: 'active' },
        });
        showToast(`تم تسجيل بصمة وجه الطالب "${st.name}" بنجاح`);
        return created;
      } catch (err) {
        if (err instanceof PermissionError) {
          showToast(err.message, 'error');
          return null;
        }
        throw err;
      }
    },
    [authSession?.centerId, authSession?.name, currentRole, appendActivityLog, showToast]
  );

  const deleteFaceTemplate = useCallback<EduflowContextValue['deleteFaceTemplate']>(
    (studentId) =>
      runPermitted(() => {
        const st = repositories.students.get(studentId);
        const active = repositories.faceTemplates
          .list()
          .filter((f) => f.studentId === studentId && f.status === 'active');
        if (active.length === 0) return false;
        active.forEach((f) => {
          repositories.faceTemplates.update(f.id, { status: 'deleted' });
        });
        appendActivityLog({
          action: 'biometrics.delete',
          resource: 'faceTemplates',
          resourceId: studentId,
          summary: `حذف بصمة الوجه المسجلة للطالب "${st?.name || studentId}"`,
          before: { activeCount: active.length },
          after: { status: 'deleted' },
        });
        showToast('تم حذف بصمة الوجه للطالب بنجاح', 'info');
        return true;
      }, false),
    [appendActivityLog, runPermitted, showToast]
  );

  // Expenses via repositories
  const addExpense = useCallback(
    (exp: Omit<Expense, 'id' | 'centerId' | 'addedBy'>) =>
      runPermitted(() => {
        const actorName = authSession?.name || 'إدارة السنتر';
        const created = repositories.expenses.create({
          ...exp,
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          addedBy: `${actorName} (${currentRole})`,
        });
        appendActivityLog({
          action: 'expense.create',
          resource: 'expenses',
          resourceId: created.id,
          summary: `تسجيل مصروف "${created.description}" بقيمة ${created.amount} ج`,
          after: { amount: created.amount, category: created.category },
        });
        showToast('تم تسجيل المصروف بنجاح');
      }),
    [authSession?.centerId, authSession?.name, currentRole, appendActivityLog, runPermitted, showToast]
  );

  const deleteExpense = useCallback(
    (id: string) =>
      runPermitted(() => {
        const before = repositories.expenses.get(id);
        repositories.expenses.remove(id);
        appendActivityLog({
          action: 'expense.delete',
          resource: 'expenses',
          resourceId: id,
          summary: `حذف مصروف "${before?.description || id}" (${before?.amount || 0} ج)`,
          before,
        });
        showToast('تم حذف المصروف', 'info');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  // Assessments via repositories
  const createAssessment = useCallback(
    (data: Omit<Assessment, 'id' | 'centerId' | 'status' | 'grades'>): Assessment =>
      runPermitted(() => {
        const groupRoster = repositories.students
          .list()
          .filter((s) => s.status === 'active' && s.groupIds.includes(data.groupId));
        const created = repositories.assessments.create({
          ...data,
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          status: 'in_progress',
          grades: groupRoster.map((st) => ({
            studentId: st.id,
            score: null,
            absent: false,
          })),
        });
        showToast(`تم إنشاء التقييم "${created.title}"`);
        return created;
      }),
    [authSession?.centerId, runPermitted, showToast]
  );

  const updateAssessmentGrades = useCallback(
    (assessmentId: string, grades: AssessmentGrade[]) =>
      runPermitted(() => {
        const allEntered = grades.every((g) => g.absent || g.score !== null);
        repositories.assessments.update(assessmentId, {
          grades,
          status: allEntered ? 'graded' : 'in_progress',
        });
      }),
    [runPermitted]
  );

  // Notifications via repositories
  const markAllNotificationsRead = useCallback(() => {
    runPermitted(() => {
      repositories.notifications.list().forEach((n) => {
        if (!n.read) repositories.notifications.update(n.id, { read: true });
      });
      showToast('تم تحديد جميع الإشعارات كمقروءة', 'info');
    });
  }, [runPermitted, showToast]);

  const markNotificationRead = useCallback(
    (id: string) =>
      runPermitted(() => {
        repositories.notifications.update(id, { read: true });
      }),
    [runPermitted]
  );

  // Settings & Subscription via repositories
  const updateCenterSettings = useCallback(
    (partial: Partial<CenterSettings>) =>
      runPermitted(() => {
        const prev = repositories.meta.getCenterSettings();
        const next = { ...prev, ...partial };
        repositories.meta.setCenterSettings(next);
        const center = repositories.centers.list()[0];
        if (center) {
          repositories.centers.update(center.id, {
            name: next.name,
            governorate: next.governorate,
            city: next.city,
            address: next.address,
            phone: next.phone,
            stages: next.stages,
            currentPlanId: next.currentPlanId,
          });
        }
        appendActivityLog({
          action: 'settings.update',
          resource: 'centerSettings',
          summary: 'تحديث إعدادات السنتر أو الباقة',
          before: prev,
          after: next,
        });
        showToast('تم حفظ الإعدادات بنجاح');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const addRoom = useCallback(
    (name: string, capacity: number) =>
      runPermitted(() => {
        repositories.rooms.create({
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          name,
          capacity,
        });
        showToast(`تمت إضافة "${name}"`);
      }),
    [authSession?.centerId, runPermitted, showToast]
  );

  const updateRoom = useCallback(
    (id: string, name: string, capacity: number) =>
      runPermitted(() => {
        repositories.rooms.update(id, { name, capacity });
        showToast('تم تعديل بيانات القاعة');
      }),
    [runPermitted, showToast]
  );

  const deleteRoom = useCallback(
    (id: string) =>
      runPermitted(() => {
        const before = repositories.rooms.get(id);
        repositories.rooms.remove(id);
        appendActivityLog({
          action: 'room.delete',
          resource: 'rooms',
          resourceId: id,
          summary: `حذف القاعة "${before?.name || id}"`,
          before,
        });
        showToast('تم حذف القاعة', 'info');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const addStage = useCallback(
    (stageName: string) =>
      runPermitted(() => {
        const currentStages = repositories.meta.getStages();
        if (!currentStages.includes(stageName)) {
          repositories.meta.setStages([...currentStages, stageName]);
          showToast(`تمت إضافة المرحلة "${stageName}"`);
        }
      }),
    [runPermitted, showToast]
  );

  const deleteStage = useCallback(
    (stageName: string) =>
      runPermitted(() => {
        const currentStages = repositories.meta.getStages();
        repositories.meta.setStages(currentStages.filter((s) => s !== stageName));
        appendActivityLog({
          action: 'stage.delete',
          resource: 'stages',
          summary: `حذف المرحلة الدراسية "${stageName}"`,
          before: stageName,
        });
        showToast('تم حذف المرحلة الدراسية', 'info');
      }),
    [appendActivityLog, runPermitted, showToast]
  );

  const inviteUser = useCallback<EduflowContextValue['inviteUser']>(
    async (u) => {
      try {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const bytes = crypto.getRandomValues(new Uint8Array(10));
        const tempPass = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
        const cred = await createPasswordCredential(tempPass);
        const created = repositories.users.create({
          ...u,
          centerId: authSession?.centerId || DEFAULT_CENTER_ID,
          status: 'invited',
          salt: cred.salt,
          passwordHash: cred.passwordHash,
          failedAttempts: 0,
        });
        appendActivityLog({
          action: 'user.invite',
          resource: 'users',
          resourceId: created.id,
          summary: `دعوة مستخدم جديد "${created.name}" بدور (${created.role})`,
          after: { id: created.id, email: created.email, role: created.role },
        });
        showToast(`تم إرسال دعوة الانضمام إلى ${u.name} — كلمة المرور المؤقتة: ${tempPass}`);
      } catch (err) {
        if (err instanceof PermissionError) {
          showToast(err.message, 'error');
          return;
        }
        throw err;
      }
    },
    [authSession?.centerId, appendActivityLog, showToast]
  );

  const updateTemplate = useCallback(
    (id: MessageTemplate['id'], body: string) =>
      runPermitted(() => {
        const currentTemplates = repositories.meta.getTemplates();
        repositories.meta.setTemplates(
          currentTemplates.map((t) => (t.id === id ? { ...t, body } : t))
        );
        showToast('تم حفظ قالب الرسالة');
      }),
    [runPermitted, showToast]
  );

  const openLockedFeatureModal = useCallback(
    (featureName: string, requiredPlan = 'الباقة الاحترافية') => {
      setLockedFeatureModal({ open: true, featureName, requiredPlan });
    },
    []
  );

  const closeLockedFeatureModal = useCallback(() => {
    setLockedFeatureModal((prev) => ({ ...prev, open: false }));
  }, []);

  const openPdfExport = useCallback(
    (payload: PdfDocumentPayload) => {
      setActivePdfPayload(payload);
      appendActivityLog({
        action: 'export.pdf',
        resource: 'reports',
        summary: `تصدير ملف PDF: ${payload.title}`,
        after: { title: payload.title },
      });
    },
    [appendActivityLog]
  );

  const closePdfExport = useCallback(() => {
    setActivePdfPayload(null);
  }, []);

  // Phase 17: Background job scheduler tick while staff Owner/Admin session is open
  useEffect(() => {
    if (!can(currentActor, 'update', 'scheduledJobs')) return;
    const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
    const timer = setInterval(() => {
      defaultJobScheduler.runDueJobs(repositories, cid).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [currentActor]);

  const updateIntegrationConfig = useCallback<EduflowContextValue['updateIntegrationConfig']>(
    (key, patch) =>
      runPermitted(() => {
        assertCan(currentActor, 'update', 'integrations');
        const prevSettings = repositories.meta.getCenterSettings();
        const currentIntegrations = {
          ...DEFAULT_INTEGRATIONS,
          ...(prevSettings.integrations || {}),
        };
        const prevItem = currentIntegrations[key] || DEFAULT_INTEGRATIONS[key];
        const nextItem: IntegrationConfig = {
          ...prevItem,
          ...patch,
          key,
          lastMessage:
            patch.mode === 'production'
              ? 'الوضع الحقيقي محدد — تأكد من ضبط مفاتيح الخادم (Server-side only) قبل الإطلاق.'
              : prevItem.lastMessage,
        };
        const nextSettings: CenterSettings = {
          ...prevSettings,
          integrations: {
            ...currentIntegrations,
            [key]: nextItem,
          },
        };
        repositories.meta.setCenterSettings(nextSettings);
        appendActivityLog({
          action: 'integration.config_update',
          resource: 'integrations',
          resourceId: key,
          summary: `تحديث إعداد تكامل «${nextItem.label}» (${nextItem.enabled ? 'مفعّل' : 'موقوف'} · ${nextItem.mode === 'mock' ? 'تجريبي' : 'حقيقي'})`,
          before: { enabled: prevItem.enabled, mode: prevItem.mode },
          after: { enabled: nextItem.enabled, mode: nextItem.mode },
        });
        showToast(`تم تحديث إعداد «${nextItem.label}» بنجاح`);
      }),
    [currentActor, appendActivityLog, runPermitted, showToast]
  );

  const testIntegrationConnection = useCallback<EduflowContextValue['testIntegrationConnection']>(
    async (key) => {
      try {
        assertCan(currentActor, 'update', 'integrations');
      } catch (err) {
        const msg = err instanceof PermissionError ? err.message : 'غير مصرح باختبار التكامل.';
        showToast(msg, 'error');
        return { ok: false, message: msg };
      }

      const prevSettings = repositories.meta.getCenterSettings();
      const currentIntegrations = {
        ...DEFAULT_INTEGRATIONS,
        ...(prevSettings.integrations || {}),
      };
      const item = currentIntegrations[key] || DEFAULT_INTEGRATIONS[key];
      const nowIso = new Date().toISOString();

      let ok = true;
      let message = 'تم الاختبار بنجاح.';

      if (!item.enabled) {
        ok = false;
        message = 'التكامل معطّل حالياً — فعّله أولاً قبل الاختبار.';
      } else if (item.mode === 'production') {
        ok = false;
        message =
          'الوضع الحقيقي يتطلب خادم Edge/API مع المتغيرات السرية (PAYMOB_API_KEY / WHATSAPP_TOKEN) — شغّل الوضع التجريبي للمعاينة المحلية.';
      } else if (key === 'payments') {
        const sess = await defaultMockPaymobProvider.createCheckout({
          centerId: currentActor?.centerId || DEFAULT_CENTER_ID,
          invoiceIds: ['health-check'],
          amount: 10,
          method: 'card',
          returnUrl: '#/settings',
        });
        message = `اتصال بوابة Paymob التجريبية سليم (جلسة فحص ${sess.orderId}).`;
      } else if (key === 'whatsapp') {
        const res = await defaultMockWhatsAppProvider.sendTemplate({
          to: prevSettings.phone || '201000000001',
          templateName: 'health_check_ar',
          language: 'ar',
          variables: { '1': prevSettings.name },
        });
        ok = res.ok;
        message = res.ok
          ? `واتساب Cloud API التجريبي جاهز (معرف رسالة ${res.messageId}).`
          : res.errorAr || 'فشل اختبار واتساب.';
      } else if (key === 'push') {
        message = 'مزوّد Web Push التجريبي جاهز (تُحفظ اشتراكات VAPID على الخادم لاحقاً).';
      } else if (key === 'ai') {
        message = 'وسيط الذكاء الاصطناعي التجريبي مستعد (مفاتيح Gemini تُحفظ على الخادم فقط).';
      } else if (key === 'storage') {
        message = 'مزوّد تخزين الملفات التجريبي سليم (حد أقصى 5 ميجابايت · بيانات وصفية فقط).';
      }

      const updatedItem: IntegrationConfig = {
        ...item,
        healthStatus: ok ? 'healthy' : 'degraded',
        lastTestedAt: nowIso,
        lastMessage: message,
      };
      repositories.meta.setCenterSettings({
        ...prevSettings,
        integrations: {
          ...currentIntegrations,
          [key]: updatedItem,
        },
      });
      appendActivityLog({
        action: 'integration.connection_test',
        resource: 'integrations',
        resourceId: key,
        summary: `اختبار اتصال «${item.label}»: ${ok ? 'ناجح' : 'تحذير'} — ${message}`,
        after: { ok, healthStatus: updatedItem.healthStatus },
      });
      showToast(message, ok ? 'success' : 'info');
      return { ok, message };
    },
    [currentActor, appendActivityLog, showToast]
  );

  const startMockPaymobCheckout = useCallback<EduflowContextValue['startMockPaymobCheckout']>(
    async ({ amount, method, invoiceId }) => {
      try {
        assertCan(currentActor, 'create', 'webhookEvents');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        const result = await defaultMockPaymobProvider.createCheckout({
          centerId: cid,
          invoiceIds: [invoiceId || 'inv-mock-test'],
          amount,
          method,
          returnUrl: typeof window !== 'undefined' ? window.location.href : '#/settings',
        });
        appendActivityLog({
          action: 'integration.mock_checkout_created',
          resource: 'webhookEvents',
          resourceId: result.txId,
          summary: `بدء جلسة دفع تجريبية (${result.orderId}) بمبلغ ${result.amount} ج`,
          after: { orderId: result.orderId, amount: result.amount, method },
        });
        showToast(`تم إنشاء جلسة دفع تجريبية (${result.orderId}) — اختر نتيجة المحاكاة الآن`, 'info');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذر بدء جلسة الدفع التجريبية.';
        showToast(msg, 'error');
        return null;
      }
    },
    [currentActor, appendActivityLog, showToast]
  );

  const simulateMockPaymobOutcome = useCallback<EduflowContextValue['simulateMockPaymobOutcome']>(
    async (txId, outcome) => {
      try {
        assertCan(currentActor, 'create', 'webhookEvents');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        let captured: { result: WebhookProcessResult; rawBody: string; signature: string } | null =
          null;
        await defaultMockPaymobProvider.simulateCheckoutOutcome(
          txId,
          outcome,
          async (signed) => {
            const result = await processIncomingWebhook(
              repositories,
              (body, sig) => defaultMockPaymobProvider.verifyWebhook(body, sig),
              {
                centerId: cid,
                provider: 'paymob',
                rawBody: signed.rawBody,
                signature: signed.signature,
              }
            );
            captured = { result, rawBody: signed.rawBody, signature: signed.signature };
          },
          200
        );
        if (captured) {
          const finalCaptured = captured as {
            result: WebhookProcessResult;
            rawBody: string;
            signature: string;
          };
          showToast(
            finalCaptured.result.messageAr,
            finalCaptured.result.ok ? 'success' : 'error'
          );
          return finalCaptured;
        }
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذر محاكاة Webhook الدفع.';
        showToast(msg, 'error');
        return null;
      }
    },
    [currentActor, showToast]
  );

  const replayWebhookEvent = useCallback<EduflowContextValue['replayWebhookEvent']>(
    async ({ provider, rawBody, signature, tamperSignature }) => {
      try {
        assertCan(currentActor, 'create', 'webhookEvents');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        const verifier =
          provider === 'paymob'
            ? (b: string, s: string) => defaultMockPaymobProvider.verifyWebhook(b, s)
            : (b: string, s: string) => defaultMockWhatsAppProvider.verifyWebhook(b, s);

        const effectiveSig = tamperSignature ? 'f'.repeat(64) : signature;
        const res = await processIncomingWebhook(repositories, verifier, {
          centerId: cid,
          provider,
          rawBody,
          signature: effectiveSig,
        });
        showToast(res.messageAr, res.idempotent ? 'info' : res.ok ? 'success' : 'error');
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'فشلت إعادة اختبار الـ Webhook.';
        showToast(msg, 'error');
        return null;
      }
    },
    [currentActor, showToast]
  );

  const testWhatsAppProvider = useCallback<EduflowContextValue['testWhatsAppProvider']>(
    async ({ mode, phone, simulateStatus }) => {
      try {
        assertCan(currentActor, 'create', 'webhookEvents');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        const sendResult =
          mode === 'template'
            ? await defaultMockWhatsAppProvider.sendTemplate({
                to: phone,
                templateName: 'absence_notice_ar',
                language: 'ar',
                variables: { '1': 'طالب تجريبي' },
              })
            : await defaultMockWhatsAppProvider.sendText({
                to: phone,
                body: `رسالة متابعة تجريبية من ${repositories.meta.getCenterSettings().name || 'سنتر حامد البيلي'}`,
                lastInboundAt:
                  mode === 'text_inside_24h'
                    ? new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
                    : new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
              });

        if (!sendResult.ok || !sendResult.messageId) {
          showToast(sendResult.errorAr || 'رفضت قاعدة نافذة الـ 24 ساعة إرسال الرسالة', 'error');
          return { sendResult };
        }

        const signed = await defaultMockWhatsAppProvider.buildSignedStatusWebhook({
          messageId: sendResult.messageId,
          recipientPhone: phone,
          status: simulateStatus,
          errorCode: simulateStatus === 'failed' ? '131026' : undefined,
        });
        const webhookResult = await processIncomingWebhook(
          repositories,
          (b, s) => defaultMockWhatsAppProvider.verifyWebhook(b, s),
          {
            centerId: cid,
            provider: 'whatsapp',
            rawBody: signed.rawBody,
            signature: signed.signature,
          }
        );
        showToast(webhookResult.messageAr, simulateStatus === 'failed' ? 'info' : 'success');
        return { sendResult, webhookResult };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'فشل اختبار واتساب السحابي.';
        showToast(msg, 'error');
        return null;
      }
    },
    [currentActor, showToast]
  );

  const testStorageUpload = useCallback<EduflowContextValue['testStorageUpload']>(
    async (file) => {
      try {
        assertCan(currentActor, 'create', 'fileAssets');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        const res = await defaultStorageProvider.uploadFile(repositories, {
          centerId: cid,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          category: file.category,
          uploadedBy: authSession?.name || currentRole,
        });
        if (!res.ok) {
          showToast(res.errorAr || 'رفض ملف الرفع.', 'error');
        } else {
          appendActivityLog({
            action: 'storage.upload_metadata',
            resource: 'fileAssets',
            resourceId: res.asset?.id,
            summary: `رفع ملف تجريبي (بيانات وصفية فقط): ${file.name}`,
          });
          showToast(`تم التحقق وحفظ البيانات الوصفية للملف «${file.name}» بنجاح`);
        }
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذر اختبار رفع الملف.';
        showToast(msg, 'error');
        return { ok: false, errorAr: msg };
      }
    },
    [authSession?.name, currentActor, currentRole, appendActivityLog, showToast]
  );

  const runScheduledJobNow = useCallback<EduflowContextValue['runScheduledJobNow']>(
    async (jobName) => {
      try {
        assertCan(currentActor, 'update', 'scheduledJobs');
        const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
        const outcome = await defaultJobScheduler.runNow(repositories, jobName, cid, {
          actorName: authSession?.name || currentRole,
          manual: true,
        });
        showToast(
          outcome.status === 'success'
            ? `تم تنفيذ المهمة: ${outcome.summary}`
            : outcome.summary,
          outcome.status === 'success' ? 'success' : 'error'
        );
        return outcome;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذر تشغيل المهمة المجدولة.';
        showToast(msg, 'error');
        return null;
      }
    },
    [authSession?.name, currentActor, currentRole, showToast]
  );

  const runAllDueJobsNow = useCallback<EduflowContextValue['runAllDueJobsNow']>(async () => {
    try {
      assertCan(currentActor, 'update', 'scheduledJobs');
      const cid = currentActor?.centerId || DEFAULT_CENTER_ID;
      const defs = defaultJobScheduler.getRegisteredDefinitions();
      const outcomes: JobRunOutcome[] = [];
      for (const d of defs) {
        outcomes.push(
          await defaultJobScheduler.runNow(repositories, d.name, cid, {
            actorName: authSession?.name || currentRole,
            manual: true,
          })
        );
      }
      showToast(`تم تنفيذ ${outcomes.length} مهام مجدولة بنجاح`);
      return outcomes;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تشغيل المهام المجدولة.';
      showToast(msg, 'error');
      return [];
    }
  }, [authSession?.name, currentActor, currentRole, showToast]);

  const togglePlanFeatureOverride = useCallback<
    EduflowContextValue['togglePlanFeatureOverride']
  >(
    (planId, flagKey, value) =>
      runPermitted(() => {
        assertCan(currentActor, 'change_plan', 'subscription');
        const prev = repositories.meta.getCenterSettings();
        const prevOverrides = prev.planFeatureOverrides || {};
        const nextOverrides = {
          ...prevOverrides,
          [planId]: {
            ...(prevOverrides[planId] || {}),
            [flagKey]: value,
          },
        };
        repositories.meta.setCenterSettings({
          ...prev,
          planFeatureOverrides: nextOverrides,
        });
        appendActivityLog({
          action: 'plan.feature_override',
          resource: 'subscription',
          resourceId: `${planId}:${flagKey}`,
          summary: `تعديل ميزة الباقة (${planId}) — ${flagKey}: ${value ? 'مفعّل' : 'مقفل'}`,
          after: { planId, flagKey, value },
        });
        showToast('تم تحديث إعدادات مزايا الباقة بنجاح');
      }),
    [currentActor, appendActivityLog, runPermitted, showToast]
  );

  return (
    <EduflowContext.Provider
      value={{
        currentScreen,
        navigate,
        intendedScreen,
        authSession,
        studentAuthSession,
        studentPortalAvailable,
        currentUser,
        currentActor,
        currentRole,
        demoMode,
        setDemoMode,
        canUseRoleSwitcher,
        setCurrentRole,
        loginWithCredentials,
        activateParentByPhone,
        logout,
        issueStudentAccessCode,
        bulkGenerateStudentSlips,
        toggleStudentPortalAccountStatus,
        revokeAllStudentPortalSessions,
        revokeSingleStudentPortalSession,
        loginStudentWithCode,
        completeStudentFirstLoginPin,
        changeStudentPortalPin,
        logoutStudent,
        resetPasswordByEmail,
        changeMyPassword,
        registerCenterOwner,
        listStateMode,
        setListStateMode,
        newCenterEmptyMode,
        setNewCenterEmptyMode,
        centers,
        guardians,
        studentGuardians,
        students,
        teachers,
        groups,
        rooms,
        stages,
        sessions,
        attendanceRecords,
        invoices,
        payments,
        discounts,
        expenses,
        settlements,
        messages,
        assessments,
        activityLog,
        consents,
        faceTemplates,
        studentAccounts,
        studentSessions,
        webhookEvents,
        scheduledJobs,
        fileAssets,
        notifications,
        templates,
        users,
        centerSettings,
        updateIntegrationConfig,
        testIntegrationConnection,
        startMockPaymobCheckout,
        simulateMockPaymobOutcome,
        replayWebhookEvent,
        testWhatsAppProvider,
        testStorageUpload,
        runScheduledJobNow,
        runAllDueJobsNow,
        togglePlanFeatureOverride,
        exportBackupJson,
        validateBackupJson,
        importBackupJson,
        resetDemoData,
        selectedStudentId,
        setSelectedStudentId,
        selectedTeacherId,
        setSelectedTeacherId,
        selectedSessionId,
        setSelectedSessionId,
        lastSavedSessionId,
        studentDrawerOpen,
        editingStudent,
        openAddStudent,
        openEditStudent,
        closeStudentDrawer,
        saveStudent,
        deactivateStudent,
        bulkMoveStudentsToGroup,
        bulkDeactivateStudents,
        addStudentNote,
        paymentDrawerOpen,
        paymentPreselectedStudentId,
        paymentPreselectedInvoiceId,
        activeReceipt,
        setActiveReceipt,
        openRecordPayment,
        closeRecordPayment,
        recordPayment,
        generateMonthlyInvoices,
        deleteInvoiceBatch,
        applyInvoiceDiscount,
        settleTeacherMonth,
        logExcelExport,
        groupDrawerOpen,
        editingGroup,
        prefilledSlot,
        openCreateGroup,
        openEditGroup,
        closeGroupDrawer,
        saveGroup,
        updateGroupStudents,
        addOrUpdateTeacher,
        saveAttendanceSession,
        createMakeupSession,
        compensateAbsentStudent,
        markStudentAttendanceByMethod,
        queueWhatsAppMessages,
        markOutboxMessageSent,
        saveBiometricConsent,
        enrollFaceTemplate,
        deleteFaceTemplate,
        addExpense,
        deleteExpense,
        createAssessment,
        updateAssessmentGrades,
        markAllNotificationsRead,
        markNotificationRead,
        updateCenterSettings,
        addRoom,
        updateRoom,
        deleteRoom,
        addStage,
        deleteStage,
        inviteUser,
        updateTemplate,
        lockedFeatureModal,
        openLockedFeatureModal,
        closeLockedFeatureModal,
        activePdfPayload,
        openPdfExport,
        closePdfExport,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </EduflowContext.Provider>
  );
};

export function useEduflow(): EduflowContextValue {
  const ctx = useContext(EduflowContext);
  if (!ctx) {
    throw new Error('useEduflow must be used within EduflowProvider');
  }
  return ctx;
}
