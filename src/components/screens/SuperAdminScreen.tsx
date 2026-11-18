import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  Globe,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useEduflow } from '../../context/EduflowContext';
import {
  ActivityLogEntry,
  Center,
  CenterAccountStatus,
  PlatformLanguageCode,
  PlatformSettings,
  SaasPaymentMethod,
  SaasPlanConfig,
  SaasSubscriptionRecord,
  SaasSubscriptionStatus,
  SystemUser,
  UserRole,
} from '../../types/eduflow';
import {
  BooleanPlanFeatureKey,
  PLAN_FEATURE_LABELS,
  PLATFORM_CENTER_ID,
} from '../../data/seedData';
import {
  ALL_PLATFORM_USER_ROLES,
  buildPlatformAuditCsv,
  computeCenterCapacityUsage,
  computePlatformRevenueMetrics,
  computeTrialDaysRemaining,
  filterPlatformAuditLogs,
} from '../../features/superAdmin/platformService';
import { downloadCsvFile } from '../../features/export/excelExport';
import { formatEGP } from '../../utils/eduflowLogic';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Modal,
  SelectInput,
  StatusChip,
  TextInput,
} from '../ui/Primitives';

type SuperAdminTabId =
  | 'overview'
  | 'centers'
  | 'subscriptions'
  | 'payments'
  | 'plans'
  | 'users'
  | 'audit'
  | 'settings';

const CENTER_STATUS_META: Record<
  CenterAccountStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  active: { label: 'نشط', tone: 'success' },
  trial: { label: 'فترة تجريبية', tone: 'warning' },
  suspended: { label: 'موقوف مؤقتاً', tone: 'danger' },
  disabled: { label: 'معطّل', tone: 'neutral' },
};

const SUB_STATUS_META: Record<
  SaasSubscriptionStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'navy' }
> = {
  active: { label: 'اشتراك سارٍ', tone: 'success' },
  trial: { label: 'تجربة مجانية', tone: 'navy' },
  grace_period: { label: 'فترة سماح', tone: 'warning' },
  overdue: { label: 'متأخر السداد', tone: 'danger' },
  suspended: { label: 'موقوف', tone: 'danger' },
  cancelled: { label: 'ملغى', tone: 'neutral' },
};

const BOOLEAN_FEATURE_KEYS = Object.keys(PLAN_FEATURE_LABELS) as BooleanPlanFeatureKey[];

export const SuperAdminScreen: React.FC = () => {
  const {
    authSession,
    centers,
    students,
    groups,
    users,
    activityLog,
    saasPlans,
    saasSubscriptions,
    saasPayments,
    platformSettings,
    createCenterAccount,
    updateCenterAccountStatus,
    upsertSaasPlan,
    updateSaasSubscription,
    recordSaasPayment,
    createOrUpdatePlatformUser,
    updatePlatformSettings,
    showToast,
  } = useEduflow();

  const [activeTab, setActiveTab] = useState<SuperAdminTabId>('overview');

  // Search & Filter states
  const [centerSearch, setCenterSearch] = useState('');
  const [centerStatusFilter, setCenterStatusFilter] = useState<'all' | CenterAccountStatus>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | SaasSubscriptionStatus>('all');
  const [subSearch, setSubSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userCenterFilter, setUserCenterFilter] = useState<string>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | SystemUser['status']>('all');
  const [auditCenterFilter, setAuditCenterFilter] = useState<string>('all');
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Create Center Drawer
  const [createCenterOpen, setCreateCenterOpen] = useState(false);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterGov, setNewCenterGov] = useState('القاهرة');
  const [newCenterCity, setNewCenterCity] = useState('');
  const [newCenterPhone, setNewCenterPhone] = useState('');
  const [newCenterPlanId, setNewCenterPlanId] = useState('pro');
  const [newCenterStartTrial, setNewCenterStartTrial] = useState(true);
  const [newCenterTrialDays, setNewCenterTrialDays] = useState(
    String(platformSettings.defaultTrialDays || 14)
  );
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('Center3571');
  const [creatingCenter, setCreatingCenter] = useState(false);

  // Confirm Center Status Modal
  const [pendingCenterAction, setPendingCenterAction] = useState<{
    center: Center;
    nextStatus: CenterAccountStatus;
  } | null>(null);

  // Edit Subscription / Extend Trial Modal
  const [editingSub, setEditingSub] = useState<SaasSubscriptionRecord | null>(null);
  const [subDraftStatus, setSubDraftStatus] = useState<SaasSubscriptionStatus>('active');
  const [subDraftPlanId, setSubDraftPlanId] = useState('pro');
  const [subDraftCycle, setSubDraftCycle] = useState<'monthly' | 'annual'>('monthly');
  const [subExtendDays, setSubExtendDays] = useState('0');
  const [subRenewMonths, setSubRenewMonths] = useState('0');
  const [subOverdueInput, setSubOverdueInput] = useState('0');
  const [subAutoRenew, setSubAutoRenew] = useState(true);
  const [subNotes, setSubNotes] = useState('');

  // Record SaaS Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payCenterId, setPayCenterId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCycle, setPayCycle] = useState<'monthly' | 'annual'>('monthly');
  const [payMethod, setPayMethod] = useState<SaasPaymentMethod>('إنستاباي');
  const [payPeriodLabel, setPayPeriodLabel] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Plan Editor Drawer
  const [editingPlan, setEditingPlan] = useState<SaasPlanConfig | null>(null);
  const [isNewPlan, setIsNewPlan] = useState(false);

  // Platform User Drawer
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [uCenterId, setUCenterId] = useState(PLATFORM_CENTER_ID);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uRole, setURole] = useState<UserRole>(UserRole.OWNER);
  const [uStatus, setUStatus] = useState<SystemUser['status']>('active');
  const [uPassword, setUPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Audit Diff Modal
  const [inspectLogEntry, setInspectLogEntry] = useState<ActivityLogEntry | null>(null);

  // Platform Settings Draft
  const [settingsDraft, setSettingsDraft] = useState<PlatformSettings>(platformSettings);

  useEffect(() => {
    setSettingsDraft(platformSettings);
    setNewCenterTrialDays(String(platformSettings.defaultTrialDays || 14));
  }, [platformSettings]);

  const metrics = useMemo(
    () =>
      computePlatformRevenueMetrics({
        centers,
        subscriptions: saasSubscriptions,
        payments: saasPayments,
      }),
    [centers, saasSubscriptions, saasPayments]
  );

  const centerNamesById = useMemo(() => {
    const m = new Map<string, string>();
    m.set(PLATFORM_CENTER_ID, 'المنصة بالكامل');
    centers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centers]);

  const subByCenterId = useMemo(() => {
    const m = new Map<string, SaasSubscriptionRecord>();
    saasSubscriptions.forEach((s) => m.set(s.centerId, s));
    return m;
  }, [saasSubscriptions]);

  const planById = useMemo(() => {
    const m = new Map<string, SaasPlanConfig>();
    saasPlans.forEach((p) => m.set(p.id, p));
    return m;
  }, [saasPlans]);

  const filteredCenters = useMemo(() => {
    const q = centerSearch.trim().toLowerCase();
    return centers.filter((c) => {
      const st = c.status || 'active';
      if (centerStatusFilter !== 'all' && st !== centerStatusFilter) return false;
      if (q) {
        const hay = `${c.name} ${c.governorate} ${c.city} ${c.ownerName || ''} ${c.ownerEmail || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [centers, centerSearch, centerStatusFilter]);

  const filteredSubscriptions = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return saasSubscriptions.filter((s) => {
      if (subStatusFilter !== 'all' && s.status !== subStatusFilter) return false;
      if (q) {
        const hay = `${s.centerName} ${s.planName} ${s.nextBillingDate}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [saasSubscriptions, subStatusFilter, subSearch]);

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    return [...saasPayments]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .filter((p) => {
        if (!q) return true;
        return `${p.receiptNo} ${p.centerName} ${p.planName} ${p.method} ${p.periodLabel}`
          .toLowerCase()
          .includes(q);
      });
  }, [saasPayments, paymentSearch]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userCenterFilter !== 'all' && u.centerId !== userCenterFilter) return false;
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userStatusFilter !== 'all' && u.status !== userStatusFilter) return false;
      if (q) {
        const hay = `${u.name} ${u.email} ${u.phone} ${u.role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, userCenterFilter, userRoleFilter, userStatusFilter, userSearch]);

  const filteredLogs = useMemo(
    () =>
      filterPlatformAuditLogs(
        [...activityLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        {
          centerId: auditCenterFilter,
          actorRole: auditRoleFilter,
          actionPrefix: auditActionFilter,
          search: auditSearch,
        }
      ),
    [activityLog, auditCenterFilter, auditRoleFilter, auditActionFilter, auditSearch]
  );

  const attentionSubscriptions = useMemo(() => {
    return saasSubscriptions.filter((sub) => {
      if (sub.status === 'overdue' || sub.status === 'grace_period' || sub.status === 'trial') {
        return true;
      }
      const days = computeTrialDaysRemaining(sub.nextBillingDate);
      return sub.status === 'active' && days <= 14;
    });
  }, [saasSubscriptions]);

  const openEditSubscription = (sub: SaasSubscriptionRecord) => {
    setEditingSub(sub);
    setSubDraftStatus(sub.status);
    setSubDraftPlanId(sub.planId);
    setSubDraftCycle(sub.billingCycle);
    setSubExtendDays('0');
    setSubRenewMonths('0');
    setSubOverdueInput(String(sub.overdueAmount || 0));
    setSubAutoRenew(sub.autoRenew);
    setSubNotes(sub.notes || '');
  };

  const openRecordPaymentForCenter = (centerId?: string) => {
    const targetCenter =
      centers.find((c) => c.id === centerId) || centers[0];
    if (!targetCenter) return;
    const sub = subByCenterId.get(targetCenter.id);
    const plan = planById.get(sub?.planId || targetCenter.currentPlanId) || saasPlans[0];
    setPayCenterId(targetCenter.id);
    setPayCycle(sub?.billingCycle || 'monthly');
    setPayAmount(
      String(
        sub?.overdueAmount && sub.overdueAmount > 0
          ? sub.overdueAmount
          : plan?.monthlyPrice || 2800
      )
    );
    setPayMethod('إنستاباي');
    setPayPeriodLabel(new Date().toISOString().slice(0, 7));
    setPayNotes('');
    setPaymentModalOpen(true);
  };

  const openCreatePlan = () => {
    setIsNewPlan(true);
    setEditingPlan({
      id: `plan-${Date.now().toString(36)}`,
      name: '',
      subtitle: '',
      monthlyPrice: 2000,
      annualMonthsCharged: 10,
      maxStudents: 300,
      maxUsers: 8,
      maxGroups: 40,
      popular: false,
      active: true,
      featureFlags: {
        qrAttendance: true,
        excelExport: true,
        pdfExport: true,
        bulkInvoices: true,
        teacherSettlements: true,
        whatsappOutbox: true,
        biometricFace: false,
        studentPortal: true,
        maxGroups: 40,
        parentPayments: true,
        whatsappAutomation: false,
        cashRegister: true,
        autoReminders: false,
        pwaPush: false,
        inventory: true,
        assignments: true,
        liveSessions: true,
        monthlyReports: true,
        registrationCrm: true,
        staffPayroll: false,
        installments: true,
        multiBranch: false,
        gamification: false,
        aiAssistant: false,
      },
      features: [
        { text: 'حتى 300 طالب نشط', included: true },
        { text: '8 مستخدمين بصلاحيات محددة', included: true },
        { text: 'منصة الطالب والامتحانات الأونلاين', included: true },
      ],
    });
  };

  const openEditPlan = (plan: SaasPlanConfig) => {
    setIsNewPlan(false);
    setEditingPlan({
      ...plan,
      featureFlags: { ...plan.featureFlags },
      features: plan.features.map((f) => ({ ...f })),
    });
  };

  const openUserDrawer = (existing?: SystemUser) => {
    if (existing) {
      setEditingUser(existing);
      setUCenterId(existing.centerId || PLATFORM_CENTER_ID);
      setUName(existing.name);
      setUEmail(existing.email);
      setUPhone(existing.phone || '');
      setURole(existing.role);
      setUStatus(existing.status);
      setUPassword('');
    } else {
      setEditingUser(null);
      setUCenterId(centers[0]?.id || PLATFORM_CENTER_ID);
      setUName('');
      setUEmail('');
      setUPhone('');
      setURole(UserRole.ADMIN);
      setUStatus('active');
      setUPassword('Eduflow3571');
    }
    setUserDrawerOpen(true);
  };

  const tabs: { id: SuperAdminTabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'نظرة عامة والإيرادات', icon: <Activity className="w-4 h-4" /> },
    { id: 'centers', label: 'السناتر والحسابات', icon: <Building2 className="w-4 h-4" /> },
    { id: 'subscriptions', label: 'الاشتراكات والتجديد', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'payments', label: 'الإيرادات والمدفوعات', icon: <Wallet className="w-4 h-4" /> },
    { id: 'plans', label: 'الباقات والحدود', icon: <Layers className="w-4 h-4" /> },
    { id: 'users', label: 'مستخدمو المنصة', icon: <Users className="w-4 h-4" /> },
    { id: 'audit', label: 'سجل Audit Logs', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'settings', label: 'إعدادات المنتج واللغات', icon: <Globe className="w-4 h-4" /> },
  ];

  const handleToggleLanguage = (lang: PlatformLanguageCode) => {
    setSettingsDraft((prev) => {
      const exists = prev.enabledLanguages.includes(lang);
      const next = exists
        ? prev.enabledLanguages.filter((l) => l !== lang)
        : [...prev.enabledLanguages, lang];
      if (next.length === 0) return prev;
      return {
        ...prev,
        enabledLanguages: next,
        defaultLanguage: next.includes(prev.defaultLanguage) ? prev.defaultLanguage : next[0],
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Summary Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5B6B80]">
            <span>{platformSettings.productName} SaaS</span>
            <span aria-hidden="true">·</span>
            <span>فترة التجربة الافتراضية {platformSettings.defaultTrialDays} يوم</span>
            <span aria-hidden="true">·</span>
            <span>{centers.length} سنتر مسجل</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0F2A4A] mt-1">
            لوحة تحكم مدير المنصة (Super Admin)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Receipt className="w-4 h-4 text-[#0F766E]" />}
            onClick={() => openRecordPaymentForCenter()}
          >
            تسجيل دفعة اشتراك
          </Button>
          <Button
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateCenterOpen(true)}
          >
            إنشاء سنتر جديد
          </Button>
        </div>
      </div>

      {/* Multi-row Responsive Console Navigation */}
      <div
        role="tablist"
        aria-label="أقسام إدارة المنصة"
        className="flex flex-wrap items-center gap-1 p-1.5 bg-white border border-[#E2E8F0] rounded-[10px]"
      >
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[40px] px-3 py-2 rounded-[7px] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0F2A4A] text-white'
                  : 'text-[#5B6B80] hover:text-[#0F2A4A] hover:bg-slate-50'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Overview & Revenue */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-1.5">
              <span className="text-xs font-semibold text-[#5B6B80]">
                الإيراد الشهري المتكرر (MRR)
              </span>
              <p className="text-2xl font-bold text-[#0F2A4A] tabular-nums">
                {formatEGP(metrics.mrr)}
              </p>
              <p className="text-xs text-[#0F766E] font-semibold tabular-nums">
                السنوي المتوقع (ARR): {formatEGP(metrics.arr)}
              </p>
            </Card>

            <Card className="p-5 space-y-1.5">
              <span className="text-xs font-semibold text-[#5B6B80]">
                إجمالي الإيرادات المحصّلة
              </span>
              <p className="text-2xl font-bold text-[#065F46] tabular-nums">
                {formatEGP(metrics.collectedRevenueTotal)}
              </p>
              <p className="text-xs text-[#5B6B80] tabular-nums">
                تحصيل هذا الشهر: <strong>{formatEGP(metrics.collectedThisMonth)}</strong>
              </p>
            </Card>

            <Card className="p-5 space-y-1.5">
              <span className="text-xs font-semibold text-[#5B6B80]">السناتر المسجلة</span>
              <p className="text-2xl font-bold text-[#0F2A4A] tabular-nums">
                {metrics.totalCenters}
              </p>
              <p className="text-xs text-[#5B6B80] tabular-nums">
                نشط {metrics.activeCenters} · تجريبي {metrics.trialCenters} · موقوف{' '}
                {metrics.suspendedCenters + metrics.disabledCenters}
              </p>
            </Card>

            <Card className="p-5 space-y-1.5">
              <span className="text-xs font-semibold text-[#5B6B80]">
                المتأخرات وتجديدات 7 أيام
              </span>
              <p className="text-2xl font-bold text-[#991B1B] tabular-nums">
                {formatEGP(metrics.overdueDuesTotal)}
              </p>
              <p className="text-xs text-[#5B6B80] tabular-nums">
                متأخرة {metrics.overdueSubscriptions} · قريبة التجديد {metrics.renewingSoonCount}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Card padding="p-0" className="lg:col-span-7 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2A4A]">
                    اشتراكات تتطلب متابعة أو تجديداً
                  </h3>
                  <p className="text-xs text-[#5B6B80]">
                    الاشتراكات التجريبية، فترات السماح، المتأخرات، والتجديد القريب
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('subscriptions')}
                >
                  عرض الكل
                </Button>
              </div>
              {attentionSubscriptions.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#5B6B80]">
                  جميع اشتراكات السناتر منتظمة ولا توجد متأخرات أو فترات قريبة الانتهاء.
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {attentionSubscriptions.slice(0, 6).map((sub) => {
                    const meta = SUB_STATUS_META[sub.status];
                    const remDays = computeTrialDaysRemaining(sub.trialEndsAt || sub.nextBillingDate);
                    return (
                      <div
                        key={sub.id}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#0F2A4A]">
                              {sub.centerName}
                            </span>
                            <StatusChip tone={meta.tone} label={meta.label} />
                          </div>
                          <p className="text-xs text-[#5B6B80] tabular-nums">
                            {sub.planName} · التجديد: {sub.nextBillingDate}
                            {sub.status === 'trial' ? ` (متبقي ${remDays} يوم)` : ''}
                            {sub.overdueAmount > 0 ? ` · متأخرات ${formatEGP(sub.overdueAmount)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditSubscription(sub)}
                          >
                            تحديث / تمديد
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openRecordPaymentForCenter(sub.centerId)}
                          >
                            تحصيل
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card padding="p-0" className="lg:col-span-5 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2A4A]">أحدث مدفوعات المنصة</h3>
                  <p className="text-xs text-[#5B6B80]">سجل تحصيل اشتراكات السناتر</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('payments')}>
                  السجل الكامل
                </Button>
              </div>
              {filteredPayments.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#5B6B80]">
                  لا توجد مدفوعات مسجلة بعد.
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {filteredPayments.slice(0, 6).map((pay) => (
                    <div
                      key={pay.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[#0F2A4A] truncate">{pay.centerName}</p>
                        <p className="text-[#5B6B80] tabular-nums">
                          {pay.receiptNo} · {pay.method} · {pay.paidAt}
                        </p>
                      </div>
                      <span className="font-bold text-[#065F46] tabular-nums shrink-0">
                        {formatEGP(pay.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Centers & Account Creation / Suspension */}
      {activeTab === 'centers' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-[#5B6B80] absolute right-3 top-3 pointer-events-none" />
                <TextInput
                  placeholder="ابحث باسم السنتر أو المالك أو المدينة..."
                  value={centerSearch}
                  onChange={(e) => setCenterSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <SelectInput
                aria-label="تصفية حسب حالة السنتر"
                value={centerStatusFilter}
                onChange={(e) =>
                  setCenterStatusFilter(e.target.value as 'all' | CenterAccountStatus)
                }
                className="w-44"
              >
                <option value="all">كل الحالات ({centers.length})</option>
                <option value="active">نشط ({metrics.activeCenters})</option>
                <option value="trial">فترة تجريبية ({metrics.trialCenters})</option>
                <option value="suspended">موقوف مؤقتاً ({metrics.suspendedCenters})</option>
                <option value="disabled">معطّل ({metrics.disabledCenters})</option>
              </SelectInput>
            </div>
          </div>

          {filteredCenters.length === 0 ? (
            <EmptyState
              title="لا توجد سناتر مطابقة"
              description="عدّل معايير البحث أو أنشئ حساب سنتر جديد على المنصة."
              actionLabel="إنشاء سنتر جديد"
              onAction={() => setCreateCenterOpen(true)}
            />
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#E2E8F0] font-bold text-[#5B6B80]">
                      <th className="py-3 px-4">السنتر والموقع</th>
                      <th className="py-3 px-4">المالك</th>
                      <th className="py-3 px-4">الباقة</th>
                      <th className="py-3 px-4">السعة المستخدمة</th>
                      <th className="py-3 px-4">الحالة والتجربة</th>
                      <th className="py-3 px-4 text-left">إدارة الحساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredCenters.map((center) => {
                      const status = center.status || 'active';
                      const statusMeta = CENTER_STATUS_META[status];
                      const plan = planById.get(center.currentPlanId) || saasPlans[0];
                      const sub = subByCenterId.get(center.id);
                      const cap = computeCenterCapacityUsage({
                        studentsUsed: students.filter((s) => s.centerId === center.id).length,
                        usersUsed: users.filter((u) => u.centerId === center.id).length,
                        groupsUsed: groups.filter((g) => g.centerId === center.id).length,
                        plan,
                      });
                      const trialRem =
                        status === 'trial'
                          ? computeTrialDaysRemaining(center.trialEndsAt || sub?.trialEndsAt)
                          : 0;
                      return (
                        <tr key={center.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <p className="text-sm font-bold text-[#0F2A4A]">{center.name}</p>
                            <p className="text-[#5B6B80]">
                              {center.governorate} · {center.city}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#1E293B]">
                              {center.ownerName || 'إدارة السنتر'}
                            </p>
                            <p className="text-[#5B6B80]" dir="ltr">
                              {center.ownerEmail || center.phone || '—'}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-bold text-[#0F2A4A]">{plan.name}</p>
                            <p className="text-[#5B6B80] tabular-nums">
                              {formatEGP(plan.monthlyPrice)} / شهرياً
                            </p>
                          </td>
                          <td className="py-3 px-4 tabular-nums">
                            <p className={cap.overLimit ? 'text-[#991B1B] font-bold' : 'text-[#1E293B]'}>
                              طلاب: {cap.studentsUsed} / {cap.studentsMax}
                            </p>
                            <p className="text-[#5B6B80]">
                              مستخدمون: {cap.usersUsed} / {cap.usersMax} · مجموعات: {cap.groupsUsed} /{' '}
                              {cap.groupsMax}
                            </p>
                          </td>
                          <td className="py-3 px-4 space-y-1">
                            <StatusChip tone={statusMeta.tone} label={statusMeta.label} />
                            {status === 'trial' && (
                              <p className="text-[11px] text-[#0F2A4A] tabular-nums">
                                متبقي {trialRem} يوم (حتى {center.trialEndsAt || sub?.trialEndsAt})
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-left">
                            <div className="inline-flex items-center gap-1.5">
                              {status !== 'active' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<PlayCircle className="w-3.5 h-3.5 text-[#065F46]" />}
                                  onClick={() =>
                                    setPendingCenterAction({ center, nextStatus: 'active' })
                                  }
                                >
                                  تفعيل
                                </Button>
                              )}
                              {status !== 'suspended' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<PauseCircle className="w-3.5 h-3.5 text-[#92400E]" />}
                                  onClick={() =>
                                    setPendingCenterAction({ center, nextStatus: 'suspended' })
                                  }
                                >
                                  تعليق
                                </Button>
                              )}
                              {status !== 'disabled' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    setPendingCenterAction({ center, nextStatus: 'disabled' })
                                  }
                                >
                                  تعطيل
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: Subscriptions, Free Trial & Renewals */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-[#5B6B80] absolute right-3 top-3 pointer-events-none" />
                <TextInput
                  placeholder="ابحث باسم السنتر أو الباقة..."
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <SelectInput
                aria-label="تصفية الاشتراكات"
                value={subStatusFilter}
                onChange={(e) =>
                  setSubStatusFilter(e.target.value as 'all' | SaasSubscriptionStatus)
                }
                className="w-48"
              >
                <option value="all">كل الاشتراكات ({saasSubscriptions.length})</option>
                <option value="active">سارٍ ({metrics.activeSubscriptions})</option>
                <option value="trial">فترة تجريبية ({metrics.trialSubscriptions})</option>
                <option value="grace_period">فترة سماح ({metrics.graceSubscriptions})</option>
                <option value="overdue">متأخر السداد ({metrics.overdueSubscriptions})</option>
                <option value="suspended">موقوف</option>
                <option value="cancelled">ملغى</option>
              </SelectInput>
            </div>
            <div className="text-xs text-[#5B6B80]">
              المدة الافتراضية للفترة التجريبية: <strong className="text-[#0F2A4A]">{platformSettings.defaultTrialDays} يوم</strong>
            </div>
          </div>

          {filteredSubscriptions.length === 0 ? (
            <EmptyState
              title="لا توجد اشتراكات مطابقة"
              description="لا توجد سجلات اشتراك مطابقة لعوامل التصفية المختارة."
            />
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#E2E8F0] font-bold text-[#5B6B80]">
                      <th className="py-3 px-4">السنتر</th>
                      <th className="py-3 px-4">الباقة والدورة</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4">نهاية التجربة / الفترة</th>
                      <th className="py-3 px-4">القيمة الشهرية</th>
                      <th className="py-3 px-4">المتأخرات</th>
                      <th className="py-3 px-4 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredSubscriptions.map((sub) => {
                      const meta = SUB_STATUS_META[sub.status];
                      const trialRem = computeTrialDaysRemaining(sub.trialEndsAt);
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-bold text-[#0F2A4A] text-sm">
                            {sub.centerName}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#1E293B]">{sub.planName}</p>
                            <p className="text-[#5B6B80]">
                              {sub.billingCycle === 'annual' ? 'اشتراك سنوي' : 'اشتراك شهري'} ·{' '}
                              {sub.autoRenew ? 'تجديد تلقائي' : 'يدوي'}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <StatusChip tone={meta.tone} label={meta.label} />
                          </td>
                          <td className="py-3 px-4 tabular-nums">
                            <p className="font-semibold text-[#1E293B]">{sub.nextBillingDate}</p>
                            {sub.trialEndsAt && (
                              <p className="text-[#0F766E]">
                                نهاية التجربة: {sub.trialEndsAt} ({trialRem} يوم متبقٍ)
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold tabular-nums text-[#0F2A4A]">
                            {formatEGP(sub.monthlyAmount)}
                          </td>
                          <td className="py-3 px-4 font-bold tabular-nums">
                            {sub.overdueAmount > 0 ? (
                              <span className="text-[#991B1B]">{formatEGP(sub.overdueAmount)}</span>
                            ) : (
                              <span className="text-[#065F46]">0 ج</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-left">
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<RefreshCw className="w-3.5 h-3.5" />}
                                onClick={() => openEditSubscription(sub)}
                              >
                                إدارة / تمديد
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openRecordPaymentForCenter(sub.centerId)}
                              >
                                سداد
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: SaaS Revenue & Payments */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-[#5B6B80] absolute right-3 top-3 pointer-events-none" />
              <TextInput
                placeholder="ابحث برقم الإيصال أو السنتر أو الوسيلة..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => openRecordPaymentForCenter()}
            >
              تسجيل دفعة اشتراك سنتر
            </Button>
          </div>

          {filteredPayments.length === 0 ? (
            <EmptyState
              title="لا توجد مدفوعات مسجلة"
              description="سجّل أول دفعة اشتراك لأي سنتر لتتبع إيرادات المنصة تلقائياً."
              actionLabel="تسجيل دفعة"
              onAction={() => openRecordPaymentForCenter()}
            />
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#E2E8F0] font-bold text-[#5B6B80]">
                      <th className="py-3 px-4">رقم الإيصال</th>
                      <th className="py-3 px-4">التاريخ</th>
                      <th className="py-3 px-4">السنتر</th>
                      <th className="py-3 px-4">الباقة والفترة</th>
                      <th className="py-3 px-4">وسيلة الدفع</th>
                      <th className="py-3 px-4">المبلغ</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4">سُجل بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredPayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-bold text-[#0F2A4A] tabular-nums">
                          {pay.receiptNo}
                        </td>
                        <td className="py-3 px-4 tabular-nums text-[#5B6B80]">{pay.paidAt}</td>
                        <td className="py-3 px-4 font-bold text-[#1E293B]">{pay.centerName}</td>
                        <td className="py-3 px-4">
                          <span>{pay.planName}</span>
                          <span className="text-[#5B6B80] mr-1">({pay.periodLabel})</span>
                        </td>
                        <td className="py-3 px-4 text-[#1E293B]">{pay.method}</td>
                        <td className="py-3 px-4 font-bold text-[#065F46] tabular-nums">
                          {formatEGP(pay.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusChip tone="success" label="مدفوع" />
                        </td>
                        <td className="py-3 px-4 text-[#5B6B80]">{pay.recordedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 5: SaaS Plans, Pricing & Quotas */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0F2A4A]">كتالوج الباقات والأسعار والحدود</h3>
              <p className="text-xs text-[#5B6B80]">
                أي تعديل على الأسعار أو حدود الطلاب والمستخدمين ينعكس مباشرة في صفحة الباقات والصفحة الرئيسية.
              </p>
            </div>
            <Button icon={<Plus className="w-4 h-4" />} onClick={openCreatePlan}>
              إضافة باقة جديدة
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {saasPlans.map((plan) => {
              const enabledFlagsCount = BOOLEAN_FEATURE_KEYS.filter(
                (k) => Boolean(plan.featureFlags[k])
              ).length;
              return (
                <Card
                  key={plan.id}
                  className={`p-5 flex flex-col justify-between space-y-4 ${
                    plan.popular ? 'border-2 border-[#0F766E]' : ''
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-lg font-bold text-[#0F2A4A]">{plan.name}</h4>
                        <p className="text-xs text-[#5B6B80] mt-0.5">{plan.subtitle}</p>
                      </div>
                      <StatusChip
                        tone={plan.active ? 'success' : 'neutral'}
                        label={plan.active ? 'مفعّلة' : 'مخفية'}
                      />
                    </div>

                    <div className="pb-3 border-b border-[#E2E8F0]">
                      <span className="text-2xl font-bold text-[#0F2A4A] tabular-nums">
                        {formatEGP(plan.monthlyPrice)}
                      </span>
                      <span className="text-xs text-[#5B6B80] mr-1">/ شهرياً</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#F4F7FA] p-3 rounded-[8px] tabular-nums">
                      <div>
                        <span className="text-[#5B6B80] block">الطلاب</span>
                        <strong className="text-[#0F2A4A]">{plan.maxStudents}</strong>
                      </div>
                      <div>
                        <span className="text-[#5B6B80] block">المستخدمون</span>
                        <strong className="text-[#0F2A4A]">{plan.maxUsers}</strong>
                      </div>
                      <div>
                        <span className="text-[#5B6B80] block">المجموعات</span>
                        <strong className="text-[#0F2A4A]">{plan.maxGroups}</strong>
                      </div>
                    </div>

                    <p className="text-xs text-[#5B6B80] tabular-nums">
                      المزايا المفعّلة: <strong className="text-[#0F766E]">{enabledFlagsCount}</strong> من{' '}
                      {BOOLEAN_FEATURE_KEYS.length} ميزة
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    icon={<Edit3 className="w-4 h-4 text-[#0F766E]" />}
                    onClick={() => openEditPlan(plan)}
                    className="w-full"
                  >
                    تعديل السعر والحدود والصلاحيات
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: Platform Users & Permissions */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 text-[#5B6B80] absolute right-3 top-3 pointer-events-none" />
                <TextInput
                  placeholder="ابحث بالاسم أو البريد..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <SelectInput
                aria-label="تصفية حسب السنتر"
                value={userCenterFilter}
                onChange={(e) => setUserCenterFilter(e.target.value)}
                className="w-44"
              >
                <option value="all">كل السناتر ({users.length})</option>
                <option value={PLATFORM_CENTER_ID}>إدارة المنصة</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="تصفية حسب الدور"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="w-40"
              >
                <option value="all">كل الأدوار</option>
                {ALL_PLATFORM_USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="تصفية حسب الحالة"
                value={userStatusFilter}
                onChange={(e) =>
                  setUserStatusFilter(e.target.value as 'all' | SystemUser['status'])
                }
                className="w-36"
              >
                <option value="all">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="invited">مدعو</option>
                <option value="disabled">معطّل</option>
              </SelectInput>
            </div>

            <Button icon={<Plus className="w-4 h-4" />} onClick={() => openUserDrawer()}>
              إضافة مستخدم منصة
            </Button>
          </div>

          <Card padding="p-0" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] font-bold text-[#5B6B80]">
                    <th className="py-3 px-4">المستخدم</th>
                    <th className="py-3 px-4">البريد / الهاتف</th>
                    <th className="py-3 px-4">السنتر / النطاق</th>
                    <th className="py-3 px-4">الدور</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4 text-left">تعديل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-bold text-[#0F2A4A]">{u.name}</td>
                      <td className="py-3 px-4 text-[#5B6B80] tabular-nums">
                        <span dir="ltr">{u.email}</span>
                        {u.phone ? ` · ${u.phone}` : ''}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1E293B]">
                        {centerNamesById.get(u.centerId) || u.centerId}
                      </td>
                      <td className="py-3 px-4">
                        <StatusChip
                          tone={u.role === UserRole.SUPER_ADMIN ? 'navy' : 'neutral'}
                          label={u.role}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <StatusChip
                          tone={
                            u.status === 'active'
                              ? 'success'
                              : u.status === 'disabled'
                              ? 'danger'
                              : 'warning'
                          }
                          label={
                            u.status === 'active'
                              ? 'نشط'
                              : u.status === 'disabled'
                              ? 'معطّل'
                              : 'مدعو'
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openUserDrawer(u)}
                          >
                            تعديل
                          </Button>
                          {u.id !== authSession?.userId && (
                            <Button
                              size="sm"
                              variant={u.status === 'disabled' ? 'secondary' : 'destructive'}
                              onClick={() =>
                                createOrUpdatePlatformUser({
                                  existingUserId: u.id,
                                  centerId: u.centerId,
                                  name: u.name,
                                  email: u.email,
                                  phone: u.phone,
                                  role: u.role,
                                  status: u.status === 'disabled' ? 'active' : 'disabled',
                                })
                              }
                            >
                              {u.status === 'disabled' ? 'تفعيل' : 'تعطيل'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 7: Platform Audit Logs */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 text-[#5B6B80] absolute right-3 top-3 pointer-events-none" />
                <TextInput
                  placeholder="بحث في سجل الأحداث..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <SelectInput
                aria-label="تصفية سجل الأحداث حسب السنتر"
                value={auditCenterFilter}
                onChange={(e) => setAuditCenterFilter(e.target.value)}
                className="w-44"
              >
                <option value="all">جميع السناتر والمنصة</option>
                <option value={PLATFORM_CENTER_ID}>المنصة بالكامل</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="تصفية سجل الأحداث حسب الدور"
                value={auditRoleFilter}
                onChange={(e) => setAuditRoleFilter(e.target.value)}
                className="w-36"
              >
                <option value="all">كل الأدوار</option>
                {ALL_PLATFORM_USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="تصفية نوع الإجراء"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="w-40"
              >
                <option value="all">كل الإجراءات</option>
                <option value="platform.">إجراءات مدير المنصة</option>
                <option value="auth.">الدخول والأمان</option>
                <option value="payment.">المدفوعات</option>
                <option value="invoice.">الفواتير</option>
                <option value="student.">الطلاب</option>
                <option value="settings.">الإعدادات</option>
              </SelectInput>
            </div>

            <Button
              variant="secondary"
              icon={<Download className="w-4 h-4 text-[#0F766E]" />}
              onClick={() => {
                const csv = buildPlatformAuditCsv(filteredLogs, centerNamesById);
                downloadCsvFile(
                  `eduflow-platform-audit-${new Date().toISOString().slice(0, 10)}.csv`,
                  csv
                );
                showToast(`تم تصدير ${filteredLogs.length} سجل إلى CSV بنجاح`);
              }}
            >
              تصدير CSV ({filteredLogs.length})
            </Button>
          </div>

          {filteredLogs.length === 0 ? (
            <EmptyState
              title="لا توجد أحداث مطابقة"
              description="تُسجّل جميع العمليات الحساسة على مستوى المنصة والسناتر تلقائياً هنا."
            />
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto max-h-[540px]">
                <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-[#E2E8F0] font-bold text-[#5B6B80]">
                    <tr>
                      <th className="py-3 px-4">الوقت</th>
                      <th className="py-3 px-4">السنتر / النطاق</th>
                      <th className="py-3 px-4">المنفذ</th>
                      <th className="py-3 px-4">الإجراء</th>
                      <th className="py-3 px-4">الملخص</th>
                      <th className="py-3 px-4 text-left">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredLogs.slice(0, 100).map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 tabular-nums text-[#5B6B80] whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('en-GB')}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#1E293B] whitespace-nowrap">
                          {centerNamesById.get(entry.centerId) || entry.centerId}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="font-bold text-[#0F2A4A]">{entry.actorName}</span>
                          <span className="text-[#5B6B80] mr-1">({entry.actorRole})</span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <StatusChip tone="navy" label={entry.action} />
                        </td>
                        <td className="py-2.5 px-4 text-[#1E293B]">{entry.summary}</td>
                        <td className="py-2.5 px-4 text-left">
                          {(entry.before !== undefined || entry.after !== undefined) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Eye className="w-3.5 h-3.5" />}
                              onClick={() => setInspectLogEntry(entry)}
                            >
                              معاينة
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 8: Global Product & Language Settings */}
      {activeTab === 'settings' && (
        <div className="max-w-3xl space-y-5">
          <Card className="p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#0F2A4A]">
                الإعدادات العامة للمنتج واللغات والفترة التجريبية
              </h3>
              <p className="text-xs text-[#5B6B80] mt-1">
                تتحكم هذه الإعدادات بالهوية العامة للمنصة، اللغات المتاحة، ومدة الفترة التجريبية الافتراضية للسناتر الجديدة.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="اسم المنتج العام" htmlFor="ps-name" required>
                <TextInput
                  id="ps-name"
                  value={settingsDraft.productName}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({ ...p, productName: e.target.value }))
                  }
                />
              </Field>
              <Field label="الوصف المختصر للمنصة" htmlFor="ps-tagline">
                <TextInput
                  id="ps-tagline"
                  value={settingsDraft.productTagline}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({ ...p, productTagline: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="مدة الفترة التجريبية (أيام)" htmlFor="ps-trial" required>
                <TextInput
                  id="ps-trial"
                  type="number"
                  min={1}
                  max={365}
                  className="tabular-nums"
                  value={settingsDraft.defaultTrialDays}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({
                      ...p,
                      defaultTrialDays: Number(e.target.value) || 14,
                    }))
                  }
                />
              </Field>
              <Field label="أيام فترة السماح بعد الاستحقاق" htmlFor="ps-grace">
                <TextInput
                  id="ps-grace"
                  type="number"
                  min={0}
                  max={60}
                  className="tabular-nums"
                  value={settingsDraft.gracePeriodDays}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({
                      ...p,
                      gracePeriodDays: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </Field>
              <Field label="العملة الافتراضية" htmlFor="ps-currency">
                <SelectInput
                  id="ps-currency"
                  value={settingsDraft.currencyCode}
                  onChange={(e) => {
                    const code = e.target.value as PlatformSettings['currencyCode'];
                    const sym = code === 'EGP' ? 'ج' : code === 'SAR' ? 'ر.س' : '$';
                    setSettingsDraft((p) => ({
                      ...p,
                      currencyCode: code,
                      currencySymbol: sym,
                    }));
                  }}
                >
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                </SelectInput>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F0]">
              <Field label="اللغة الافتراضية للمنصة" htmlFor="ps-def-lang">
                <SelectInput
                  id="ps-def-lang"
                  value={settingsDraft.defaultLanguage}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({
                      ...p,
                      defaultLanguage: e.target.value as PlatformLanguageCode,
                    }))
                  }
                >
                  {settingsDraft.enabledLanguages.includes('ar') && (
                    <option value="ar">العربية (RTL)</option>
                  )}
                  {settingsDraft.enabledLanguages.includes('en') && (
                    <option value="en">English (LTR)</option>
                  )}
                </SelectInput>
              </Field>

              <Field label="اللغات المفعلة على المنصة">
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex-1 min-h-[44px] px-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center gap-2 text-xs font-bold text-[#0F2A4A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enabledLanguages.includes('ar')}
                      onChange={() => handleToggleLanguage('ar')}
                      className="w-4 h-4 accent-[#0F766E]"
                    />
                    <span>العربية (ar)</span>
                  </label>
                  <label className="flex-1 min-h-[44px] px-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center gap-2 text-xs font-bold text-[#0F2A4A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enabledLanguages.includes('en')}
                      onChange={() => handleToggleLanguage('en')}
                      className="w-4 h-4 accent-[#0F766E]"
                    />
                    <span>English (en)</span>
                  </label>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="بريد الدعم الفني" htmlFor="ps-email">
                <TextInput
                  id="ps-email"
                  type="email"
                  dir="ltr"
                  className="text-right"
                  value={settingsDraft.supportEmail}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({ ...p, supportEmail: e.target.value }))
                  }
                />
              </Field>
              <Field label="هاتف الدعم الفني" htmlFor="ps-phone">
                <TextInput
                  id="ps-phone"
                  dir="ltr"
                  className="text-right tabular-nums"
                  value={settingsDraft.supportPhone}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({ ...p, supportPhone: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0]">
              <label className="p-3.5 rounded-[10px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#0F2A4A] block">
                    السماح بتسجيل سناتر جديدة أونلاين
                  </span>
                  <span className="text-[11px] text-[#5B6B80]">
                    تفعيل معالج إنشاء سنتر جديد من الصفحة الرئيسية
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settingsDraft.allowSelfOnboarding}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({
                      ...p,
                      allowSelfOnboarding: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#0F766E]"
                />
              </label>

              <label className="p-3.5 rounded-[10px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#0F2A4A] block">
                    وضع الصيانة العامة
                  </span>
                  <span className="text-[11px] text-[#5B6B80]">
                    إظهار إشعار صيانة مجدولة للسناتر
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settingsDraft.maintenanceMode}
                  onChange={(e) =>
                    setSettingsDraft((p) => ({
                      ...p,
                      maintenanceMode: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#DC2626]"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => updatePlatformSettings(settingsDraft)}
              >
                حفظ إعدادات المنصة
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Drawer: Create New Center & Owner Account */}
      <Drawer
        open={createCenterOpen}
        onClose={() => setCreateCenterOpen(false)}
        title="إنشاء سنتر جديد وحساب المالك"
        subtitle="يتم إنشاء السنتر وحساب المالك وسجل الاشتراك مباشرة"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateCenterOpen(false)}>
              إلغاء
            </Button>
            <Button
              loading={creatingCenter}
              onClick={async () => {
                setCreatingCenter(true);
                const created = await createCenterAccount({
                  centerName: newCenterName,
                  governorate: newCenterGov,
                  city: newCenterCity,
                  phone: newCenterPhone,
                  planId: newCenterPlanId,
                  startAsTrial: newCenterStartTrial,
                  trialDays: Number(newCenterTrialDays) || platformSettings.defaultTrialDays,
                  ownerName: newOwnerName,
                  ownerEmail: newOwnerEmail,
                  ownerPhone: newOwnerPhone,
                  ownerPassword: newOwnerPassword,
                });
                setCreatingCenter(false);
                if (created) {
                  setCreateCenterOpen(false);
                  setNewCenterName('');
                  setNewCenterCity('');
                  setNewCenterPhone('');
                  setNewOwnerName('');
                  setNewOwnerEmail('');
                  setNewOwnerPhone('');
                }
              }}
            >
              إنشاء السنتر وتفعيل الحساب
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="اسم السنتر" htmlFor="nc-name" required>
              <TextInput
                id="nc-name"
                placeholder="مثال: سنتر النجاح التعليمي"
                value={newCenterName}
                onChange={(e) => setNewCenterName(e.target.value)}
              />
            </Field>
            <Field label="هاتف السنتر" htmlFor="nc-phone">
              <TextInput
                id="nc-phone"
                dir="ltr"
                className="text-right tabular-nums"
                placeholder="01012345678"
                value={newCenterPhone}
                onChange={(e) => setNewCenterPhone(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="المحافظة" htmlFor="nc-gov">
              <TextInput
                id="nc-gov"
                value={newCenterGov}
                onChange={(e) => setNewCenterGov(e.target.value)}
              />
            </Field>
            <Field label="المدينة / الحي" htmlFor="nc-city">
              <TextInput
                id="nc-city"
                placeholder="مدينة نصر"
                value={newCenterCity}
                onChange={(e) => setNewCenterCity(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الباقة المختارة" htmlFor="nc-plan">
              <SelectInput
                id="nc-plan"
                value={newCenterPlanId}
                onChange={(e) => setNewCenterPlanId(e.target.value)}
              >
                {saasPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatEGP(p.monthlyPrice)}/شهر)
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="مدة الفترة التجريبية (أيام)" htmlFor="nc-trial-days">
              <TextInput
                id="nc-trial-days"
                type="number"
                min={1}
                disabled={!newCenterStartTrial}
                className="tabular-nums"
                value={newCenterTrialDays}
                onChange={(e) => setNewCenterTrialDays(e.target.value)}
              />
            </Field>
          </div>

          <label className="p-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between text-xs font-bold text-[#0F2A4A] cursor-pointer">
            <span>بدء الحساب كفترة تجريبية مجانية (Free Trial)</span>
            <input
              type="checkbox"
              checked={newCenterStartTrial}
              onChange={(e) => setNewCenterStartTrial(e.target.checked)}
              className="w-4 h-4 accent-[#0F766E]"
            />
          </label>

          <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
            <p className="text-xs font-bold text-[#0F2A4A]">بيانات حساب مالك السنتر</p>
            <Field label="اسم المالك" htmlFor="nc-owner-name" required>
              <TextInput
                id="nc-owner-name"
                placeholder="أ. كريم محمود"
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="البريد الإلكتروني للمالك" htmlFor="nc-owner-email" required>
                <TextInput
                  id="nc-owner-email"
                  type="email"
                  dir="ltr"
                  className="text-right"
                  placeholder="owner@center.demo"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                />
              </Field>
              <Field label="موبايل المالك" htmlFor="nc-owner-phone">
                <TextInput
                  id="nc-owner-phone"
                  dir="ltr"
                  className="text-right tabular-nums"
                  value={newOwnerPhone}
                  onChange={(e) => setNewOwnerPhone(e.target.value)}
                />
              </Field>
            </div>
            <Field label="كلمة السر المبدئية" htmlFor="nc-owner-pass" required>
              <TextInput
                id="nc-owner-pass"
                dir="ltr"
                className="text-right"
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Drawer>

      {/* Modal: Confirm Center Status Change */}
      <Modal
        open={Boolean(pendingCenterAction)}
        onClose={() => setPendingCenterAction(null)}
        title="تأكيد تغيير حالة حساب السنتر"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingCenterAction(null)}>
              إلغاء
            </Button>
            <Button
              variant={
                pendingCenterAction?.nextStatus === 'active' ? 'primary' : 'destructive'
              }
              onClick={() => {
                if (pendingCenterAction) {
                  updateCenterAccountStatus(
                    pendingCenterAction.center.id,
                    pendingCenterAction.nextStatus
                  );
                  setPendingCenterAction(null);
                }
              }}
            >
              تأكيد الإجراء
            </Button>
          </>
        }
      >
        {pendingCenterAction && (
          <div className="flex items-start gap-3 text-sm text-[#1E293B]">
            <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
            <p>
              هل تريد تغيير حالة سنتر <strong>«{pendingCenterAction.center.name}»</strong> إلى{' '}
              <strong>{CENTER_STATUS_META[pendingCenterAction.nextStatus].label}</strong>؟ عند
              التعليق أو التعطيل يُمنع دخول جميع مستخدمي السنتر فوراً.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal: Update Subscription / Extend Trial */}
      <Modal
        open={Boolean(editingSub)}
        onClose={() => setEditingSub(null)}
        title={`إدارة اشتراك ${editingSub?.centerName || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingSub(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (!editingSub) return;
                updateSaasSubscription({
                  subscriptionId: editingSub.id,
                  status: subDraftStatus,
                  planId: subDraftPlanId,
                  billingCycle: subDraftCycle,
                  extendTrialDays: Number(subExtendDays) || 0,
                  renewMonths: Number(subRenewMonths) || 0,
                  overdueAmount: Number(subOverdueInput) || 0,
                  autoRenew: subAutoRenew,
                  notes: subNotes,
                });
                setEditingSub(null);
              }}
            >
              حفظ التعديلات
            </Button>
          </>
        }
      >
        {editingSub && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="الباقة" htmlFor="es-plan">
                <SelectInput
                  id="es-plan"
                  value={subDraftPlanId}
                  onChange={(e) => setSubDraftPlanId(e.target.value)}
                >
                  {saasPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatEGP(p.monthlyPrice)})
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="حالة الاشتراك" htmlFor="es-status">
                <SelectInput
                  id="es-status"
                  value={subDraftStatus}
                  onChange={(e) =>
                    setSubDraftStatus(e.target.value as SaasSubscriptionStatus)
                  }
                >
                  <option value="active">اشتراك سارٍ</option>
                  <option value="trial">تجربة مجانية</option>
                  <option value="grace_period">فترة سماح</option>
                  <option value="overdue">متأخر السداد</option>
                  <option value="suspended">موقوف</option>
                  <option value="cancelled">ملغى</option>
                </SelectInput>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="تمديد التجربة (+أيام)" htmlFor="es-ext">
                <TextInput
                  id="es-ext"
                  type="number"
                  min={0}
                  className="tabular-nums"
                  value={subExtendDays}
                  onChange={(e) => setSubExtendDays(e.target.value)}
                />
              </Field>
              <Field label="تجديد الفترة (+شهور)" htmlFor="es-ren">
                <SelectInput
                  id="es-ren"
                  value={subRenewMonths}
                  onChange={(e) => setSubRenewMonths(e.target.value)}
                >
                  <option value="0">بدون تمديد</option>
                  <option value="1">شهر واحد</option>
                  <option value="12">سنة كاملة</option>
                </SelectInput>
              </Field>
              <Field label="متأخرات مستحقة (ج)" htmlFor="es-overdue">
                <TextInput
                  id="es-overdue"
                  type="number"
                  min={0}
                  className="tabular-nums"
                  value={subOverdueInput}
                  onChange={(e) => setSubOverdueInput(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="دورة الفوترة" htmlFor="es-cycle">
                <SelectInput
                  id="es-cycle"
                  value={subDraftCycle}
                  onChange={(e) => setSubDraftCycle(e.target.value as 'monthly' | 'annual')}
                >
                  <option value="monthly">شهري</option>
                  <option value="annual">سنوي</option>
                </SelectInput>
              </Field>
              <label className="mt-6 min-h-[44px] px-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between text-xs font-bold text-[#0F2A4A] cursor-pointer">
                <span>تجديد تلقائي</span>
                <input
                  type="checkbox"
                  checked={subAutoRenew}
                  onChange={(e) => setSubAutoRenew(e.target.checked)}
                  className="w-4 h-4 accent-[#0F766E]"
                />
              </label>
            </div>

            <Field label="ملاحظات إدارية" htmlFor="es-notes">
              <TextInput
                id="es-notes"
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Modal: Record SaaS Subscription Payment */}
      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="تسجيل دفعة اشتراك سنتر"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                const sub = subByCenterId.get(payCenterId);
                if (!sub) {
                  showToast('لا يوجد سجل اشتراك مرتبط بالسنتر المختار.', 'error');
                  return;
                }
                const created = recordSaasPayment({
                  centerId: payCenterId,
                  subscriptionId: sub.id,
                  amount: Number(payAmount) || 0,
                  billingCycle: payCycle,
                  method: payMethod,
                  periodLabel: payPeriodLabel,
                  notes: payNotes,
                });
                if (created) setPaymentModalOpen(false);
              }}
            >
              تأكيد التحصيل وتجديد الاشتراك
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="السنتر" htmlFor="sp-center" required>
            <SelectInput
              id="sp-center"
              value={payCenterId}
              onChange={(e) => {
                const cid = e.target.value;
                setPayCenterId(cid);
                const sub = subByCenterId.get(cid);
                const plan = planById.get(sub?.planId || '') || saasPlans[0];
                if (plan) setPayAmount(String(plan.monthlyPrice));
              }}
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="المبلغ المدفوع (ج)" htmlFor="sp-amount" required>
              <TextInput
                id="sp-amount"
                type="number"
                min={1}
                className="tabular-nums"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </Field>
            <Field label="وسيلة الدفع" htmlFor="sp-method">
              <SelectInput
                id="sp-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as SaasPaymentMethod)}
              >
                <option value="إنستاباي">إنستاباي</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
                <option value="فودافون كاش">فودافون كاش</option>
                <option value="بطاقة بنكية">بطاقة بنكية</option>
                <option value="نقدي">نقدي</option>
              </SelectInput>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الدورة" htmlFor="sp-cycle">
              <SelectInput
                id="sp-cycle"
                value={payCycle}
                onChange={(e) => setPayCycle(e.target.value as 'monthly' | 'annual')}
              >
                <option value="monthly">اشتراك شهري</option>
                <option value="annual">اشتراك سنوي</option>
              </SelectInput>
            </Field>
            <Field label="وصف الفترة" htmlFor="sp-period">
              <TextInput
                id="sp-period"
                placeholder="مثال: ديسمبر 2026"
                value={payPeriodLabel}
                onChange={(e) => setPayPeriodLabel(e.target.value)}
              />
            </Field>
          </div>

          <Field label="ملاحظات الدفع" htmlFor="sp-notes">
            <TextInput
              id="sp-notes"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Drawer: Plan Pricing, Limits & Feature Flags Editor */}
      <Drawer
        open={Boolean(editingPlan)}
        onClose={() => setEditingPlan(null)}
        title={isNewPlan ? 'إضافة باقة اشتراك جديدة' : `تعديل ${editingPlan?.name || ''}`}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingPlan(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (editingPlan && upsertSaasPlan(editingPlan)) {
                  setEditingPlan(null);
                }
              }}
            >
              حفظ الباقة
            </Button>
          </>
        }
      >
        {editingPlan && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="اسم الباقة" htmlFor="pl-name" required>
                <TextInput
                  id="pl-name"
                  value={editingPlan.name}
                  onChange={(e) =>
                    setEditingPlan((p) => (p ? { ...p, name: e.target.value } : p))
                  }
                />
              </Field>
              <Field label="السعر الشهري (ج)" htmlFor="pl-price" required>
                <TextInput
                  id="pl-price"
                  type="number"
                  min={0}
                  className="tabular-nums"
                  value={editingPlan.monthlyPrice}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, monthlyPrice: Number(e.target.value) || 0 } : p
                    )
                  }
                />
              </Field>
            </div>

            <Field label="وصف الباقة" htmlFor="pl-sub">
              <TextInput
                id="pl-sub"
                value={editingPlan.subtitle}
                onChange={(e) =>
                  setEditingPlan((p) => (p ? { ...p, subtitle: e.target.value } : p))
                }
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="حد الطلاب" htmlFor="pl-max-st" required>
                <TextInput
                  id="pl-max-st"
                  type="number"
                  min={1}
                  className="tabular-nums"
                  value={editingPlan.maxStudents}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, maxStudents: Number(e.target.value) || 1 } : p
                    )
                  }
                />
              </Field>
              <Field label="حد المستخدمين" htmlFor="pl-max-us" required>
                <TextInput
                  id="pl-max-us"
                  type="number"
                  min={1}
                  className="tabular-nums"
                  value={editingPlan.maxUsers}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, maxUsers: Number(e.target.value) || 1 } : p
                    )
                  }
                />
              </Field>
              <Field label="حد المجموعات" htmlFor="pl-max-gr" required>
                <TextInput
                  id="pl-max-gr"
                  type="number"
                  min={1}
                  className="tabular-nums"
                  value={editingPlan.maxGroups}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, maxGroups: Number(e.target.value) || 1 } : p
                    )
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="p-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between text-xs font-bold cursor-pointer">
                <span>باقة مفعّلة</span>
                <input
                  type="checkbox"
                  checked={editingPlan.active}
                  onChange={(e) =>
                    setEditingPlan((p) => (p ? { ...p, active: e.target.checked } : p))
                  }
                  className="w-4 h-4 accent-[#0F766E]"
                />
              </label>
              <label className="p-3 rounded-[8px] border border-[#E2E8F0] bg-[#F4F7FA] flex items-center justify-between text-xs font-bold cursor-pointer">
                <span>وسم «الأكثر طلباً»</span>
                <input
                  type="checkbox"
                  checked={Boolean(editingPlan.popular)}
                  onChange={(e) =>
                    setEditingPlan((p) => (p ? { ...p, popular: e.target.checked } : p))
                  }
                  className="w-4 h-4 accent-[#0F766E]"
                />
              </label>
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] space-y-2.5">
              <span className="text-xs font-bold text-[#0F2A4A] block">
                مزايا الباقة المفعّلة (Feature Flags)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BOOLEAN_FEATURE_KEYS.map((key) => {
                  const checked = Boolean(editingPlan.featureFlags[key]);
                  return (
                    <label
                      key={key}
                      className="p-2.5 rounded-[8px] border border-[#E2E8F0] flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <span className="font-medium text-[#1E293B]">
                        {PLAN_FEATURE_LABELS[key]}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setEditingPlan((p) =>
                            p
                              ? {
                                  ...p,
                                  featureFlags: {
                                    ...p.featureFlags,
                                    [key]: e.target.checked,
                                  },
                                }
                              : p
                          )
                        }
                        className="w-4 h-4 accent-[#0F766E] shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Drawer: Create / Edit Platform User */}
      <Drawer
        open={userDrawerOpen}
        onClose={() => setUserDrawerOpen(false)}
        title={editingUser ? `تعديل حساب ${editingUser.name}` : 'إضافة مستخدم منصة جديد'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUserDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button
              loading={savingUser}
              onClick={async () => {
                setSavingUser(true);
                const res = await createOrUpdatePlatformUser({
                  existingUserId: editingUser?.id,
                  centerId: uCenterId,
                  name: uName,
                  email: uEmail,
                  phone: uPhone,
                  role: uRole,
                  status: uStatus,
                  password: uPassword.trim() || undefined,
                });
                setSavingUser(false);
                if (res) setUserDrawerOpen(false);
              }}
            >
              حفظ المستخدم
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="السنتر / النطاق" htmlFor="pu-center">
            <SelectInput
              id="pu-center"
              value={uCenterId}
              onChange={(e) => setUCenterId(e.target.value)}
            >
              <option value={PLATFORM_CENTER_ID}>المنصة بالكامل (EDUFLOW Platform)</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="الاسم الكامل" htmlFor="pu-name" required>
            <TextInput
              id="pu-name"
              value={uName}
              onChange={(e) => setUName(e.target.value)}
            />
          </Field>

          <Field label="البريد الإلكتروني" htmlFor="pu-email" required>
            <TextInput
              id="pu-email"
              type="email"
              dir="ltr"
              className="text-right"
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
            />
          </Field>

          <Field label="رقم الهاتف" htmlFor="pu-phone">
            <TextInput
              id="pu-phone"
              dir="ltr"
              className="text-right tabular-nums"
              value={uPhone}
              onChange={(e) => setUPhone(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الدور والصلاحية" htmlFor="pu-role">
              <SelectInput
                id="pu-role"
                value={uRole}
                onChange={(e) => setURole(e.target.value as UserRole)}
              >
                {ALL_PLATFORM_USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="الحالة" htmlFor="pu-status">
              <SelectInput
                id="pu-status"
                value={uStatus}
                onChange={(e) => setUStatus(e.target.value as SystemUser['status'])}
              >
                <option value="active">نشط</option>
                <option value="invited">مدعو</option>
                <option value="disabled">معطّل</option>
              </SelectInput>
            </Field>
          </div>

          <Field
            label={editingUser ? 'تعيين كلمة سر جديدة (اختياري)' : 'كلمة السر'}
            htmlFor="pu-pass"
            hint={editingUser ? 'اتركه فارغاً للإبقاء على كلمة السر الحالية.' : undefined}
          >
            <TextInput
              id="pu-pass"
              dir="ltr"
              className="text-right"
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
            />
          </Field>
        </div>
      </Drawer>

      {/* Modal: Audit Log Before/After Diff Preview */}
      <Modal
        open={Boolean(inspectLogEntry)}
        onClose={() => setInspectLogEntry(null)}
        title="تفاصيل سجل التدقيق (Audit Diff)"
        maxWidth="max-w-2xl"
        footer={<Button onClick={() => setInspectLogEntry(null)}>إغلاق</Button>}
      >
        {inspectLogEntry && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-[8px] bg-[#F4F7FA] border border-[#E2E8F0] space-y-1">
              <p className="font-bold text-[#0F2A4A]">{inspectLogEntry.summary}</p>
              <p className="text-[#5B6B80] tabular-nums">
                {inspectLogEntry.action} · {inspectLogEntry.actorName} ({inspectLogEntry.actorRole}) ·{' '}
                {new Date(inspectLogEntry.timestamp).toLocaleString('en-GB')}
              </p>
            </div>
            {inspectLogEntry.before !== undefined && (
              <div className="space-y-1">
                <span className="font-bold text-[#991B1B] block">القيمة قبل التعديل:</span>
                <pre
                  dir="ltr"
                  className="p-3 rounded-[8px] bg-slate-900 text-slate-100 overflow-x-auto text-[11px]"
                >
                  {JSON.stringify(inspectLogEntry.before, null, 2)}
                </pre>
              </div>
            )}
            {inspectLogEntry.after !== undefined && (
              <div className="space-y-1">
                <span className="font-bold text-[#065F46] block">القيمة بعد التعديل:</span>
                <pre
                  dir="ltr"
                  className="p-3 rounded-[8px] bg-slate-900 text-slate-100 overflow-x-auto text-[11px]"
                >
                  {JSON.stringify(inspectLogEntry.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
