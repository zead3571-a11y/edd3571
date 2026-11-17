import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  FilePlus2,
  Lock,
  Send,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useEduflow } from '../../context/EduflowContext';
import { can } from '../../permissions/permissions';
import { isPlanFeatureEnabled } from '../../data/seedData';
import {
  formatDateDDMMYYYY,
  formatEGP,
  formatNumber,
} from '../../utils/eduflowLogic';
import {
  calculateNetPayroll,
  computeStaffAttendanceSummary,
} from '../../features/payroll/staffPayrollService';
import {
  AiAssistantResponse,
  AiAssistantTask,
  callEduflowAiAssistant,
} from '../../features/ai/aiClient';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  ListStateSwitcher,
  Modal,
  SelectInput,
  StatusChip,
  TableSkeleton,
  TextInput,
} from '../ui/Primitives';
import {
  PaymentRecord,
  ScreenId,
  StaffAttendanceRecord,
  StaffPayrollRecord,
  SystemUser,
  UserRole,
} from '../../types/eduflow';

// =============================================================================
// 1. STAFF ATTENDANCE & PAYROLL (حضور الموظفين والمرتبات)
// =============================================================================

export const StaffPayrollScreen: React.FC = () => {
  const {
    currentActor,
    currentRole,
    centerSettings,
    users,
    staffAttendance,
    staffPayrolls,
    recordStaffAttendance,
    generateOrUpdatePayroll,
    payStaffPayroll,
    togglePlanFeatureOverride,
    listStateMode,
    setListStateMode,
    navigate,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'staffPayroll',
    centerSettings
  );
  const canMarkAttendance = can(currentActor, 'create', 'staffAttendance');
  const canManagePayroll = can(currentActor, 'create', 'staffPayrolls');

  const [tab, setTab] = useState<'attendance' | 'payroll'>('attendance');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Edit Payroll Modal
  const [payrollModalUser, setPayrollModalUser] = useState<SystemUser | null>(null);
  const [baseSalary, setBaseSalary] = useState('4500');
  const [bonuses, setBonuses] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [advances, setAdvances] = useState('0');
  const [payrollNote, setPayrollNote] = useState('');

  // Pay Salary Modal
  const [disburseModalRecord, setDisburseModalRecord] = useState<StaffPayrollRecord | null>(null);
  const [disburseMethod, setDisburseMethod] = useState<PaymentRecord['method']>('نقدي');

  const staffList = useMemo(
    () =>
      users.filter(
        (u) => u.role !== UserRole.PARENT && u.role !== UserRole.STUDENT
      ),
    [users]
  );

  const attendanceMapForDate = useMemo(() => {
    const map = new Map<string, StaffAttendanceRecord>();
    for (const rec of staffAttendance) {
      if (rec.date === selectedDate) {
        map.set(rec.userId, rec);
      }
    }
    return map;
  }, [staffAttendance, selectedDate]);

  const monthSummary = useMemo(
    () => computeStaffAttendanceSummary(staffAttendance, selectedMonth),
    [staffAttendance, selectedMonth]
  );

  const monthPayrolls = useMemo(
    () => staffPayrolls.filter((p) => p.monthKey === selectedMonth),
    [staffPayrolls, selectedMonth]
  );

  const payrollTotals = useMemo(() => {
    const totalNet = monthPayrolls.reduce((s, p) => s + p.netSalary, 0);
    const totalPaid = monthPayrolls
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + p.netSalary, 0);
    return {
      totalNet,
      totalPaid,
      pending: Math.max(0, totalNet - totalPaid),
    };
  }, [monthPayrolls]);

  const openPayrollModal = (user: SystemUser) => {
    const existing = monthPayrolls.find((p) => p.userId === user.id);
    setPayrollModalUser(user);
    setBaseSalary(String(existing?.baseSalary ?? 4500));
    setBonuses(String(existing?.bonuses ?? 0));
    setDeductions(String(existing?.deductions ?? 0));
    setAdvances(String(existing?.advances ?? 0));
    setPayrollNote(existing?.note || '');
  };

  const handleSavePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollModalUser) return;
    const saved = generateOrUpdatePayroll({
      userId: payrollModalUser.id,
      monthKey: selectedMonth,
      baseSalary: Math.max(0, Number(baseSalary) || 0),
      bonuses: Math.max(0, Number(bonuses) || 0),
      deductions: Math.max(0, Number(deductions) || 0),
      advances: Math.max(0, Number(advances) || 0),
      note: payrollNote.trim() || undefined,
    });
    if (saved) {
      setPayrollModalUser(null);
    }
  };

  const handleDisbursePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseModalRecord) return;
    const paid = payStaffPayroll({
      payrollId: disburseModalRecord.id,
      paymentMethod: disburseMethod,
    });
    if (paid) {
      setDisburseModalRecord(null);
    }
  };

  const previewNet = useMemo(
    () =>
      calculateNetPayroll({
        baseSalary: Number(baseSalary) || 0,
        bonuses: Number(bonuses) || 0,
        deductions: Number(deductions) || 0,
        advances: Number(advances) || 0,
      }),
    [baseSalary, bonuses, deductions, advances]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A]">
            حضور الموظفين والمرتبات
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            تسجيل حضور وانصراف فريق العمل وإعداد وصرف الرواتب الشهرية مع ترحيل تلقائي للمصروفات
          </p>
        </div>

        <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
      </div>

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#0F2A4A]">
            ميزة حضور الموظفين والمرتبات غير مفعلة في الباقة الحالية
          </h2>
          <div className="flex items-center justify-center gap-2">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                onClick={() =>
                  togglePlanFeatureOverride(centerSettings.currentPlanId, 'staffPayroll', true)
                }
              >
                تفعيل الميزة لهذه الباقة
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(ScreenId.SUBSCRIPTION)}>
              الباقات والاشتراك
            </Button>
          </div>
        </Card>
      ) : listStateMode === 'loading' ? (
        <TableSkeleton rows={4} />
      ) : listStateMode === 'error' ? (
        <ErrorState onRetry={() => setListStateMode('ready')} />
      ) : listStateMode === 'empty' || staffList.length === 0 ? (
        <EmptyState
          title="لا يوجد موظفون مسجلون"
          description="أضف فريق العمل من الإعدادات > المستخدمون لتسجيل حضورهم ومرتباتهم."
        />
      ) : (
        <>
          <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTab('attendance')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                  tab === 'attendance'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'text-[#475569] hover:text-[#0F2A4A]'
                }`}
              >
                الحضور اليومي للموظفين
              </button>
              <button
                type="button"
                onClick={() => setTab('payroll')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                  tab === 'payroll'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'text-[#475569] hover:text-[#0F2A4A]'
                }`}
              >
                كشوف المرتبات ({formatNumber(monthPayrolls.length)})
              </button>
            </div>

            <div className="flex items-center gap-2">
              {tab === 'attendance' ? (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#64748B]" />
                  <TextInput
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-auto"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#64748B]" />
                  <TextInput
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-auto"
                  />
                </div>
              )}
            </div>
          </Card>

          {tab === 'attendance' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">حضور الشهر ({selectedMonth})</div>
                  <div className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1">
                    {formatNumber(monthSummary.presentDays)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">تأخير</div>
                  <div className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">
                    {formatNumber(monthSummary.lateDays)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">غياب</div>
                  <div className="text-xl font-extrabold text-red-700 tabular-nums mt-1">
                    {formatNumber(monthSummary.absentDays)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">إجازات معتمدة</div>
                  <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                    {formatNumber(monthSummary.leaveDays)}
                  </div>
                </Card>
              </div>

              <Card padding="p-0" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#F8FAFC] text-xs font-bold text-[#475569] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-4 py-3">الموظف</th>
                        <th className="px-4 py-3">الدور</th>
                        <th className="px-4 py-3">حالة اليوم ({formatDateDDMMYYYY(selectedDate)})</th>
                        <th className="px-4 py-3">تسجيل الحضور</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {staffList.map((user) => {
                        const rec = attendanceMapForDate.get(user.id);
                        const statusChip = !rec
                          ? { label: 'لم يُسجل بعد', tone: 'neutral' as const }
                          : rec.status === 'present'
                          ? { label: 'حاضر', tone: 'success' as const }
                          : rec.status === 'late'
                          ? { label: 'متأخر', tone: 'warning' as const }
                          : rec.status === 'leave'
                          ? { label: 'إجازة', tone: 'navy' as const }
                          : { label: 'غائب', tone: 'danger' as const };

                        return (
                          <tr key={user.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-4 py-3 font-bold text-[#0F2A4A]">{user.name}</td>
                            <td className="px-4 py-3 text-xs text-[#64748B]">{user.role}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <StatusChip label={statusChip.label} tone={statusChip.tone} />
                                {rec?.checkInTime && (
                                  <span className="text-xs text-[#64748B] tabular-nums">
                                    ({rec.checkInTime})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {canMarkAttendance ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {(
                                    [
                                      { id: 'present', label: 'حاضر' },
                                      { id: 'late', label: 'متأخر' },
                                      { id: 'absent', label: 'غائب' },
                                      { id: 'leave', label: 'إجازة' },
                                    ] as const
                                  ).map((btn) => (
                                    <button
                                      key={btn.id}
                                      type="button"
                                      onClick={() =>
                                        recordStaffAttendance({
                                          userId: user.id,
                                          date: selectedDate,
                                          status: btn.id,
                                          checkInTime:
                                            btn.id === 'present' || btn.id === 'late'
                                              ? new Date().toTimeString().slice(0, 5)
                                              : undefined,
                                        })
                                      }
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                        rec?.status === btn.id
                                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                                          : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#0F2A4A]'
                                      }`}
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-[#64748B]">للاطلاع فقط</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">إجمالي مستحقات الشهر</div>
                  <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                    {formatEGP(payrollTotals.totalNet)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">الرواتب المصروفة</div>
                  <div className="text-xl font-extrabold text-[#0F766E] tabular-nums mt-1">
                    {formatEGP(payrollTotals.totalPaid)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-[#64748B]">المتبقي قيد الصرف</div>
                  <div className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">
                    {formatEGP(payrollTotals.pending)}
                  </div>
                </Card>
              </div>

              <Card padding="p-0" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#F8FAFC] text-xs font-bold text-[#475569] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-4 py-3">الموظف</th>
                        <th className="px-4 py-3">الأساسي</th>
                        <th className="px-4 py-3">مكافآت</th>
                        <th className="px-4 py-3">خصومات/سلف</th>
                        <th className="px-4 py-3">صافي الراتب</th>
                        <th className="px-4 py-3">الحالة</th>
                        <th className="px-4 py-3">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {staffList.map((user) => {
                        const rec = monthPayrolls.find((p) => p.userId === user.id);
                        return (
                          <tr key={user.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-4 py-3">
                              <div className="font-bold text-[#0F2A4A]">{user.name}</div>
                              <div className="text-xs text-[#64748B]">{user.role}</div>
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {rec ? formatEGP(rec.baseSalary) : '—'}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-emerald-700">
                              {rec ? `+${formatEGP(rec.bonuses)}` : '—'}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-red-700">
                              {rec ? `-${formatEGP(rec.deductions + rec.advances)}` : '—'}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-extrabold text-[#0F2A4A]">
                              {rec ? formatEGP(rec.netSalary) : 'غير محدد'}
                            </td>
                            <td className="px-4 py-3">
                              {!rec ? (
                                <StatusChip label="بانتظار الإعداد" tone="neutral" />
                              ) : rec.status === 'paid' ? (
                                <StatusChip label="تم الصرف" tone="success" />
                              ) : (
                                <StatusChip label="جاهز للصرف" tone="warning" />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {canManagePayroll && (!rec || rec.status !== 'paid') && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openPayrollModal(user)}
                                  >
                                    {rec ? 'تعديل البنود' : 'إعداد الراتب'}
                                  </Button>
                                )}
                                {canManagePayroll && rec && rec.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    icon={<Banknote className="w-3.5 h-3.5" />}
                                    onClick={() => setDisburseModalRecord(rec)}
                                  >
                                    صرف الراتب
                                  </Button>
                                )}
                                {rec?.status === 'paid' && (
                                  <span className="text-xs text-emerald-700 font-semibold">
                                    صُرف ({rec.paymentMethod})
                                  </span>
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
            </div>
          )}
        </>
      )}

      {/* Generate / Update Payroll Modal */}
      <Modal
        open={Boolean(payrollModalUser)}
        onClose={() => setPayrollModalUser(null)}
        title={`إعداد راتب — ${payrollModalUser?.name || ''}`}
      >
        <form onSubmit={handleSavePayroll} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="الراتب الأساسي (ج)" required>
              <TextInput
                type="number"
                min="0"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="حوافز ومكافآت (ج)">
              <TextInput
                type="number"
                min="0"
                value={bonuses}
                onChange={(e) => setBonuses(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="خصومات / جزاءات (ج)">
              <TextInput
                type="number"
                min="0"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="سُلف مسحوبة (ج)">
              <TextInput
                type="number"
                min="0"
                value={advances}
                onChange={(e) => setAdvances(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="p-3 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex justify-between text-base font-extrabold text-[#0F766E]">
            <span>صافي الراتب المستحق:</span>
            <span className="tabular-nums">{formatEGP(previewNet)}</span>
          </div>

          <Field label="ملاحظة (اختياري)">
            <TextInput value={payrollNote} onChange={(e) => setPayrollNote(e.target.value)} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setPayrollModalUser(null)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" icon={<UserCheck className="w-4 h-4" />}>
              حفظ كشف الراتب
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disburse Payroll Modal */}
      <Modal
        open={Boolean(disburseModalRecord)}
        onClose={() => setDisburseModalRecord(null)}
        title="تأكيد صرف الراتب"
      >
        {disburseModalRecord && (
          <form onSubmit={handleDisbursePayroll} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1 text-sm">
              <div className="font-bold text-[#0F2A4A]">{disburseModalRecord.staffName}</div>
              <div className="text-xs text-[#64748B]">
                شهر {disburseModalRecord.monthLabel} · الصافي:{' '}
                <strong className="text-[#0F766E] tabular-nums">
                  {formatEGP(disburseModalRecord.netSalary)}
                </strong>
              </div>
            </div>

            <Field label="طريقة الصرف">
              <SelectInput
                value={disburseMethod}
                onChange={(e) => setDisburseMethod(e.target.value as PaymentRecord['method'])}
              >
                <option value="نقدي">نقدي من الخزنة</option>
                <option value="إنستاباي">تحويل إنستاباي</option>
                <option value="محفظة">محفظة إلكترونية</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
              </SelectInput>
            </Field>

            <p className="text-xs text-[#64748B]">
              سيتم تسجيل مصروف تلقائي تحت تصنيف «رواتب» في سجل المصروفات وتحديث رصيد الدرج.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDisburseModalRecord(null)}
              >
                إلغاء
              </Button>
              <Button variant="primary" type="submit" icon={<Wallet className="w-4 h-4" />}>
                صرف وتسجيل المصروف
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// =============================================================================
// 2. AI ASSISTANT SCREEN (المساعد الذكي AI)
// =============================================================================

const AI_TASK_OPTIONS: {
  id: AiAssistantTask;
  label: string;
  desc: string;
  placeholder: string;
}[] = [
  {
    id: 'exam_questions',
    label: 'توليد أسئلة امتحان أونلاين',
    desc: 'ينشئ أسئلة اختيار من متعدد أو صح/خطأ قابلة للحفظ الفوري كبنك امتحان.',
    placeholder: 'ولّد 4 أسئلة قواعد لغة فرنسية للصف الثالث الثانوي حول الضمائر الشخصية.',
  },
  {
    id: 'lesson_outline',
    label: 'إعداد خطة درس وشرح',
    desc: 'يصيغ ملخصاً تعليمياً وأمثلة تطبيقية قابلة للنشر مباشرة كدرس في منصة الطالب.',
    placeholder: 'جهز خطة شرح الدرس الثاني في الوحدة الثالثة - أسلوب الأمر والاستفهام.',
  },
  {
    id: 'student_insight',
    label: 'تحليل مستوى طالب',
    desc: 'يحلل درجات وحضور الطالب ويقترح خطة متابعة علاجية.',
    placeholder: 'حلل مستوى الطالب واقترح خطة لرفع درجاته في الامتحان القادم.',
  },
  {
    id: 'parent_summary',
    label: 'صياغة تقرير لولي الأمر',
    desc: 'يكتب رسالة واتساب احترافية ومختصرة عن مستوى الطالب والتزامه.',
    placeholder: 'اكتب رسالة ودية لولي الأمر تلخص أداء الطالب هذا الشهر وتنبهه بالمتابعة.',
  },
  {
    id: 'chat',
    label: 'استشارة إدارية وتعليمية',
    desc: 'اسأل المساعد الذكي عن أفكار لرفع التحصيل، تقليل الغياب، أو تنظيم المجموعات.',
    placeholder: 'اكتب سؤالك هنا...',
  },
];

export const AiAssistantScreen: React.FC = () => {
  const {
    currentRole,
    centerSettings,
    groups,
    students,
    teachers,
    createOnlineExam,
    createLesson,
    togglePlanFeatureOverride,
    navigate,
    showToast,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'aiAssistant',
    centerSettings
  );

  const [task, setTask] = useState<AiAssistantTask>('exam_questions');
  const [selectedGroupId, setSelectedGroupId] = useState(() => groups[0]?.id || '');
  const [selectedStudentId, setSelectedStudentId] = useState(() => students[0]?.id || '');
  const [prompt, setPrompt] = useState(
    'ولّد 4 أسئلة اختيار من متعدد في قواعد اللغة الفرنسية (أدوات التجزئة والضمائر) للصف الثالث الثانوي'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [response, setResponse] = useState<AiAssistantResponse | null>(null);

  const activeTaskMeta = useMemo(
    () => AI_TASK_OPTIONS.find((t) => t.id === task) || AI_TASK_OPTIONS[0],
    [task]
  );

  const runAiRequest = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorMsg('');
    setResponse(null);

    const grp = groups.find((g) => g.id === selectedGroupId);
    const st = students.find((s) => s.id === selectedStudentId);

    try {
      const res = await callEduflowAiAssistant({
        task,
        prompt: prompt.trim(),
        centerName: centerSettings.name,
        context: {
          groupName: grp?.name,
          stage: grp?.stage || st?.stage,
          subject: grp?.subject,
          studentName: st?.name,
          attendanceRate: st?.attendanceRate,
          paymentStatus: st?.paymentStatus,
        },
      });
      setResponse(res);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'تعذر الاتصال بخدمة المساعد الذكي. تحقق من إعداد GEMINI_API_KEY على الخادم.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRunAi = (e: React.FormEvent) => {
    e.preventDefault();
    void runAiRequest();
  };

  const handleSaveAsOnlineExam = () => {
    if (!response?.structuredQuestions || response.structuredQuestions.length === 0) return;
    const grp = groups.find((g) => g.id === selectedGroupId) || groups[0];
    const teacher = teachers.find((t) => t.id === grp?.teacherId) || teachers[0];
    if (!grp || !teacher) {
      showToast('اختر مجموعة أولاً لحفظ الامتحان عليها', 'error');
      return;
    }

    const created = createOnlineExam({
      title: `امتحان مُولّد بالذكاء الاصطناعي — ${grp.name}`,
      groupId: grp.id,
      teacherId: teacher.id,
      durationMinutes: 15,
      passingScore: Math.max(
        1,
        Math.ceil(response.structuredQuestions.reduce((s, q) => s + q.points, 0) * 0.6)
      ),
      published: false,
      questions: response.structuredQuestions.map((q, idx) => ({
        id: `ai-q-${Date.now()}-${idx}`,
        prompt: q.prompt,
        type: q.type,
        options: q.options,
        correctIndex: q.correctIndex,
        points: q.points,
      })),
    });

    if (created) {
      showToast('تم حفظ الأسئلة كامتحان أونلاين (مسودة) في صفحة التقييمات', 'success');
    }
  };

  const handleSaveAsLesson = () => {
    if (!response?.reply) return;
    const grp = groups.find((g) => g.id === selectedGroupId) || groups[0];
    const teacher = teachers.find((t) => t.id === grp?.teacherId) || teachers[0];
    if (!grp || !teacher) {
      showToast('اختر مجموعة أولاً لحفظ الدرس عليها', 'error');
      return;
    }

    const created = createLesson({
      title: `خطة شرح ذكية — ${grp.subject}`,
      groupId: grp.id,
      teacherId: teacher.id,
      description: response.reply.slice(0, 600),
      durationMinutes: 25,
      published: false,
    });
    if (created) {
      showToast('تم إنشاء مسودة درس جديدة في منصة التقييمات والدروس', 'success');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A] flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#0F766E]" />
            المساعد الذكي للسنتر (Gemini AI)
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            توليد أسئلة الامتحانات وخطط الدروس وتحليل مستوى الطلاب وتقارير أولياء الأمور
          </p>
        </div>
      </div>

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#0F2A4A]">
            المساعد الذكي غير مفعل في الباقة الحالية
          </h2>
          <p className="text-sm text-[#64748B] max-w-lg mx-auto">
            تتوفر ميزة المساعد الذكي في باقة المؤسسات، ويمكن لمالك السنتر تفعيلها تجريبياً من
            الإعدادات أو عبر الزر التالي.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                icon={<Sparkles className="w-4 h-4" />}
                onClick={() =>
                  togglePlanFeatureOverride(centerSettings.currentPlanId, 'aiAssistant', true)
                }
              >
                تفعيل المساعد الذكي لهذه الباقة
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(ScreenId.SUBSCRIPTION)}>
              عرض الباقات
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Task Selector Column */}
          <Card className="p-4 space-y-2.5 h-fit">
            <h2 className="text-sm font-bold text-[#0F2A4A]">اختر مهمة المساعد</h2>
            <div className="space-y-2">
              {AI_TASK_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTask(item.id);
                    setPrompt(item.placeholder);
                  }}
                  className={`w-full text-right p-3 rounded-xl border transition-all ${
                    task === item.id
                      ? 'border-[#0F766E] bg-[#F0FDFA]'
                      : 'border-[#E2E8F0] hover:border-[#94A3B8] bg-white'
                  }`}
                >
                  <div className="text-sm font-bold text-[#0F2A4A]">{item.label}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Prompt & Result Column */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <form onSubmit={handleRunAi} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="سياق المجموعة (اختياري)">
                    <SelectInput
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                    >
                      <option value="">بدون مجموعة محددة</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} — {g.stage}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>

                  <Field label="سياق الطالب (اختياري)">
                    <SelectInput
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                    >
                      <option value="">بدون طالب محدد</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>

                <Field label={activeTaskMeta.label} required>
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={activeTaskMeta.placeholder}
                    className="w-full p-3 rounded-lg border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
                    required
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#64748B]">
                    تتم معالجة الطلبات عبر خادم التطبيق الآمن بدون كشف أي مفاتيح API للمتصفح.
                  </span>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={loading}
                    icon={<Send className="w-4 h-4" />}
                  >
                    تشغيل المساعد الذكي
                  </Button>
                </div>
              </form>
            </Card>

            {errorMsg && (
              <ErrorState
                title="تعذر تشغيل المساعد الذكي حالياً"
                description={errorMsg}
                onRetry={() => void runAiRequest()}
              />
            )}

            {response ? (
              <Card className="p-5 space-y-4 border-[#0F766E]/30">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#0F766E]" />
                    <h3 className="text-sm font-bold text-[#0F2A4A]">نتيجة المساعد الذكي</h3>
                    <StatusChip label={response.model} tone="navy" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {response.structuredQuestions && response.structuredQuestions.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<FilePlus2 className="w-3.5 h-3.5" />}
                        onClick={handleSaveAsOnlineExam}
                      >
                        حفظ كامتحان أونلاين ({response.structuredQuestions.length} أسئلة)
                      </Button>
                    )}
                    {task === 'lesson_outline' && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        onClick={handleSaveAsLesson}
                      >
                        حفظ كمسودة درس بالمنصة
                      </Button>
                    )}
                  </div>
                </div>

                {response.structuredQuestions && response.structuredQuestions.length > 0 ? (
                  <div className="space-y-3">
                    {response.structuredQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2"
                      >
                        <div className="font-bold text-sm text-[#0F2A4A]">
                          {idx + 1}. {q.prompt}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-2.5 py-1.5 rounded-lg border ${
                                oIdx === q.correctIndex
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                  : 'bg-white border-[#E2E8F0] text-[#475569]'
                              }`}
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-7 text-[#1E293B]">
                    {response.reply}
                  </div>
                )}
              </Card>
            ) : (
              !loading &&
              !errorMsg && (
                <EmptyState
                  title="جاهز لتنفيذ طلبك"
                  description="اختر المهمة واكتب المطلوب ثم اضغط «تشغيل المساعد الذكي» للحصول على نتيجة فورية."
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
