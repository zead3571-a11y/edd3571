import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Lock,
  Plus,
  Receipt,
  Search,
  Unlock,
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
  computeClosingVariance,
  computeShiftDrawerMetrics,
  getActiveOpenShift,
} from '../../features/finance/cashRegisterService';
import { buildInstallmentSchedule } from '../../features/finance/installmentsService';
import {
  Button,
  Card,
  Drawer,
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
  CashRegisterShift,
  InstallmentItem,
  InstallmentPlan,
  PaymentRecord,
  ScreenId,
  UserRole,
} from '../../types/eduflow';
import { FinanceSubNav } from './FinanceScreens';

// =============================================================================
// 1. CASH REGISTER & DAILY SHIFT CLOSING (قفل اليومية والخزنة)
// =============================================================================

export const CashRegisterScreen: React.FC = () => {
  const {
    currentActor,
    currentRole,
    centerSettings,
    cashShifts,
    payments,
    expenses,
    settlements,
    openCashShift,
    closeCashShift,
    togglePlanFeatureOverride,
    listStateMode,
    setListStateMode,
    navigate,
    showToast,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'cashRegister',
    centerSettings
  );
  const canCreateShift = can(currentActor, 'create', 'cashShifts');
  const canCloseShift = can(currentActor, 'update', 'cashShifts');

  const activeShift = useMemo(() => getActiveOpenShift(cashShifts), [cashShifts]);
  const closedShifts = useMemo(
    () =>
      [...cashShifts]
        .filter((s) => s.status === 'closed')
        .sort(
          (a, b) =>
            new Date(b.closedAt || b.openedAt).getTime() -
            new Date(a.closedAt || a.openedAt).getTime()
        ),
    [cashShifts]
  );

  const liveMetrics = useMemo(() => {
    if (!activeShift) return null;
    return computeShiftDrawerMetrics({
      openingBalance: activeShift.openingBalance,
      openedAtIso: activeShift.openedAt,
      payments,
      expenses,
      settlements,
    });
  }, [activeShift, payments, expenses, settlements]);

  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState('500');
  const [openingNote, setOpeningNote] = useState('');

  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [actualCountedInput, setActualCountedInput] = useState('');
  const [closingNote, setClosingNote] = useState('');

  const [selectedShiftDetail, setSelectedShiftDetail] = useState<CashRegisterShift | null>(null);

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const bal = Math.max(0, Number(openingBalanceInput) || 0);
    const created = openCashShift(bal, openingNote.trim() || undefined);
    if (created) {
      setOpenModalVisible(false);
      setOpeningNote('');
    }
  };

  const handleOpenCloseModal = () => {
    if (!liveMetrics) return;
    setActualCountedInput(String(liveMetrics.expectedCashInDrawer));
    setClosingNote('');
    setCloseModalVisible(true);
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    const actual = Math.max(0, Number(actualCountedInput) || 0);
    const closed = closeCashShift({
      shiftId: activeShift.id,
      actualCountedCash: actual,
      note: closingNote.trim() || undefined,
    });
    if (closed) {
      setCloseModalVisible(false);
    }
  };

  const liveVariance = useMemo(() => {
    if (!liveMetrics) return null;
    const actual = Number(actualCountedInput);
    if (Number.isNaN(actual)) return null;
    return computeClosingVariance(liveMetrics.expectedCashInDrawer, actual);
  }, [liveMetrics, actualCountedInput]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A]">
            قفل اليومية والخزنة
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            متابعة حركة الدرج النقدي والتحصيلات الإلكترونية ومطابقة الجرد الفعلي يومياً
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!activeShift && canCreateShift && isEnabled && (
            <Button
              variant="primary"
              icon={<Unlock className="w-4 h-4" />}
              onClick={() => setOpenModalVisible(true)}
            >
              فتح وردية خزنة جديدة
            </Button>
          )}
          {activeShift && canCloseShift && isEnabled && (
            <Button
              variant="primary"
              icon={<Lock className="w-4 h-4" />}
              onClick={handleOpenCloseModal}
            >
              تقفيل اليومية والخزنة
            </Button>
          )}
          <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
        </div>
      </div>

      <FinanceSubNav active={ScreenId.CASH_REGISTER} />

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#0F2A4A]">
            ميزة تقفيل الخزنة واليومية غير مفعلة في الباقة الحالية
          </h2>
          <p className="text-sm text-[#64748B] max-w-md mx-auto">
            تتوفر إدارة الورديات وتقرير الجرد Z-Report في الباقة الاحترافية والمؤسسات.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                onClick={() =>
                  togglePlanFeatureOverride(centerSettings.currentPlanId, 'cashRegister', true)
                }
              >
                تفعيل الميزة لهذه الباقة
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(ScreenId.SUBSCRIPTION)}>
              ترقية الباقة
            </Button>
          </div>
        </Card>
      ) : listStateMode === 'loading' ? (
        <TableSkeleton rows={4} />
      ) : listStateMode === 'error' ? (
        <ErrorState onRetry={() => setListStateMode('ready')} />
      ) : listStateMode === 'empty' || (cashShifts.length === 0 && !activeShift) ? (
        <EmptyState
          title="لا توجد ورديات مسجلة بعد"
          description="ابدأ بفتح أول وردية خزنة لتتبع المتحصلات والمصروفات النقدية يومياً."
          actionLabel={canCreateShift ? 'فتح وردية خزنة جديدة' : undefined}
          onAction={canCreateShift ? () => setOpenModalVisible(true) : undefined}
        />
      ) : (
        <div className="space-y-5">
          {activeShift && liveMetrics ? (
            <Card className="p-5 border-[#0F766E]/30 bg-gradient-to-l from-[#F0FDFA] to-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-[#0F2A4A]">
                        الوردية الحالية المفتوحة
                      </h2>
                      <StatusChip label="مفتوحة الآن" tone="success" />
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      فتحها: <strong className="text-[#0F2A4A]">{activeShift.openedBy}</strong> ·{' '}
                      <span className="tabular-nums">
                        {formatDateDDMMYYYY(activeShift.openedAt)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs text-[#64748B]">النقدية المتوقعة داخل الدرج الآن</div>
                  <div className="text-2xl font-extrabold text-[#0F766E] tabular-nums">
                    {formatEGP(liveMetrics.expectedCashInDrawer)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                  <div className="text-xs text-[#64748B]">عهدة بداية الوردية</div>
                  <div className="text-base font-bold text-[#0F2A4A] tabular-nums mt-1">
                    {formatEGP(activeShift.openingBalance)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                  <div className="text-xs text-[#64748B]">محصل نقدي (كاش)</div>
                  <div className="text-base font-bold text-emerald-700 tabular-nums mt-1">
                    +{formatEGP(liveMetrics.cashCollected)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                  <div className="text-xs text-[#64748B]">إنستاباي / محفظة / بنكي</div>
                  <div className="text-base font-bold text-[#0F2A4A] tabular-nums mt-1">
                    {formatEGP(
                      liveMetrics.instapayCollected +
                        liveMetrics.walletCollected +
                        liveMetrics.bankCollected
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                  <div className="text-xs text-[#64748B]">مصروفات وتسويات نقدية</div>
                  <div className="text-base font-bold text-red-700 tabular-nums mt-1">
                    -{formatEGP(liveMetrics.expensesTotal + liveMetrics.settlementsPaidTotal)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] pt-2 border-t border-[#E2E8F0]">
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    إنستاباي:{' '}
                    <strong className="tabular-nums">
                      {formatEGP(liveMetrics.instapayCollected)}
                    </strong>
                  </span>
                  <span>
                    محفظة إلكترونية:{' '}
                    <strong className="tabular-nums">
                      {formatEGP(liveMetrics.walletCollected)}
                    </strong>
                  </span>
                  <span>
                    تحويل بنكي:{' '}
                    <strong className="tabular-nums">
                      {formatEGP(liveMetrics.bankCollected)}
                    </strong>
                  </span>
                </div>
                {activeShift.note && (
                  <span className="text-[#64748B]">ملاحظة: {activeShift.note}</span>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-slate-50 border-dashed border-[#CBD5E1] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-[#64748B]" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F2A4A]">
                    لا توجد وردية مفتوحة حالياً
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    افتح وردية خزنة جديدة لبدء احتساب المتحصلات النقدية وتجهيز تقفيل اليوم.
                  </p>
                </div>
              </div>
              {canCreateShift && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Unlock className="w-4 h-4" />}
                  onClick={() => setOpenModalVisible(true)}
                >
                  فتح وردية الآن
                </Button>
              )}
            </Card>
          )}

          {/* Closed Z-Reports History */}
          <Card padding="p-0" className="overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0F766E]" />
                <h2 className="text-sm font-bold text-[#0F2A4A]">
                  سجل الورديات المقفولة (Z-Reports)
                </h2>
              </div>
              <span className="text-xs text-[#64748B] tabular-nums">
                {formatNumber(closedShifts.length)} وردية مقفولة
              </span>
            </div>

            {closedShifts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="لا توجد ورديات مقفولة بعد"
                  description="بعد تقفيل الوردية الحالية سيظهر تقرير المطابقة والعجز/الزيادة هنا."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#F8FAFC] text-xs font-bold text-[#475569] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-3">تاريخ الإغلاق</th>
                      <th className="px-4 py-3">المسؤول</th>
                      <th className="px-4 py-3">عهدة البداية</th>
                      <th className="px-4 py-3">كاش محصل</th>
                      <th className="px-4 py-3">تحويلات إلكترونية</th>
                      <th className="px-4 py-3">متوقع بالدرج</th>
                      <th className="px-4 py-3">الجرد الفعلي</th>
                      <th className="px-4 py-3">الفارق</th>
                      <th className="px-4 py-3">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {closedShifts.map((shift) => {
                      const nonCash =
                        shift.instapayCollected + shift.walletCollected + shift.bankCollected;
                      const variance = shift.variance ?? 0;
                      const varTone =
                        variance === 0 ? 'success' : variance > 0 ? 'navy' : 'danger';
                      const varLabel =
                        variance === 0
                          ? 'مطابق تماماً'
                          : variance > 0
                          ? `زيادة ${formatEGP(variance)}`
                          : `عجز ${formatEGP(Math.abs(variance))}`;

                      return (
                        <tr key={shift.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 tabular-nums text-xs">
                            {formatDateDDMMYYYY(shift.closedAt || shift.openedAt)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#0F2A4A]">
                            {shift.closedBy || shift.openedBy}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {formatEGP(shift.openingBalance)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-emerald-700 font-semibold">
                            {formatEGP(shift.cashCollected)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-[#475569]">
                            {formatEGP(nonCash)}
                          </td>
                          <td className="px-4 py-3 tabular-nums font-bold text-[#0F2A4A]">
                            {formatEGP(shift.expectedCashInDrawer)}
                          </td>
                          <td className="px-4 py-3 tabular-nums font-bold text-[#0F766E]">
                            {formatEGP(shift.actualCountedCash ?? shift.expectedCashInDrawer)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusChip label={varLabel} tone={varTone} />
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedShiftDetail(shift)}
                            >
                              عرض Z-Report
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Open Shift Modal */}
      <Modal
        open={openModalVisible}
        onClose={() => setOpenModalVisible(false)}
        title="فتح وردية خزنة جديدة"
      >
        <form onSubmit={handleOpenShift} className="space-y-4">
          <Field label="رصيد بداية الوردية (عهدة الدرج بالـ ج)" required>
            <TextInput
              type="number"
              min="0"
              value={openingBalanceInput}
              onChange={(e) => setOpeningBalanceInput(e.target.value)}
              className="tabular-nums"
              required
            />
          </Field>
          <Field label="ملاحظة افتتاحية (اختياري)">
            <TextInput
              value={openingNote}
              onChange={(e) => setOpeningNote(e.target.value)}
              placeholder="مثال: وردية الصباح - تسليم فكة 500 ج"
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpenModalVisible(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" icon={<Unlock className="w-4 h-4" />}>
              تأكيد فتح الوردية
            </Button>
          </div>
        </form>
      </Modal>

      {/* Close Shift Modal */}
      <Modal
        open={closeModalVisible}
        onClose={() => setCloseModalVisible(false)}
        title="تقفيل اليومية وجرد الخزنة (Z-Report)"
      >
        {liveMetrics && (
          <form onSubmit={handleCloseShift} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748B]">عهدة بداية الوردية:</span>
                <strong className="tabular-nums">
                  {formatEGP(activeShift?.openingBalance || 0)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">+ إجمالي المتحصل النقدي:</span>
                <strong className="tabular-nums text-emerald-700">
                  {formatEGP(liveMetrics.cashCollected)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">- المصروفات والتسويات النقدية:</span>
                <strong className="tabular-nums text-red-700">
                  {formatEGP(liveMetrics.expensesTotal + liveMetrics.settlementsPaidTotal)}
                </strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E2E8F0] text-base">
                <span className="font-bold text-[#0F2A4A]">النقدية المتوقعة بالدرج:</span>
                <strong className="tabular-nums text-[#0F766E]">
                  {formatEGP(liveMetrics.expectedCashInDrawer)}
                </strong>
              </div>
            </div>

            <Field label="النقدية الفعلية المعدودة داخل الدرج (ج)" required>
              <TextInput
                type="number"
                min="0"
                value={actualCountedInput}
                onChange={(e) => setActualCountedInput(e.target.value)}
                className="tabular-nums text-base font-bold"
                required
              />
            </Field>

            {liveVariance !== null && (
              <div
                className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-between ${
                  liveVariance === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : liveVariance > 0
                    ? 'bg-sky-50 border-sky-200 text-sky-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <span>نتيجة المطابقة الفورية:</span>
                <span>
                  {liveVariance === 0
                    ? 'مطابق تماماً (فارق 0 ج)'
                    : liveVariance > 0
                    ? `زيادة في الدرج +${formatEGP(liveVariance)}`
                    : `عجز في الدرج -${formatEGP(Math.abs(liveVariance))}`}
                </span>
              </div>
            )}

            <Field label="ملاحظات الإغلاق (اختياري)">
              <TextInput
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                placeholder="سبب العجز أو الزيادة إن وجد..."
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setCloseModalVisible(false)}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" icon={<Lock className="w-4 h-4" />}>
                اعتماد وتقفيل الوردية
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Z-Report Detail Modal */}
      <Modal
        open={Boolean(selectedShiftDetail)}
        onClose={() => setSelectedShiftDetail(null)}
        title="تقرير إغلاق الوردية (Z-Report)"
      >
        {selectedShiftDetail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div>
                <div className="text-xs text-[#64748B]">فتح الوردية</div>
                <div className="font-bold text-[#0F2A4A]">
                  {selectedShiftDetail.openedBy} (
                  {formatDateDDMMYYYY(selectedShiftDetail.openedAt)})
                </div>
              </div>
              <div>
                <div className="text-xs text-[#64748B]">تقفيل الوردية</div>
                <div className="font-bold text-[#0F2A4A]">
                  {selectedShiftDetail.closedBy || '—'} (
                  {formatDateDDMMYYYY(
                    selectedShiftDetail.closedAt || selectedShiftDetail.openedAt
                  )}
                  )
                </div>
              </div>
            </div>

            <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>رصيد البداية</span>
                <strong className="tabular-nums">
                  {formatEGP(selectedShiftDetail.openingBalance)}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>متحصل نقدي (كاش)</span>
                <strong className="tabular-nums text-emerald-700">
                  +{formatEGP(selectedShiftDetail.cashCollected)}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>إنستاباي</span>
                <strong className="tabular-nums">
                  {formatEGP(selectedShiftDetail.instapayCollected)}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>محفظة إلكترونية</span>
                <strong className="tabular-nums">
                  {formatEGP(selectedShiftDetail.walletCollected)}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>تحويل بنكي</span>
                <strong className="tabular-nums">
                  {formatEGP(selectedShiftDetail.bankCollected)}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-white">
                <span>مصروفات + تسويات نقدية</span>
                <strong className="tabular-nums text-red-700">
                  -
                  {formatEGP(
                    selectedShiftDetail.expensesTotal + selectedShiftDetail.settlementsPaidTotal
                  )}
                </strong>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-[#F8FAFC] font-bold">
                <span>النقدية المتوقعة بالدرج</span>
                <span className="tabular-nums">
                  {formatEGP(selectedShiftDetail.expectedCashInDrawer)}
                </span>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-[#F0FDFA] font-bold text-[#0F766E]">
                <span>الجرد الفعلي</span>
                <span className="tabular-nums">
                  {formatEGP(
                    selectedShiftDetail.actualCountedCash ??
                      selectedShiftDetail.expectedCashInDrawer
                  )}
                </span>
              </div>
            </div>

            {selectedShiftDetail.note && (
              <p className="text-xs text-[#475569] bg-slate-50 p-2.5 rounded-lg">
                ملاحظة: {selectedShiftDetail.note}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => showToast('يمكنك طباعة التقرير من قائمة المتصفح Ctrl+P', 'info')}
              >
                طباعة
              </Button>
              <Button variant="primary" onClick={() => setSelectedShiftDetail(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// =============================================================================
// 2. INSTALLMENTS & PAYMENT PLANS (خطط التقسيط)
// =============================================================================

export const InstallmentsScreen: React.FC = () => {
  const {
    currentActor,
    currentRole,
    centerSettings,
    students,
    invoices,
    installmentPlans,
    createInstallmentPlan,
    payInstallmentItem,
    togglePlanFeatureOverride,
    listStateMode,
    setListStateMode,
    navigate,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'installments',
    centerSettings
  );
  const canCreate = can(currentActor, 'create', 'installmentPlans');
  const canCollect = can(currentActor, 'update', 'installmentPlans');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Create Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studentId, setStudentId] = useState(() => students[0]?.id || '');
  const [invoiceId, setInvoiceId] = useState('');
  const [title, setTitle] = useState('خطة تقسيط مصروفات الترم');
  const [totalAmount, setTotalAmount] = useState('1500');
  const [downPayment, setDownPayment] = useState('300');
  const [installmentsCount, setInstallmentsCount] = useState('3');
  const [firstDueDate, setFirstDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Pay modal
  const [payModal, setPayModal] = useState<{
    plan: InstallmentPlan;
    item: InstallmentItem;
  } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentRecord['method']>('نقدي');

  const studentInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.studentId === studentId &&
          inv.status !== 'paid' &&
          inv.total - inv.paid > 0
      ),
    [invoices, studentId]
  );

  const schedulePreview = useMemo(() => {
    return buildInstallmentSchedule({
      totalAmount: Math.max(0, Number(totalAmount) || 0),
      downPayment: Math.max(0, Number(downPayment) || 0),
      installmentsCount: Math.max(1, Math.min(12, Number(installmentsCount) || 1)),
      firstDueDate: firstDueDate || new Date().toISOString().slice(0, 10),
    });
  }, [totalAmount, downPayment, installmentsCount, firstDueDate]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const kpis = useMemo(() => {
    let totalPlanned = 0;
    let totalCollected = 0;
    let completedCount = 0;
    let pendingItemsCount = 0;

    for (const plan of installmentPlans) {
      const itemsPaid = plan.installments.reduce((sum, item) => sum + item.paidAmount, 0);
      totalPlanned += plan.totalAmount;
      totalCollected += plan.downPayment + itemsPaid;
      const allPaid = plan.installments.every((item) => item.status === 'paid');
      if (allPaid) completedCount += 1;
      pendingItemsCount += plan.installments.filter((item) => item.status !== 'paid').length;
    }

    return {
      totalPlans: installmentPlans.length,
      completedCount,
      totalPlanned,
      totalCollected,
      remaining: Math.max(0, totalPlanned - totalCollected),
      pendingItemsCount,
    };
  }, [installmentPlans]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installmentPlans.filter((plan) => {
      const st = studentMap.get(plan.studentId);
      const isDone = plan.installments.every((it) => it.status === 'paid');
      if (statusFilter === 'active' && isDone) return false;
      if (statusFilter === 'completed' && !isDone) return false;
      if (!q) return true;
      return (
        plan.title.toLowerCase().includes(q) ||
        (st?.name.toLowerCase().includes(q) ?? false) ||
        (st?.code.toLowerCase().includes(q) ?? false)
      );
    });
  }, [installmentPlans, studentMap, search, statusFilter]);

  const handleSelectInvoice = (invId: string) => {
    setInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      const remaining = Math.max(0, inv.total - inv.paid);
      setTotalAmount(String(remaining));
      setTitle(`تقسيط فاتورة ${inv.month} (${inv.number})`);
    }
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    const created = createInstallmentPlan({
      studentId,
      invoiceId: invoiceId || undefined,
      title: title.trim() || 'خطة تقسيط',
      totalAmount: Math.max(0, Number(totalAmount) || 0),
      downPayment: Math.max(0, Number(downPayment) || 0),
      installmentsCount: Math.max(1, Math.min(12, Number(installmentsCount) || 1)),
      firstDueDate,
    });
    if (created) {
      setDrawerOpen(false);
    }
  };

  const handleOpenPayModal = (plan: InstallmentPlan, item: InstallmentItem) => {
    const rem = Math.max(0, item.amount - item.paidAmount);
    setPayAmount(String(rem));
    setPayMethod('نقدي');
    setPayModal({ plan, item });
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    const amt = Math.max(0, Number(payAmount) || 0);
    if (amt <= 0) return;
    const updated = payInstallmentItem({
      planId: payModal.plan.id,
      installmentId: payModal.item.id,
      amount: amt,
      method: payMethod,
    });
    if (updated) {
      setPayModal(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A]">
            خطط التقسيط والأقساط
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            جدولة المصروفات الدراسية على دفعات شهرية وتحصيل كل قسط بإيصال مستقل
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreate && isEnabled && (
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                if (!studentId && students[0]) setStudentId(students[0].id);
                setDrawerOpen(true);
              }}
            >
              إنشاء خطة تقسيط جديدة
            </Button>
          )}
          <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
        </div>
      </div>

      <FinanceSubNav active={ScreenId.INSTALLMENTS} />

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <CreditCard className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#0F2A4A]">
            نظام خطط التقسيط غير مفعل في الباقة الحالية
          </h2>
          <p className="text-sm text-[#64748B] max-w-md mx-auto">
            تتيح خطط التقسيط تقسيم المستحقات إلى دفعات مجدولة مع متابعة الأقساط المستحقة.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                onClick={() =>
                  togglePlanFeatureOverride(centerSettings.currentPlanId, 'installments', true)
                }
              >
                تفعيل التقسيط لهذه الباقة
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(ScreenId.SUBSCRIPTION)}>
              ترقية الباقة
            </Button>
          </div>
        </Card>
      ) : listStateMode === 'loading' ? (
        <TableSkeleton rows={4} />
      ) : listStateMode === 'error' ? (
        <ErrorState onRetry={() => setListStateMode('ready')} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">إجمالي الخطط</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatNumber(kpis.totalPlans)}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                مكتملة: <strong className="tabular-nums">{formatNumber(kpis.completedCount)}</strong>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">إجمالي المبالغ المجدولة</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatEGP(kpis.totalPlanned)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">المحصل (مقدم + أقساط)</div>
              <div className="text-xl font-extrabold text-[#0F766E] tabular-nums mt-1">
                {formatEGP(kpis.totalCollected)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">المتبقي قيد التحصيل</div>
              <div className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">
                {formatEGP(kpis.remaining)}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                أقساط متبقية:{' '}
                <strong className="tabular-nums">{formatNumber(kpis.pendingItemsCount)}</strong>
              </div>
            </Card>
          </div>

          <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[210px]">
              <Search className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم الطالب أو كود الطالب أو عنوان الخطة..."
                className="w-full h-11 pr-9 pl-3 rounded-lg border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'active', label: 'جارية' },
                  { id: 'completed', label: 'مكتملة' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatusFilter(t.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                    statusFilter === t.id
                      ? 'bg-[#0F2A4A] text-white'
                      : 'text-[#475569] hover:text-[#0F2A4A]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          {listStateMode === 'empty' || filteredPlans.length === 0 ? (
            <EmptyState
              title="لا توجد خطط تقسيط مطابقة"
              description="يمكنك إنشاء خطة تقسيط جديدة لأي طالب وتوزيع المستحقات على عدة أشهر."
              actionLabel={canCreate ? 'إنشاء خطة تقسيط جديدة' : undefined}
              onAction={canCreate ? () => setDrawerOpen(true) : undefined}
            />
          ) : (
            <div className="space-y-4">
              {filteredPlans.map((plan) => {
                const st = studentMap.get(plan.studentId);
                const itemsPaid = plan.installments.reduce((s, it) => s + it.paidAmount, 0);
                const totalPaid = plan.downPayment + itemsPaid;
                const progress =
                  plan.totalAmount > 0
                    ? Math.min(100, Math.round((totalPaid / plan.totalAmount) * 100))
                    : 100;
                const isComplete = plan.installments.every((it) => it.status === 'paid');

                return (
                  <Card key={plan.id} padding="p-0" className="overflow-hidden">
                    <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC]">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-[#0F2A4A]">
                            {st?.name || 'طالب'} — {plan.title}
                          </h3>
                          {st?.code && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-[#0F2A4A] tabular-nums">
                              {st.code}
                            </span>
                          )}
                          <StatusChip
                            label={isComplete ? 'مكتملة السداد' : 'قيد السداد'}
                            tone={isComplete ? 'success' : 'warning'}
                          />
                        </div>
                        <p className="text-xs text-[#64748B] mt-1 tabular-nums">
                          الإجمالي: {formatEGP(plan.totalAmount)} · المقدم:{' '}
                          {formatEGP(plan.downPayment)} · المحصل:{' '}
                          <strong className="text-[#0F766E]">{formatEGP(totalPaid)}</strong> (
                          {progress}%)
                        </p>
                      </div>

                      <div className="w-full sm:w-48">
                        <div className="h-2.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                          <div
                            className="h-full bg-[#0F766E] transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-white text-xs text-[#64748B] border-b border-[#E2E8F0]">
                          <tr>
                            <th className="px-4 py-2.5">القسط</th>
                            <th className="px-4 py-2.5">تاريخ الاستحقاق</th>
                            <th className="px-4 py-2.5">المبلغ</th>
                            <th className="px-4 py-2.5">المدفوع</th>
                            <th className="px-4 py-2.5">الحالة</th>
                            <th className="px-4 py-2.5">الإيصال</th>
                            <th className="px-4 py-2.5">الإجراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {plan.installments.map((item) => {
                            const remaining = Math.max(0, item.amount - item.paidAmount);
                            const chip =
                              item.status === 'paid'
                                ? { label: 'مدفوع', tone: 'success' as const }
                                : item.status === 'partial'
                                ? { label: 'جزئي', tone: 'warning' as const }
                                : item.status === 'overdue'
                                ? { label: 'متأخر', tone: 'danger' as const }
                                : { label: 'مستحق', tone: 'neutral' as const };

                            return (
                              <tr key={item.id} className="hover:bg-[#F8FAFC]">
                                <td className="px-4 py-2.5 font-bold text-[#0F2A4A] tabular-nums">
                                  القسط {item.index}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums text-xs">
                                  {formatDateDDMMYYYY(item.dueDate)}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums font-semibold">
                                  {formatEGP(item.amount)}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums text-[#0F766E]">
                                  {formatEGP(item.paidAmount)}
                                </td>
                                <td className="px-4 py-2.5">
                                  <StatusChip label={chip.label} tone={chip.tone} />
                                </td>
                                <td className="px-4 py-2.5 tabular-nums text-xs text-[#475569]">
                                  {item.receiptNumber || '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  {remaining > 0 && canCollect ? (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon={<Banknote className="w-3.5 h-3.5" />}
                                      onClick={() => handleOpenPayModal(plan, item)}
                                    >
                                      تحصيل ({formatEGP(remaining)})
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      مكتمل
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create Plan Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="إنشاء خطة تقسيط جديدة"
      >
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <Field label="الطالب" required>
            <SelectInput
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setInvoiceId('');
              }}
              required
            >
              <option value="">اختر الطالب...</option>
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </SelectInput>
          </Field>

          {studentInvoices.length > 0 && (
            <Field label="ربط بفاتورة مستحقة (اختياري)">
              <SelectInput value={invoiceId} onChange={(e) => handleSelectInvoice(e.target.value)}>
                <option value="">خطة تقسيط مستقلة</option>
                {studentInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {inv.month} (متبقي {formatEGP(inv.total - inv.paid)}
                    )
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}

          <Field label="عنوان الخطة" required>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مصروفات المراجعة النهائية"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="إجمالي المبلغ (ج)" required>
              <TextInput
                type="number"
                min="1"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="المقدم المدفوع الآن (ج)">
              <TextInput
                type="number"
                min="0"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="عدد الأقساط (1 إلى 12)" required>
              <TextInput
                type="number"
                min="1"
                max="12"
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="تاريخ أول قسط" required>
              <TextInput
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F2A4A]">
              <CalendarCheck className="w-4 h-4 text-[#0F766E]" />
              معاينة جدول الأقساط التلقائي
            </div>
            <div className="divide-y divide-[#E2E8F0] text-xs">
              {!schedulePreview.ok ? (
                <p className="text-red-600 py-1.5 font-semibold">
                  {schedulePreview.error || 'تحقق من إجمالي المبلغ والمقدم'}
                </p>
              ) : (
                schedulePreview.installments.map((item) => (
                  <div key={item.id} className="flex justify-between py-1.5 tabular-nums">
                    <span>
                      القسط {item.index} ({formatDateDDMMYYYY(item.dueDate)})
                    </span>
                    <strong className="text-[#0F2A4A]">{formatEGP(item.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" icon={<FileSpreadsheet className="w-4 h-4" />}>
              حفظ وجدولة الأقساط
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Collect Installment Modal */}
      <Modal open={Boolean(payModal)} onClose={() => setPayModal(null)} title="تحصيل قسط">
        {payModal && (
          <form onSubmit={handlePaySubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm space-y-1">
              <div className="font-bold text-[#0F2A4A]">
                {studentMap.get(payModal.plan.studentId)?.name || 'طالب'} — {payModal.plan.title}
              </div>
              <div className="text-xs text-[#64748B] tabular-nums">
                القسط رقم {payModal.item.index} · المستحق:{' '}
                {formatEGP(Math.max(0, payModal.item.amount - payModal.item.paidAmount))}
              </div>
            </div>

            <Field label="المبلغ المدفوع (ج)" required>
              <TextInput
                type="number"
                min="1"
                max={Math.max(1, payModal.item.amount - payModal.item.paidAmount)}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>

            <Field label="طريقة الدفع">
              <SelectInput
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentRecord['method'])}
              >
                <option value="نقدي">نقدي (كاش)</option>
                <option value="إنستاباي">إنستاباي (InstaPay)</option>
                <option value="محفظة">محفظة إلكترونية</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
              </SelectInput>
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setPayModal(null)}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" icon={<CheckCircle2 className="w-4 h-4" />}>
                تأكيد التحصيل وإصدار الإيصال
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
