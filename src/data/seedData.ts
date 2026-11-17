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
  IntegrationConfig,
  IntegrationKey,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  LessonItem,
  MessageTemplate,
  OnlineExam,
  OnlineExamAttempt,
  OutboxMessage,
  PaymentRecord,
  RegistrationLead,
  Room,
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
  UserRole,
  WebhookEventRecord,
} from '../types/eduflow';

export const DEFAULT_CENTER_ID = 'center-hamed-elbailey';

export const STAGES_LIST = [
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
];

export const INITIAL_CENTERS: Center[] = [
  {
    id: DEFAULT_CENTER_ID,
    name: 'سنتر حامد البيلي',
    governorate: 'القاهرة',
    city: 'القاهرة',
    address: '',
    phone: '',
    stages: STAGES_LIST,
    currentPlanId: 'pro',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
];

export const INITIAL_ROOMS: Room[] = [];

// 3 Teachers — 200 EGP per completed teaching session
export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 't-mohamed',
    centerId: DEFAULT_CENTER_ID,
    name: 'محمد عماد',
    phone: '',
    subjects: ['مادة التخصص'],
    compensationType: 'per_session',
    compensationValue: 200,
    compensation: { type: 'per_session', perSessionAmount: 200 },
    hasLoginAccess: true,
    color: '#0F766E',
  },
  {
    id: 't-ahmed',
    centerId: DEFAULT_CENTER_ID,
    name: 'أحمد جاويش',
    phone: '',
    subjects: ['مادة التخصص'],
    compensationType: 'per_session',
    compensationValue: 200,
    compensation: { type: 'per_session', perSessionAmount: 200 },
    hasLoginAccess: true,
    color: '#1D4ED8',
  },
  {
    id: 't-fares',
    centerId: DEFAULT_CENTER_ID,
    name: 'فارس أوسا',
    phone: '',
    subjects: ['مادة التخصص'],
    compensationType: 'per_session',
    compensationValue: 200,
    compensation: { type: 'per_session', perSessionAmount: 200 },
    hasLoginAccess: true,
    color: '#B45309',
  },
];

// 2 Guardians & Links
export const INITIAL_GUARDIANS: Guardian[] = [
  {
    id: 'g-mimi',
    centerId: DEFAULT_CENTER_ID,
    userId: 'u-mimi',
    name: 'ميمي البنا',
    email: 'mimi@hamed-elbailey.demo',
    phone: '',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
  {
    id: 'g-ibrahim',
    centerId: DEFAULT_CENTER_ID,
    userId: 'u-ibrahim',
    name: 'إبراهيم إمام',
    email: 'ibrahim@hamed-elbailey.demo',
    phone: '',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
];

export const INITIAL_STUDENT_GUARDIANS: StudentGuardianLink[] = [
  {
    id: 'sg-1',
    centerId: DEFAULT_CENTER_ID,
    studentId: 'st-mahmoud',
    guardianId: 'g-mimi',
    guardianUserId: 'u-mimi',
    relationship: 'ولي أمر',
  },
  {
    id: 'sg-2',
    centerId: DEFAULT_CENTER_ID,
    studentId: 'st-faisal',
    guardianId: 'g-ibrahim',
    guardianUserId: 'u-ibrahim',
    relationship: 'ولي أمر',
  },
];

// 2 Students — 400 EGP expected monthly fee each
export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'st-mahmoud',
    centerId: DEFAULT_CENTER_ID,
    userId: 'u-mahmoud',
    code: 'S-000101',
    fullName: 'محمود ميمي',
    name: 'محمود ميمي',
    stage: 'الصف الثالث الثانوي',
    phone: '',
    parent: { name: 'ميمي البنا', phone: '' },
    parentName: 'ميمي البنا',
    parentPhone: '',
    guardianIds: ['g-mimi'],
    guardianUserIds: ['u-mimi'],
    monthlyFee: 400,
    monthlyFeeOverride: 400,
    groupIds: [],
    status: 'active',
    paymentStatus: 'pending',
    lastAttendance: 'لم يحضر بعد',
    attendanceRate: 100,
    notes: [],
    createdAt: '2026-11-16T00:00:00.000Z',
  },
  {
    id: 'st-faisal',
    centerId: DEFAULT_CENTER_ID,
    userId: 'u-faisal',
    code: 'S-000102',
    fullName: 'فيصل إمام',
    name: 'فيصل إمام',
    stage: 'الصف الثالث الثانوي',
    phone: '',
    parent: { name: 'إبراهيم إمام', phone: '' },
    parentName: 'إبراهيم إمام',
    parentPhone: '',
    guardianIds: ['g-ibrahim'],
    guardianUserIds: ['u-ibrahim'],
    monthlyFee: 400,
    monthlyFeeOverride: 400,
    groupIds: [],
    status: 'active',
    paymentStatus: 'pending',
    lastAttendance: 'لم يحضر بعد',
    attendanceRate: 100,
    notes: [],
    createdAt: '2026-11-16T00:00:00.000Z',
  },
];

export const INITIAL_GROUPS: Group[] = [];

export const INITIAL_SESSIONS: AttendanceSession[] = [];

export const INITIAL_ATTENDANCE_RECORDS: AttendanceRecord[] = [];

// 2 Unpaid monthly invoices (400 EGP each = 800 EGP expected, 0 EGP collected)
export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-101',
    centerId: DEFAULT_CENTER_ID,
    number: 'INV-202611-101',
    invoiceNumber: 'INV-202611-101',
    studentId: 'st-mahmoud',
    groupId: 'general',
    month: 'نوفمبر 2026',
    monthKey: '2026-11',
    baseAmount: 400,
    discountLines: [],
    netAmount: 400,
    dueDate: '2026-11-01',
    daysOverdue: 0,
    total: 400,
    paid: 0,
    status: 'pending',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
  {
    id: 'inv-102',
    centerId: DEFAULT_CENTER_ID,
    number: 'INV-202611-102',
    invoiceNumber: 'INV-202611-102',
    studentId: 'st-faisal',
    groupId: 'general',
    month: 'نوفمبر 2026',
    monthKey: '2026-11',
    baseAmount: 400,
    discountLines: [],
    netAmount: 400,
    dueDate: '2026-11-01',
    daysOverdue: 0,
    total: 400,
    paid: 0,
    status: 'pending',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
];

export const INITIAL_PAYMENTS: PaymentRecord[] = [];

export const INITIAL_DISCOUNTS: DiscountRecord[] = [];

export const INITIAL_EXPENSES: Expense[] = [];

export const INITIAL_SETTLEMENTS: SettlementRecord[] = [];

export const INITIAL_MESSAGES: OutboxMessage[] = [];

export const INITIAL_ASSESSMENTS: Assessment[] = [];

export const INITIAL_ACTIVITY_LOG: ActivityLogEntry[] = [];

export const INITIAL_CONSENTS: ConsentRecord[] = [];

export const INITIAL_FACE_TEMPLATES: FaceTemplateRecord[] = [];

export const INITIAL_STUDENT_ACCOUNTS: StudentPortalAccount[] = [];

export const INITIAL_STUDENT_SESSIONS: StudentDeviceSession[] = [];

export const INITIAL_WEBHOOK_EVENTS: WebhookEventRecord[] = [];

export const INITIAL_SCHEDULED_JOB_RUNS: ScheduledJobRunRecord[] = [];

export const INITIAL_FILE_ASSETS: FileAssetRecord[] = [];

export const INITIAL_LESSONS: LessonItem[] = [];

export const INITIAL_ONLINE_EXAMS: OnlineExam[] = [];

export const INITIAL_EXAM_ATTEMPTS: OnlineExamAttempt[] = [];

export const INITIAL_ASSIGNMENTS: Assignment[] = [];

export const INITIAL_ASSIGNMENT_SUBMISSIONS: AssignmentSubmission[] = [];

export const INITIAL_CASH_SHIFTS: CashRegisterShift[] = [];

export const INITIAL_INVENTORY_ITEMS: InventoryItem[] = [];

export const INITIAL_INVENTORY_TRANSACTIONS: InventoryTransaction[] = [];

export const INITIAL_LEADS: RegistrationLead[] = [];

export const INITIAL_STAFF_ATTENDANCE: StaffAttendanceRecord[] = [];

export const INITIAL_STAFF_PAYROLLS: StaffPayrollRecord[] = [];

export const INITIAL_INSTALLMENT_PLANS: InstallmentPlan[] = [];

export const INITIAL_POINT_ENTRIES: GamificationPointEntry[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export const INITIAL_TEMPLATES: MessageTemplate[] = [
  {
    id: 'absence',
    title: 'تنبيه غياب طالب',
    body: 'ولي أمر الطالب/ة {اسم_الطالب}، نحيطكم علماً بعدم حضور نجلكم اليوم {التاريخ} في مجموعة {المجموعة} بسنتر حامد البيلي.',
  },
  {
    id: 'late_payment',
    title: 'تذكير بقسط متأخر',
    body: 'ولي أمر الطالب/ة {اسم_الطالب}، يوجد مبلغ مستحق قدره {المبلغ} ج لاشتراك شهر {التاريخ} بمجموعة {المجموعة}. نرجو سرعة السداد.',
  },
  {
    id: 'session_reminder',
    title: 'تذكير بموعد الحصة',
    body: 'الطالب/ة {اسم_الطالب}، نذكركم بموعد حصة {المجموعة} يوم {التاريخ} الساعة {الموعد} في سنتر حامد البيلي.',
  },
];

// 10 Clean Accounts for "سنتر حامد البيلي" — salted SHA-256 hashes only, NO plaintext passwords stored
export const INITIAL_USERS: SystemUser[] = [
  {
    id: 'u-hamed',
    centerId: DEFAULT_CENTER_ID,
    name: 'مسيو حامد البيلي',
    email: 'hamed@hamed-elbailey.demo',
    phone: '',
    role: UserRole.OWNER,
    status: 'active',
    salt: 'hamed-elbailey-salt-owner-u1',
    passwordHash: '1da82d7deb7c363f56f3acaf7d4b2e779e163b02c6397ef40f3e5ef3fac4e2b0',
    failedAttempts: 0,
  },
  {
    id: 'u-salma',
    centerId: DEFAULT_CENTER_ID,
    name: 'سلمى عمرو هيكل',
    email: 'salma@hamed-elbailey.demo',
    phone: '',
    role: UserRole.ADMIN,
    status: 'active',
    salt: 'hamed-elbailey-salt-admin-u2',
    passwordHash: '266d6b12b6fcca65e20b926ed5fafcb430b737756920d2b94a620cacf361bac0',
    failedAttempts: 0,
  },
  {
    id: 'u-mostafa',
    centerId: DEFAULT_CENTER_ID,
    name: 'مصطفى الفقي',
    email: 'mostafa@hamed-elbailey.demo',
    phone: '',
    role: UserRole.ACCOUNTANT,
    status: 'active',
    salt: 'hamed-elbailey-salt-acc-u3',
    passwordHash: '2b8d455ce75a0727fc1ce15ce79c9efe8c69421c7b16d3a102adcc00eb1fabd7',
    failedAttempts: 0,
  },
  {
    id: 'u-mohamed',
    centerId: DEFAULT_CENTER_ID,
    name: 'محمد عماد',
    email: 'mohamed@hamed-elbailey.demo',
    phone: '',
    role: UserRole.TEACHER,
    teacherId: 't-mohamed',
    status: 'active',
    salt: 'hamed-elbailey-salt-tch-mohamed',
    passwordHash: 'f348b8549ccbf751ca5ba41844571964d65007270653137aceafa7c01eab6422',
    failedAttempts: 0,
  },
  {
    id: 'u-ahmed',
    centerId: DEFAULT_CENTER_ID,
    name: 'أحمد جاويش',
    email: 'ahmed@hamed-elbailey.demo',
    phone: '',
    role: UserRole.TEACHER,
    teacherId: 't-ahmed',
    status: 'active',
    salt: 'hamed-elbailey-salt-tch-ahmed',
    passwordHash: '3ea975d244518150381e575170e9013d9d8a563f31778365cda8cd514ef515d4',
    failedAttempts: 0,
  },
  {
    id: 'u-fares',
    centerId: DEFAULT_CENTER_ID,
    name: 'فارس أوسا',
    email: 'fares@hamed-elbailey.demo',
    phone: '',
    role: UserRole.TEACHER,
    teacherId: 't-fares',
    status: 'active',
    salt: 'hamed-elbailey-salt-tch-fares',
    passwordHash: '3dc2da6380dbdb4e2e397608d5a04c72c37b7334eaa62c24fe0e35682b085331',
    failedAttempts: 0,
  },
  {
    id: 'u-mahmoud',
    centerId: DEFAULT_CENTER_ID,
    name: 'محمود ميمي',
    email: 'mahmoud@hamed-elbailey.demo',
    phone: '',
    role: UserRole.STUDENT,
    studentId: 'st-mahmoud',
    status: 'active',
    salt: 'hamed-elbailey-salt-stu-mahmoud',
    passwordHash: 'a40c5d9a66cf8e31422294ab416c52322371d951f43145fe7b0bd0eaaab43129',
    failedAttempts: 0,
  },
  {
    id: 'u-faisal',
    centerId: DEFAULT_CENTER_ID,
    name: 'فيصل إمام',
    email: 'faisal@hamed-elbailey.demo',
    phone: '',
    role: UserRole.STUDENT,
    studentId: 'st-faisal',
    status: 'active',
    salt: 'hamed-elbailey-salt-stu-faisal',
    passwordHash: 'f4b52a4e96c9cc84e3b8f9b25b4f50a828bcd21fa33e0735fc32a445c9bfa71c',
    failedAttempts: 0,
  },
  {
    id: 'u-mimi',
    centerId: DEFAULT_CENTER_ID,
    name: 'ميمي البنا',
    email: 'mimi@hamed-elbailey.demo',
    phone: '',
    role: UserRole.PARENT,
    guardianId: 'g-mimi',
    status: 'active',
    salt: 'hamed-elbailey-salt-par-mimi',
    passwordHash: '370e524acfad5353e561a77d4c35bb4a4cbc398fd9832c0fc8db053d0d4bebe5',
    failedAttempts: 0,
  },
  {
    id: 'u-ibrahim',
    centerId: DEFAULT_CENTER_ID,
    name: 'إبراهيم إمام',
    email: 'ibrahim@hamed-elbailey.demo',
    phone: '',
    role: UserRole.PARENT,
    guardianId: 'g-ibrahim',
    status: 'active',
    salt: 'hamed-elbailey-salt-par-ibrahim',
    passwordHash: '77b1dd812df7a3faf13e55795ff263fbd49076657137780f9ff34ec78566e6de',
    failedAttempts: 0,
  },
];

export const DEFAULT_INTEGRATIONS: Record<IntegrationKey, IntegrationConfig> = {
  payments: {
    key: 'payments',
    label: 'بوابة الدفع (Paymob / فوري)',
    providerName: 'Paymob Egypt',
    enabled: true,
    mode: 'mock',
    healthStatus: 'unconfigured',
    lastMessage: 'الوضع التجريبي المحلي مفعّل — جاهز لمحاكاة Paymob والـ Webhooks.',
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'واتساب السحابي (WhatsApp Cloud API)',
    providerName: 'Meta Cloud API',
    enabled: true,
    mode: 'mock',
    healthStatus: 'unconfigured',
    lastMessage: 'يفرض نافذة 24 ساعة للرسائل الحرة ويتحقق من القوالب المعتمدة.',
  },
  push: {
    key: 'push',
    label: 'إشعارات المتصفح الفورية (Web Push VAPID)',
    providerName: 'Web Push VAPID',
    enabled: false,
    mode: 'mock',
    healthStatus: 'unconfigured',
    lastMessage: 'يتطلب توليد مفاتيح VAPID على الخادم عند الانتقال للإنتاج.',
  },
  ai: {
    key: 'ai',
    label: 'المساعد الذكي (Gemini API)',
    providerName: 'Google Gemini (Server-side)',
    enabled: true,
    mode: 'production',
    healthStatus: 'healthy',
    lastMessage: 'جميع استدعاءات Gemini تمر عبر خادم Express الآمن على المسار /api/ai/assistant.',
  },
  storage: {
    key: 'storage',
    label: 'تخزين الملفات السحابي (S3 / Supabase Storage)',
    providerName: 'Prototype / S3-Compatible',
    enabled: true,
    mode: 'mock',
    healthStatus: 'healthy',
    lastMessage: 'يتحقق من الحجم (حد أقصى 5 ميجابايت) ونوع الملف مع حفظ البيانات الوصفية فقط.',
  },
};

export const INITIAL_CENTER_SETTINGS: CenterSettings = {
  name: 'سنتر حامد البيلي',
  governorate: 'القاهرة',
  city: 'القاهرة',
  address: '',
  phone: '',
  stages: STAGES_LIST,
  currentPlanId: 'pro',
  billingBanner: 'none',
  reportsLockedDemo: false,
  settlementBasis: 'cash',
  defaultStudentMonthlyFee: 400,
  biometricFaceEnabled: false,
  studentPortalEnabled: true,
  studentMaxDevices: 2,
  studentSessionDays: 7,
  discountPolicy: {
    siblingEnabled: true,
    secondChildPercent: 10,
    thirdPlusChildPercent: 20,
  },
  receiptSettings: {
    headerNote: 'سنتر حامد البيلي — جودة ومتابعة مستمرة',
    footerNote: 'شكراً لالتزامكم — إدارة سنتر حامد البيلي',
    defaultFormat: 'a5',
  },
  integrations: DEFAULT_INTEGRATIONS,
  planFeatureOverrides: {},
  autoReminderRule: {
    enabled: true,
    daysOverdueThreshold: 1,
    includePendingDueSoon: true,
    channel: 'cloud_api',
  },
};

export interface PlanFeatureFlags {
  qrAttendance: boolean;
  excelExport: boolean;
  pdfExport: boolean;
  bulkInvoices: boolean;
  teacherSettlements: boolean;
  whatsappOutbox: boolean;
  biometricFace: boolean;
  studentPortal: boolean;
  maxGroups: number;
  parentPayments: boolean;
  whatsappAutomation: boolean;
  cashRegister: boolean;
  autoReminders: boolean;
  pwaPush: boolean;
  inventory: boolean;
  assignments: boolean;
  liveSessions: boolean;
  monthlyReports: boolean;
  registrationCrm: boolean;
  staffPayroll: boolean;
  installments: boolean;
  multiBranch: boolean;
  gamification: boolean;
  aiAssistant: boolean;
}

export type BooleanPlanFeatureKey = {
  [K in keyof PlanFeatureFlags]: PlanFeatureFlags[K] extends boolean ? K : never;
}[keyof PlanFeatureFlags];

export const PLAN_FEATURE_LABELS: Record<BooleanPlanFeatureKey, string> = {
  qrAttendance: 'تسجيل الحضور ببطاقة QR',
  excelExport: 'تصدير بيانات Excel / CSV',
  pdfExport: 'تصدير التقارير العربية PDF',
  bulkInvoices: 'التوليد الجماعي لفواتير الشهر',
  teacherSettlements: 'تسويات ومستحقات المدرسين',
  whatsappOutbox: 'روابط وصندوق رسائل واتساب',
  biometricFace: 'تسجيل الحضور ببصمة الوجه',
  studentPortal: 'منصة الطالب والدخول بالأكواد',
  parentPayments: 'دفع ولي الأمر أونلاين',
  whatsappAutomation: 'أتمتة واتساب السحابي',
  cashRegister: 'سجل الخزينة والورديات',
  autoReminders: 'التذكير التلقائي للمتأخرات',
  pwaPush: 'إشعارات التطبيق الفورية Push',
  inventory: 'المذكرات والمخزون',
  assignments: 'الواجبات الإلكترونية',
  liveSessions: 'البث المباشر والحصص الأونلاين',
  monthlyReports: 'التقارير الشهرية المجدولة',
  registrationCrm: 'تسجيل الطلاب المحتملين CRM',
  staffPayroll: 'رواتب الموظفين والعمولات',
  installments: 'خطط التقسيط المجدولة',
  multiBranch: 'إدارة الفروع المتعددة',
  gamification: 'نقاط التحفيز ولوحة الشرف',
  aiAssistant: 'المساعد الذكي AI',
};

export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic' as const,
    name: 'الباقة الأساسية',
    monthlyPrice: 1500,
    maxStudents: 150,
    maxUsers: 4,
    subtitle: 'مناسبة للسناتر الصغيرة وبداية التنظيم',
    featureFlags: {
      qrAttendance: false,
      excelExport: true,
      pdfExport: true,
      bulkInvoices: false,
      teacherSettlements: false,
      whatsappOutbox: true,
      biometricFace: false,
      studentPortal: false,
      maxGroups: 12,
      parentPayments: false,
      whatsappAutomation: false,
      cashRegister: false,
      autoReminders: false,
      pwaPush: false,
      inventory: false,
      assignments: false,
      liveSessions: false,
      monthlyReports: false,
      registrationCrm: false,
      staffPayroll: false,
      installments: false,
      multiBranch: false,
      gamification: false,
      aiAssistant: false,
    } satisfies PlanFeatureFlags,
    features: [
      { text: 'حتى 150 طالب نشط', soon: false, included: true },
      { text: '4 مستخدمين بصلاحيات محددة', soon: false, included: true },
      { text: 'تسجيل الحضور وإدارة المجموعات', soon: false, included: true },
      { text: 'إصدار إيصالات السداد PDF', soon: false, included: true },
      { text: 'منصة الطالب والدخول بالأكواد', soon: false, included: false },
      { text: 'تسويات المدرسين والتقارير المتقدمة', soon: false, included: false },
    ],
  },
  {
    id: 'pro' as const,
    name: 'الباقة الاحترافية',
    monthlyPrice: 2800,
    maxStudents: 600,
    maxUsers: 12,
    subtitle: 'الأكثر طلباً للسناتر المتوسطة والكبيرة',
    popular: true,
    featureFlags: {
      qrAttendance: true,
      excelExport: true,
      pdfExport: true,
      bulkInvoices: true,
      teacherSettlements: true,
      whatsappOutbox: true,
      biometricFace: false,
      studentPortal: true,
      maxGroups: 80,
      parentPayments: true,
      whatsappAutomation: true,
      cashRegister: true,
      autoReminders: true,
      pwaPush: true,
      inventory: true,
      assignments: true,
      liveSessions: true,
      monthlyReports: true,
      registrationCrm: true,
      staffPayroll: true,
      installments: true,
      multiBranch: false,
      gamification: false,
      aiAssistant: false,
    } satisfies PlanFeatureFlags,
    features: [
      { text: 'حتى 600 طالب نشط', soon: false, included: true },
      { text: '12 مستخدم بصلاحيات متقدمة', soon: false, included: true },
      { text: 'منصة الطالب وأكواد الدخول الشخصية', soon: false, included: true },
      { text: 'مسح QR Code لبطاقات الطلاب', soon: false, included: true },
      { text: 'بوابة أولياء الأمور الكاملة + تنبيهات واتساب', soon: false, included: true },
      { text: 'الفواتير الجماعية وتصدير Excel / PDF', soon: false, included: true },
    ],
  },
  {
    id: 'enterprise' as const,
    name: 'الباقة المتكاملة',
    monthlyPrice: 4800,
    maxStudents: 2500,
    maxUsers: 30,
    subtitle: 'للمراكز متعددة الفروع والأعداد الكبيرة',
    featureFlags: {
      qrAttendance: true,
      excelExport: true,
      pdfExport: true,
      bulkInvoices: true,
      teacherSettlements: true,
      whatsappOutbox: true,
      biometricFace: true,
      studentPortal: true,
      maxGroups: 500,
      parentPayments: true,
      whatsappAutomation: true,
      cashRegister: true,
      autoReminders: true,
      pwaPush: true,
      inventory: true,
      assignments: true,
      liveSessions: true,
      monthlyReports: true,
      registrationCrm: true,
      staffPayroll: true,
      installments: true,
      multiBranch: true,
      gamification: true,
      aiAssistant: true,
    } satisfies PlanFeatureFlags,
    features: [
      { text: 'حتى 2,500 طالب نشط عبر الفروع', soon: false, included: true },
      { text: '30 مستخدم وصلاحيات مخصصة', soon: false, included: true },
      { text: 'جميع مزايا الباقة الاحترافية ومنصة الطالب', soon: false, included: true },
      { text: 'مسح QR Code لبطاقات الطلاب', soon: false, included: true },
      { text: 'تصدير التقارير المالية وسجلات الحضور PDF', soon: false, included: true },
      { text: 'إدارة الفروع المتعددة والمساعد الذكي AI', soon: false, included: true },
    ],
  },
];

export function getPlanConfig(planId: CenterSettings['currentPlanId']) {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId) || SUBSCRIPTION_PLANS[1];
}

export function isPlanFeatureEnabled(
  planId: CenterSettings['currentPlanId'],
  flag: keyof PlanFeatureFlags,
  settings?: Pick<CenterSettings, 'planFeatureOverrides'>
): boolean {
  const overrideVal = settings?.planFeatureOverrides?.[planId]?.[flag as string];
  if (typeof overrideVal === 'boolean') {
    return overrideVal;
  }
  const plan = getPlanConfig(planId);
  return Boolean(plan.featureFlags[flag]);
}

export function isStudentPortalEnabled(settings: CenterSettings): boolean {
  return (
    isPlanFeatureEnabled(settings.currentPlanId, 'studentPortal', settings) &&
    settings.studentPortalEnabled !== false
  );
}

export const BILLING_HISTORY: {
  id: string;
  date: string;
  planName: string;
  amount: number;
  method: string;
  status: 'paid';
  receiptNo: string;
}[] = [];
