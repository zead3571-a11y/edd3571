import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  FileText,
  Home,
  LogOut,
  MessageCircle,
  Phone,
  Wallet,
} from 'lucide-react';
import { useEduflow } from '../../context/EduflowContext';
import { Invoice, ScreenId, UserRole } from '../../types/eduflow';
import { GatewayPaymentMethod } from '../../features/integrations';
import { isPlanFeatureEnabled } from '../../data/seedData';
import {
  Button,
  Card,
  EduflowLogo,
  EmptyState,
  Field,
  InitialAvatar,
  Modal,
  SelectInput,
  StatusChip,
  TextInput,
  paymentStatusChipProps,
} from '../ui/Primitives';
import { formatDateDDMMYYYY, formatEGP } from '../../utils/eduflowLogic';
import { buildStudentParentReportPdf } from '../../utils/pdfExportLogic';

// 21) Parent Portal (Mobile-first calm tone, large type, centered 720px on Desktop, no sidebar)
export const ParentPortalScreen: React.FC = () => {
  const {
    authSession,
    currentRole,
    guardians,
    studentGuardians,
    students,
    groups,
    sessions,
    attendanceRecords,
    invoices,
    payments,
    assessments,
    studentAccounts,
    notifications,
    centerSettings,
    loginWithCredentials,
    activateParentByPhone,
    parentPayInvoiceOnline,
    logout,
    openPdfExport,
    navigate,
    showToast,
  } = useEduflow();

  const [portalScreen, setPortalScreen] = useState<'home' | 'invite' | 'login' | 'notifications'>(
    'home'
  );
  const [childTab, setChildTab] = useState<'attendance' | 'assessments' | 'payments'>(
    'attendance'
  );
  const [previewGuardianId, setPreviewGuardianId] = useState<string>('');

  const [checkoutInvoice, setCheckoutInvoice] = useState<Invoice | null>(null);
  const [checkoutAmount, setCheckoutAmount] = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState<GatewayPaymentMethod>('card');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [lastOnlineReceipt, setLastOnlineReceipt] = useState<{
    receiptNumber: string;
    amount: number;
    method: string;
  } | null>(null);

  const onlinePaymentsEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'parentPayments',
    centerSettings
  );

  const isOwnerPreview = authSession?.role === UserRole.OWNER;
  const activePreviewGuardianId =
    previewGuardianId || guardians[0]?.id || '';

  const childrenList = useMemo(() => {
    if (!authSession) return [];
    if (currentRole === UserRole.PARENT) {
      return students;
    }
    if (isOwnerPreview && activePreviewGuardianId) {
      const linkedIds = new Set(
        studentGuardians
          .filter((l) => l.guardianId === activePreviewGuardianId)
          .map((l) => l.studentId)
      );
      return students.filter(
        (s) =>
          linkedIds.has(s.id) || Boolean(s.guardianIds?.includes(activePreviewGuardianId))
      );
    }
    return students;
  }, [authSession, currentRole, isOwnerPreview, activePreviewGuardianId, studentGuardians, students]);

  const [activeChildId, setActiveChildId] = useState<string>('');
  const activeChild = childrenList.find((c) => c.id === activeChildId) || childrenList[0];

  // Invite / Login inputs (no hardcoded passwords or phones)
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [invitePass, setInvitePass] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);

  const childInvoices = activeChild
    ? invoices.filter((i) => i.studentId === activeChild.id && i.status !== 'paid')
    : [];
  const childReceipts = activeChild
    ? payments.filter((p) => p.studentId === activeChild.id)
    : [];
  const childAssessments = activeChild
    ? assessments.filter((a) => a.grades.some((g) => g.studentId === activeChild.id))
    : [];

  const childAttendanceEntries = useMemo(() => {
    if (!activeChild) return [];
    return sessions
      .filter(
        (sess) =>
          activeChild.groupIds.includes(sess.groupId) ||
          sess.entries.some((e) => e.studentId === activeChild.id)
      )
      .map((sess) => {
        const entry = sess.entries.find((e) => e.studentId === activeChild.id);
        const rec = attendanceRecords.find(
          (r) => r.sessionId === sess.id && r.studentId === activeChild.id
        );
        const grp = groups.find((g) => g.id === sess.groupId);
        return {
          sessionId: sess.id,
          date: sess.date,
          timeLabel: sess.timeLabel,
          groupName: grp?.name || 'حصة دراسية',
          status: rec?.status || entry?.status || 'unrecorded',
        };
      })
      .filter((row) => row.status !== 'unrecorded')
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeChild, sessions, attendanceRecords, groups]);

  return (
    <div className="min-h-screen bg-[#F4F7FA] pb-20">
      {/* Calm Top Bar */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[720px] mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <EduflowLogo dark={false} compact />
            <div>
              <span className="text-sm font-bold text-[#0F2A4A] block">
                بوابة أولياء الأمور
              </span>
              <span className="text-[11px] text-[#5B6B80] block">{centerSettings.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-[8px] text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setPortalScreen('home')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  portalScreen === 'home' ? 'bg-white text-[#0F2A4A]' : 'text-[#5B6B80]'
                }`}
              >
                الرئيسية
              </button>
              <button
                type="button"
                onClick={() => setPortalScreen('invite')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  portalScreen === 'invite' ? 'bg-white text-[#0F2A4A]' : 'text-[#5B6B80]'
                }`}
              >
                قبول الدعوة
              </button>
              <button
                type="button"
                onClick={() => setPortalScreen('login')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  portalScreen === 'login' ? 'bg-white text-[#0F2A4A]' : 'text-[#5B6B80]'
                }`}
              >
                تسجيل الدخول
              </button>
            </div>

            {authSession?.role === UserRole.PARENT ? (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#E2E8F0] text-xs font-bold text-[#991B1B] hover:bg-red-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            ) : authSession ? (
              <button
                type="button"
                onClick={() => navigate(ScreenId.DASHBOARD)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0F766E] hover:underline cursor-pointer"
              >
                <span>لوحة السنتر</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(ScreenId.LOGIN)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0F766E] hover:underline cursor-pointer"
              >
                <span>دخول الإدارة</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Centered 720px Column */}
      <main className="max-w-[720px] mx-auto px-4 py-6 space-y-5">
        {isOwnerPreview && guardians.length > 0 && portalScreen === 'home' && (
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#0F2A4A]">معاينة بوابة ولي الأمر (صلاحية المالك)</p>
              <p className="text-[11px] text-[#5B6B80]">
                اختر ولي أمر لمعاينة ما يظهر له فقط من بيانات أبنائه
              </p>
            </div>
            <SelectInput
              aria-label="اختيار ولي الأمر للمعاينة"
              value={activePreviewGuardianId}
              onChange={(e) => {
                setPreviewGuardianId(e.target.value);
                setActiveChildId('');
              }}
              className="w-56"
            >
              {guardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectInput>
          </Card>
        )}

        {portalScreen === 'invite' && (
          <Card className="p-6 space-y-4">
            <h1 className="text-xl font-bold text-[#0F2A4A]">تفعيل حساب ولي الأمر لأول مرة</h1>
            <p className="text-sm text-[#5B6B80]">
              أدخل رقم هاتفك المسجل لدى السنتر وكود الدعوة وأنشئ كلمة سر خاصة بك لمتابعة أبنائك.
            </p>
            {portalError && (
              <div
                role="alert"
                className="p-3 rounded-[8px] bg-[#FEE2E2] text-[#991B1B] text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{portalError}</span>
              </div>
            )}
            <Field label="رقم موبايل ولي الأمر المسجل" htmlFor="pp-invite-phone">
              <TextInput
                id="pp-invite-phone"
                dir="ltr"
                className="text-right tabular-nums"
                placeholder="01xxxxxxxxx"
                value={invitePhone}
                onChange={(e) => {
                  setInvitePhone(e.target.value);
                  setPortalError('');
                }}
              />
            </Field>
            <Field label="كود الدعوة من السنتر" htmlFor="pp-code">
              <TextInput
                id="pp-code"
                dir="ltr"
                className="text-right font-bold tabular-nums"
                placeholder="مثال: HB-1001"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </Field>
            <Field label="إنشاء كلمة سر جديدة" htmlFor="pp-pass">
              <TextInput
                id="pp-pass"
                type="password"
                dir="ltr"
                className="text-right"
                placeholder="6 أحرف أو أرقام على الأقل"
                value={invitePass}
                onChange={(e) => {
                  setInvitePass(e.target.value);
                  setPortalError('');
                }}
              />
            </Field>
            <Button
              className="w-full"
              loading={portalLoading}
              onClick={async () => {
                setPortalError('');
                if (!inviteCode.trim()) {
                  setPortalError('أدخل كود الدعوة المرسل من السنتر.');
                  return;
                }
                setPortalLoading(true);
                const res = await activateParentByPhone(invitePhone, invitePass);
                setPortalLoading(false);
                if (!res.ok) {
                  setPortalError(res.error || 'تعذر تفعيل الحساب.');
                  return;
                }
                setInvitePass('');
                setPortalScreen('home');
              }}
            >
              تفعيل الحساب ومتابعة الأبناء
            </Button>
          </Card>
        )}

        {portalScreen === 'login' && (
          <Card className="p-6 space-y-4">
            <h1 className="text-xl font-bold text-[#0F2A4A]">دخول أولياء الأمور</h1>
            {portalError && (
              <div
                role="alert"
                className="p-3 rounded-[8px] bg-[#FEE2E2] text-[#991B1B] text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{portalError}</span>
              </div>
            )}
            <Field label="البريد الإلكتروني أو رقم الموبايل" htmlFor="pp-phone">
              <TextInput
                id="pp-phone"
                dir="ltr"
                className="text-right"
                placeholder="mimi@hamed-elbailey.demo أو رقم الموبايل"
                value={loginIdentifier}
                onChange={(e) => {
                  setLoginIdentifier(e.target.value);
                  setPortalError('');
                }}
              />
            </Field>
            <Field label="كلمة السر" htmlFor="pp-lpass">
              <TextInput
                id="pp-lpass"
                type="password"
                dir="ltr"
                className="text-right"
                value={loginPass}
                onChange={(e) => {
                  setLoginPass(e.target.value);
                  setPortalError('');
                }}
              />
            </Field>
            <Button
              className="w-full"
              loading={portalLoading}
              onClick={async () => {
                setPortalError('');
                setPortalLoading(true);
                const res = await loginWithCredentials(loginIdentifier, loginPass);
                setPortalLoading(false);
                if (!res.ok) {
                  setPortalError(res.error || 'بيانات الدخول غير صحيحة.');
                  return;
                }
                setPortalScreen('home');
              }}
            >
              دخول
            </Button>
          </Card>
        )}

        {portalScreen === 'notifications' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#0F2A4A]">إشعارات متابعة الأبناء</h1>
            {notifications.length === 0 ? (
              <EmptyState
                title="لا توجد إشعارات جديدة"
                description="ستظهر هنا تنبيهات الحضور والغياب ونتائج الامتحانات وإيصالات الدفع الخاصة بأبنائك."
              />
            ) : (
              <Card padding="p-0" className="divide-y divide-[#E2E8F0]">
                {notifications.map((n) => (
                  <div key={n.id} className="p-4">
                    <p className="text-sm font-bold text-[#0F2A4A]">{n.title}</p>
                    <p className="text-sm text-[#5B6B80] mt-1">{n.body}</p>
                    <span className="text-xs text-[#5B6B80] mt-1 block">{n.relativeTime}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {portalScreen === 'home' && !authSession && (
          <Card className="p-6 text-center space-y-4">
            <h1 className="text-xl font-bold text-[#0F2A4A]">
              مرحباً بكم في بوابة أولياء الأمور — {centerSettings.name}
            </h1>
            <p className="text-sm text-[#5B6B80]">
              سجّل الدخول بحساب ولي الأمر لمتابعة حضور أبنائك ودرجاتهم وفواتيرهم.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setPortalScreen('login')}>
                تسجيل دخول ولي الأمر
              </Button>
              <Button variant="secondary" onClick={() => setPortalScreen('invite')}>
                تفعيل حساب لأول مرة
              </Button>
            </div>
          </Card>
        )}

        {portalScreen === 'home' && authSession && !activeChild && (
          <EmptyState
            title="لا يوجد طلاب مرتبطون بهذا الحساب"
            description="تأكد من ربط الطالب بحساب ولي الأمر لدى إدارة السنتر."
          />
        )}

        {portalScreen === 'home' && authSession && activeChild && (
          <>
            {/* Child Switcher Cards */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#5B6B80]">
                  بيانات الطالب للمتابعة:
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FileText className="w-4 h-4 text-[#0F766E]" />}
                  onClick={() =>
                    openPdfExport(
                      buildStudentParentReportPdf({
                        centerSettings,
                        student: activeChild,
                        groups,
                        sessions,
                        invoices,
                        assessments,
                      })
                    )
                  }
                >
                  تقرير الابن الشامل PDF
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childrenList.map((child) => {
                  const selected = child.id === activeChild.id;
                  const childPortalAcc = studentAccounts.find((a) => a.studentId === child.id);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setActiveChildId(child.id)}
                      className={`p-4 rounded-[12px] border text-right flex items-center gap-3.5 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-white border-2 border-[#0F766E] shadow-xs'
                          : 'bg-white/80 border-[#E2E8F0] hover:bg-white'
                      }`}
                    >
                      <InitialAvatar
                        name={child.name}
                        tint={selected ? '#0F766E' : '#0F2A4A'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-[#0F2A4A] truncate">
                          {child.name}
                        </p>
                        <p className="text-xs text-[#5B6B80]">{child.stage}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-[#0F766E] tabular-nums">
                            الحضور: {child.attendanceRate}%
                          </span>
                          <StatusChip
                            tone={
                              !childPortalAcc
                                ? 'neutral'
                                : childPortalAcc.status === 'active'
                                ? 'success'
                                : 'danger'
                            }
                            label={
                              !childPortalAcc
                                ? 'منصة الطالب: غير مفعّل'
                                : childPortalAcc.status === 'active'
                                ? 'منصة الطالب: مفعّل'
                                : 'منصة الطالب: موقوف'
                            }
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Child Detail Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-white border border-[#E2E8F0] rounded-[10px]">
              {[
                { id: 'attendance', label: 'الحضور', icon: <CheckSquare className="w-4 h-4" /> },
                { id: 'assessments', label: 'التقييمات', icon: <BookOpen className="w-4 h-4" /> },
                { id: 'payments', label: 'المدفوعات', icon: <Wallet className="w-4 h-4" /> },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setChildTab(t.id as typeof childTab)}
                  className={`py-2.5 rounded-[8px] text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    childTab === t.id ? 'bg-[#0F2A4A] text-white' : 'text-[#5B6B80]'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Attendance Tab */}
            {childTab === 'attendance' && (
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#0F2A4A]">سجل الحضور والغياب</h2>
                  <StatusChip tone="success" label={`حضور ${activeChild.attendanceRate}%`} />
                </div>

                {childAttendanceEntries.length === 0 ? (
                  <p className="text-sm text-[#5B6B80]">
                    لا توجد حصص حضور مسجلة للطالب حتى الآن.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {childAttendanceEntries.map((item) => (
                      <div
                        key={item.sessionId}
                        className={`p-2.5 rounded-[8px] text-center tabular-nums ${
                          item.status === 'present'
                            ? 'bg-[#D1FAE5] text-[#065F46]'
                            : item.status === 'late'
                            ? 'bg-[#FEF3C7] text-[#92400E]'
                            : 'bg-[#FEE2E2] text-[#991B1B]'
                        }`}
                      >
                        <span className="text-xs font-bold block">
                          {formatDateDDMMYYYY(item.date)}
                        </span>
                        <span className="text-[11px] block">{item.groupName}</span>
                        <span className="text-[11px] font-semibold">
                          {item.status === 'present'
                            ? 'حاضر'
                            : item.status === 'late'
                            ? 'متأخر'
                            : 'غائب'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Assessments Tab */}
            {childTab === 'assessments' && (
              <div className="space-y-3">
                {childAssessments.length === 0 ? (
                  <EmptyState
                    title="لا توجد تقييمات مرصودة حتى الآن"
                    description="ستظهر نتائج الاختبارات والتقييمات فور تصحيحها واعتمادها."
                  />
                ) : (
                  childAssessments.map((as) => {
                    const gr = as.grades.find((g) => g.studentId === activeChild.id);
                    const grp = groups.find((g) => g.id === as.groupId);
                    return (
                      <Card key={as.id} className="p-5 flex items-center justify-between gap-4">
                        <div>
                          <span className="text-xs text-[#5B6B80]">
                            {grp?.subject || 'مادة دراسية'} · {as.date}
                          </span>
                          <h3 className="text-base font-bold text-[#0F2A4A] mt-0.5">
                            {as.title}
                          </h3>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="text-xl font-bold text-[#0F766E] tabular-nums block">
                            {gr?.score ?? '—'} / {as.maxScore}
                          </span>
                          <span className="text-xs text-[#5B6B80]">الدرجة</span>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* Payments Tab */}
            {childTab === 'payments' && (
              <div className="space-y-4">
                {lastOnlineReceipt && (
                  <Card className="p-4 bg-[#D1FAE5]/40 border-emerald-300 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm text-[#065F46]">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>
                        تم الدفع أونلاين بنجاح — إيصال <strong>#{lastOnlineReceipt.receiptNumber}</strong> بمبلغ{' '}
                        <strong className="tabular-nums">{formatEGP(lastOnlineReceipt.amount)}</strong>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLastOnlineReceipt(null)}
                    >
                      إخفاء
                    </Button>
                  </Card>
                )}

                <h3 className="text-base font-bold text-[#0F2A4A]">الفواتير المستحقة</h3>

                {childInvoices.length === 0 ? (
                  <EmptyState
                    title="لا توجد فواتير مستحقة"
                    description="جميع الاشتراكات الشهرية الخاصة بالطالب مسددة بالكامل."
                  />
                ) : (
                  childInvoices.map((inv) => {
                    const ch = paymentStatusChipProps(inv.status);
                    const remaining = Math.max(0, inv.total - inv.paid);
                    return (
                      <Card
                        key={inv.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-[#0F2A4A]">{inv.month}</p>
                            <StatusChip tone={ch.tone} label={ch.label} />
                          </div>
                          <p className="text-xs text-[#5B6B80] tabular-nums mt-0.5">
                            رقم الفاتورة: {inv.number} · المتبقي: {formatEGP(remaining)}
                          </p>
                        </div>

                        {remaining > 0 && onlinePaymentsEnabled && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<CreditCard className="w-4 h-4" />}
                            onClick={() => {
                              setCheckoutInvoice(inv);
                              setCheckoutAmount(String(remaining));
                              setCheckoutMethod('card');
                            }}
                          >
                            دفع أونلاين الآن
                          </Button>
                        )}
                      </Card>
                    );
                  })
                )}

                <h3 className="text-base font-bold text-[#0F2A4A] pt-2">الإيصالات المسددة</h3>
                {childReceipts.length === 0 ? (
                  <p className="text-xs text-[#5B6B80]">لا توجد إيصالات دفع مسجلة حتى الآن.</p>
                ) : (
                  <Card padding="p-0" className="divide-y divide-[#E2E8F0]">
                    {childReceipts.map((rcp) => (
                      <div key={rcp.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-[#1E293B]">
                            إيصال #{rcp.receiptNumber} ({rcp.method})
                          </p>
                          <p className="text-xs text-[#5B6B80] tabular-nums">{rcp.date}</p>
                        </div>
                        <span className="text-base font-bold text-[#065F46] tabular-nums">
                          {formatEGP(rcp.amount)}
                        </span>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            )}

            {/* Contact the Center Card */}
            <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0F2A4A]">
                  تواصل مع إدارة {centerSettings.name}
                </h3>
                <p className="text-xs text-[#5B6B80]">
                  {centerSettings.phone
                    ? 'للاستفسار عن المواعيد أو إبلاغ الإدارة بعذر غياب مسبق'
                    : 'تواصل مباشرة مع إدارة السنتر عند الحاجة'}
                </p>
              </div>
              {centerSettings.phone ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${centerSettings.phone}`}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[8px] border border-[#E2E8F0] bg-white text-sm font-bold text-[#0F2A4A] hover:bg-slate-50"
                  >
                    <Phone className="w-4 h-4 text-[#0F766E]" />
                    <span>اتصال هاتفي</span>
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        `تم فتح محادثة واتساب مع استقبال السنتر (${centerSettings.phone})`,
                        'info'
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[8px] bg-[#0F766E] text-white text-sm font-bold hover:bg-[#0D655E] cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>واتساب السنتر</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[#5B6B80]">لم يُسجل رقم هاتف للسنتر بعد</span>
              )}
            </Card>
          </>
        )}
      </main>

      {/* Bottom Tabs for Parent Portal */}
      <nav
        aria-label="تنقل بوابة ولي الأمر"
        className="fixed bottom-0 inset-x-0 h-16 bg-white border-t border-[#E2E8F0] z-20"
      >
        <div className="max-w-[720px] mx-auto h-full grid grid-cols-3">
          <button
            type="button"
            onClick={() => setPortalScreen('home')}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              portalScreen === 'home' ? 'text-[#0F766E]' : 'text-[#5B6B80]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span>أبنائي</span>
          </button>
          <button
            type="button"
            onClick={() => setPortalScreen('notifications')}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              portalScreen === 'notifications' ? 'text-[#0F766E]' : 'text-[#5B6B80]'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span>الإشعارات</span>
          </button>
          <button
            type="button"
            onClick={() => setPortalScreen('login')}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              portalScreen === 'login' ? 'text-[#0F766E]' : 'text-[#5B6B80]'
            }`}
          >
            <CheckSquare className="w-5 h-5" />
            <span>حساب الدخول</span>
          </button>
        </div>
      </nav>

      {/* Parent Online Checkout Modal */}
      <Modal
        open={Boolean(checkoutInvoice)}
        onClose={() => setCheckoutInvoice(null)}
        title="الدفع الإلكتروني الآمن (Paymob / فوري / محفظة)"
      >
        {checkoutInvoice && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const amt = Math.max(0, Number(checkoutAmount) || 0);
              if (amt <= 0) return;
              setCheckoutLoading(true);
              try {
                const res = await parentPayInvoiceOnline({
                  invoiceId: checkoutInvoice.id,
                  amount: amt,
                  method: checkoutMethod,
                });
                if (res) {
                  setLastOnlineReceipt({
                    receiptNumber: res.payment.receiptNumber,
                    amount: res.payment.amount,
                    method: res.payment.method,
                  });
                  setCheckoutInvoice(null);
                }
              } finally {
                setCheckoutLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm space-y-1">
              <div className="font-bold text-[#0F2A4A]">
                {activeChild?.name} — {checkoutInvoice.month}
              </div>
              <div className="text-xs text-[#5B6B80] tabular-nums">
                الفاتورة {checkoutInvoice.number} · المستحق:{' '}
                {formatEGP(Math.max(0, checkoutInvoice.total - checkoutInvoice.paid))}
              </div>
            </div>

            <Field label="المبلغ المراد دفعه (ج)" required>
              <TextInput
                type="number"
                min="1"
                max={Math.max(1, checkoutInvoice.total - checkoutInvoice.paid)}
                value={checkoutAmount}
                onChange={(e) => setCheckoutAmount(e.target.value)}
                className="tabular-nums font-bold"
                required
              />
            </Field>

            <Field label="وسيلة الدفع الإلكتروني" required>
              <SelectInput
                value={checkoutMethod}
                onChange={(e) => setCheckoutMethod(e.target.value as GatewayPaymentMethod)}
              >
                <option value="card">بطاقة بنكية (Visa / Mastercard)</option>
                <option value="wallet">محفظة إلكترونية (Vodafone Cash / InstaPay)</option>
                <option value="fawry">كود دفع فوري (Fawry)</option>
              </SelectInput>
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCheckoutInvoice(null)}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={checkoutLoading}
                icon={<CreditCard className="w-4 h-4" />}
              >
                تأكيد السداد الإلكتروني
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};


