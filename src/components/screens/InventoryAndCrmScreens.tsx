import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Home,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
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
  computeInventorySummary,
  findLowStockItems,
  validateInventoryTransaction,
} from '../../features/inventory/inventoryService';
import {
  countLeadsByStatus,
  validatePublicLeadForm,
} from '../../features/crm/registrationService';
import {
  Button,
  Card,
  Drawer,
  EduflowLogo,
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
  InventoryItem,
  InventoryTransaction,
  PaymentRecord,
  RegistrationLead,
  RegistrationLeadStatus,
  ScreenId,
  UserRole,
} from '../../types/eduflow';

// =============================================================================
// 1. INVENTORY & BOOKLETS (المذكرات والمخزون)
// =============================================================================

export const InventoryScreen: React.FC = () => {
  const {
    currentActor,
    currentRole,
    centerSettings,
    groups,
    students,
    inventoryItems,
    inventoryTransactions,
    createInventoryItem,
    recordInventoryTransaction,
    togglePlanFeatureOverride,
    listStateMode,
    setListStateMode,
    navigate,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'inventory',
    centerSettings
  );
  const canCreateItem = can(currentActor, 'create', 'inventoryItems');
  const canRecordTx = can(currentActor, 'create', 'inventoryTransactions');

  const [tab, setTab] = useState<'items' | 'transactions'>('items');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | InventoryItem['category']>('all');

  // New Item Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<InventoryItem['category']>('مذكرة');
  const [stage, setStage] = useState(() => centerSettings.stages[0] || 'الثالث الثانوي');
  const [subject, setSubject] = useState('اللغة الفرنسية');
  const [groupId, setGroupId] = useState('');
  const [unitPrice, setUnitPrice] = useState('65');
  const [costPrice, setCostPrice] = useState('30');
  const [stockQty, setStockQty] = useState('50');
  const [minStockAlert, setMinStockAlert] = useState('10');

  // Transaction Modal
  const [txModal, setTxModal] = useState<{
    item: InventoryItem;
    type: InventoryTransaction['type'];
  } | null>(null);
  const [txQty, setTxQty] = useState('1');
  const [txStudentId, setTxStudentId] = useState(() => students[0]?.id || '');
  const [txMethod, setTxMethod] = useState<PaymentRecord['method']>('نقدي');
  const [txNote, setTxNote] = useState('');
  const [txError, setTxError] = useState('');

  const summary = useMemo(
    () => computeInventorySummary(inventoryItems, inventoryTransactions),
    [inventoryItems, inventoryTransactions]
  );
  const lowStockItems = useMemo(() => findLowStockItems(inventoryItems), [inventoryItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.stage.toLowerCase().includes(q)
      );
    });
  }, [inventoryItems, search, categoryFilter]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...inventoryTransactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!q) return sorted;
    return sorted.filter(
      (tx) =>
        tx.itemName.toLowerCase().includes(q) ||
        (tx.studentName?.toLowerCase().includes(q) ?? false) ||
        (tx.note?.toLowerCase().includes(q) ?? false)
    );
  }, [inventoryTransactions, search]);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    const created = createInventoryItem({
      name: itemName.trim(),
      category,
      stage,
      subject: subject.trim() || 'عام',
      groupId: groupId || undefined,
      unitPrice: Math.max(0, Number(unitPrice) || 0),
      costPrice: Math.max(0, Number(costPrice) || 0),
      stockQty: Math.max(0, Number(stockQty) || 0),
      minStockAlert: Math.max(0, Number(minStockAlert) || 5),
    });
    if (created) {
      setDrawerOpen(false);
      setItemName('');
    }
  };

  const openTxModal = (item: InventoryItem, type: InventoryTransaction['type']) => {
    setTxModal({ item, type });
    setTxQty('1');
    setTxStudentId(students[0]?.id || '');
    setTxMethod('نقدي');
    setTxNote('');
    setTxError('');
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txModal) return;
    const qtyNum = Number(txQty) || 0;
    const check = validateInventoryTransaction({
      item: txModal.item,
      type: txModal.type,
      qty: qtyNum,
    });
    if (!check.ok) {
      setTxError(check.error || 'تعذر تنفيذ الحركة');
      return;
    }

    const tx = recordInventoryTransaction({
      itemId: txModal.item.id,
      type: txModal.type,
      qty: qtyNum,
      studentId: txModal.type === 'sale' || txModal.type === 'issue' ? txStudentId : undefined,
      paymentMethod: txModal.type === 'sale' ? txMethod : undefined,
      note: txNote.trim() || undefined,
    });
    if (tx) {
      setTxModal(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A]">
            المذكرات والمخزون
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            إدارة رصيد المذكرات والكتب ومبيعات الطلاب وتنبيهات النفاد المبكر
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateItem && isEnabled && (
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setDrawerOpen(true)}
            >
              إضافة مذكرة / صنف جديد
            </Button>
          )}
          <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
        </div>
      </div>

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#0F2A4A]">
            إدارة المذكرات والمخزون غير مفعلة في الباقة الحالية
          </h2>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                onClick={() =>
                  togglePlanFeatureOverride(centerSettings.currentPlanId, 'inventory', true)
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
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">إجمالي الأصناف</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatNumber(inventoryItems.length)}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1 tabular-nums">
                إجمالي الوحدات: {formatNumber(summary.totalUnits)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">القيمة السوقية للمخزون</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatEGP(summary.totalStockValue)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">إجمالي مبيعات المذكرات</div>
              <div className="text-xl font-extrabold text-[#0F766E] tabular-nums mt-1">
                {formatEGP(summary.salesRevenue)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">أصناف قاربت على النفاد</div>
              <div
                className={`text-xl font-extrabold tabular-nums mt-1 ${
                  summary.lowStockCount > 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {formatNumber(summary.lowStockCount)}
              </div>
            </Card>
          </div>

          {lowStockItems.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  تنبيه مخزون منخفض لـ{' '}
                  <strong>{formatNumber(lowStockItems.length)}</strong> صنف:{' '}
                  {lowStockItems.map((i) => `${i.name} (${i.stockQty})`).join(' · ')}
                </span>
              </div>
            </div>
          )}

          <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTab('items')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                  tab === 'items'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'text-[#475569] hover:text-[#0F2A4A]'
                }`}
              >
                الأصناف والمذكرات ({formatNumber(inventoryItems.length)})
              </button>
              <button
                type="button"
                onClick={() => setTab('transactions')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                  tab === 'transactions'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'text-[#475569] hover:text-[#0F2A4A]'
                }`}
              >
                سجل الحركات والمبيعات ({formatNumber(inventoryTransactions.length)})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[240px]">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث في المذكرات أو الطالب..."
                  className="w-full h-11 pr-9 pl-3 rounded-lg border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
                />
              </div>

              {tab === 'items' && (
                <div className="w-full sm:w-40 shrink-0">
                  <SelectInput
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as 'all' | InventoryItem['category'])
                    }
                  >
                    <option value="all">كل التصنيفات</option>
                    <option value="مذكرة">مذكرة</option>
                    <option value="كتاب">كتاب</option>
                    <option value="أدوات">أدوات</option>
                    <option value="أخرى">أخرى</option>
                  </SelectInput>
                </div>
              )}
            </div>
          </Card>

          {tab === 'items' ? (
            listStateMode === 'empty' || filteredItems.length === 0 ? (
              <EmptyState
                title="لا توجد أصناف مطابقة"
                description="أضف المذكرات والكتب الخاصة بالسنتر لمتابعة الكميات وبيعها للطلاب."
                actionLabel={canCreateItem ? 'إضافة صنف جديد' : undefined}
                onAction={canCreateItem ? () => setDrawerOpen(true) : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map((item) => {
                  const isLow = item.stockQty <= item.minStockAlert;
                  return (
                    <Card key={item.id} className="p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <StatusChip label={item.category} tone="navy" />
                              <StatusChip
                                label={
                                  item.stockQty === 0
                                    ? 'نفد من المخزن'
                                    : isLow
                                    ? `مخزون منخفض (${item.stockQty})`
                                    : `متوفر (${item.stockQty})`
                                }
                                tone={
                                  item.stockQty === 0
                                    ? 'danger'
                                    : isLow
                                    ? 'warning'
                                    : 'success'
                                }
                              />
                            </div>
                            <h3 className="text-base font-bold text-[#0F2A4A] mt-2">
                              {item.name}
                            </h3>
                            <p className="text-xs text-[#64748B]">
                              {item.stage} · {item.subject}
                            </p>
                          </div>

                          <div className="text-left">
                            <div className="text-lg font-extrabold text-[#0F766E] tabular-nums">
                              {formatEGP(item.unitPrice)}
                            </div>
                            <div className="text-[11px] text-[#94A3B8] tabular-nums">
                              التكلفة: {formatEGP(item.costPrice)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {canRecordTx && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E2E8F0]">
                          <Button
                            size="sm"
                            variant="primary"
                            className="flex-1"
                            disabled={item.stockQty <= 0}
                            icon={<ShoppingBag className="w-3.5 h-3.5" />}
                            onClick={() => openTxModal(item, 'sale')}
                          >
                            بيع لطالب
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<PackagePlus className="w-3.5 h-3.5" />}
                            onClick={() => openTxModal(item, 'restock')}
                          >
                            توريد
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={item.stockQty <= 0}
                            onClick={() => openTxModal(item, 'issue')}
                          >
                            صرف مجاني
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              {filteredTransactions.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="لا توجد حركات مخزون بعد"
                    description="ستظهر هنا جميع عمليات البيع والصرف والتوريد تلقائياً."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#F8FAFC] text-xs font-bold text-[#475569] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-4 py-3">التاريخ</th>
                        <th className="px-4 py-3">الصنف</th>
                        <th className="px-4 py-3">الحركة</th>
                        <th className="px-4 py-3">الكمية</th>
                        <th className="px-4 py-3">الإجمالي</th>
                        <th className="px-4 py-3">الطالب</th>
                        <th className="px-4 py-3">طريقة الدفع</th>
                        <th className="px-4 py-3">المسؤول</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredTransactions.map((tx) => {
                        const typeLabel =
                          tx.type === 'sale'
                            ? 'بيع لطالب'
                            : tx.type === 'restock'
                            ? 'توريد مخزن'
                            : tx.type === 'issue'
                            ? 'صرف مجاني'
                            : 'تسوية جرد';
                        const typeTone =
                          tx.type === 'sale'
                            ? 'success'
                            : tx.type === 'restock'
                            ? 'navy'
                            : tx.type === 'issue'
                            ? 'warning'
                            : 'neutral';

                        return (
                          <tr key={tx.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-4 py-3 text-xs tabular-nums">
                              {formatDateDDMMYYYY(tx.createdAt)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[#0F2A4A]">
                              {tx.itemName}
                            </td>
                            <td className="px-4 py-3">
                              <StatusChip label={typeLabel} tone={typeTone} />
                            </td>
                            <td className="px-4 py-3 tabular-nums font-bold">{tx.qty}</td>
                            <td className="px-4 py-3 tabular-nums font-bold text-[#0F766E]">
                              {formatEGP(tx.totalAmount)}
                            </td>
                            <td className="px-4 py-3 text-xs">{tx.studentName || '—'}</td>
                            <td className="px-4 py-3 text-xs">{tx.paymentMethod || '—'}</td>
                            <td className="px-4 py-3 text-xs text-[#64748B]">{tx.handledBy}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* New Item Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="إضافة مذكرة أو صنف جديد"
      >
        <form onSubmit={handleCreateItem} className="space-y-4">
          <Field label="اسم المذكرة / الصنف" required>
            <TextInput
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="مثال: مذكرة المراجعة النهائية - اللغة الفرنسية"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="التصنيف">
              <SelectInput
                value={category}
                onChange={(e) => setCategory(e.target.value as InventoryItem['category'])}
              >
                <option value="مذكرة">مذكرة</option>
                <option value="كتاب">كتاب</option>
                <option value="أدوات">أدوات</option>
                <option value="أخرى">أخرى</option>
              </SelectInput>
            </Field>
            <Field label="المرحلة الدراسية">
              <SelectInput value={stage} onChange={(e) => setStage(e.target.value)}>
                {centerSettings.stages.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="المادة">
              <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="المجموعة المرتبطة (اختياري)">
              <SelectInput value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">عام للجميع</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر البيع (ج)" required>
              <TextInput
                type="number"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="سعر التكلفة (ج)">
              <TextInput
                type="number"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الرصيد الافتتاحي" required>
              <TextInput
                type="number"
                min="0"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="حد تنبيه النفاد">
              <TextInput
                type="number"
                min="0"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" icon={<Package className="w-4 h-4" />}>
              حفظ الصنف
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Inventory Transaction Modal */}
      <Modal
        open={Boolean(txModal)}
        onClose={() => setTxModal(null)}
        title={
          txModal?.type === 'sale'
            ? 'بيع مذكرة / صنف لطالب'
            : txModal?.type === 'restock'
            ? 'توريد كمية جديدة للمخزن'
            : 'صرف مجاني من المخزن'
        }
      >
        {txModal && (
          <form onSubmit={handleTxSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm">
              <div className="font-bold text-[#0F2A4A]">{txModal.item.name}</div>
              <div className="text-xs text-[#64748B] mt-1 tabular-nums">
                المتوفر حالياً: <strong>{txModal.item.stockQty}</strong> · سعر الوحدة:{' '}
                <strong>{formatEGP(txModal.item.unitPrice)}</strong>
              </div>
            </div>

            {txError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                {txError}
              </div>
            )}

            <Field label="الكمية" required>
              <TextInput
                type="number"
                min="1"
                value={txQty}
                onChange={(e) => setTxQty(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>

            {(txModal.type === 'sale' || txModal.type === 'issue') && (
              <Field label="الطالب المستلم" required>
                <SelectInput
                  value={txStudentId}
                  onChange={(e) => setTxStudentId(e.target.value)}
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
            )}

            {txModal.type === 'sale' && (
              <>
                <Field label="طريقة الدفع">
                  <SelectInput
                    value={txMethod}
                    onChange={(e) => setTxMethod(e.target.value as PaymentRecord['method'])}
                  >
                    <option value="نقدي">نقدي (كاش)</option>
                    <option value="إنستاباي">إنستاباي</option>
                    <option value="محفظة">محفظة إلكترونية</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                  </SelectInput>
                </Field>
                <div className="p-2.5 rounded-lg bg-[#F0FDFA] border border-[#CCFBF1] flex justify-between text-sm font-bold text-[#0F766E]">
                  <span>الإجمالي المستحق تحصيله:</span>
                  <span className="tabular-nums">
                    {formatEGP((Number(txQty) || 0) * txModal.item.unitPrice)}
                  </span>
                </div>
              </>
            )}

            <Field label="ملاحظة (اختياري)">
              <TextInput
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
                placeholder="بيان إضافي..."
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setTxModal(null)}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" icon={<ArrowUpDown className="w-4 h-4" />}>
                تأكيد الحركة
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// =============================================================================
// 2. REGISTRATION CRM (طلبات الالتحاق والتسجيل الأونلاين)
// =============================================================================

export const RegistrationCrmScreen: React.FC = () => {
  const {
    currentActor,
    currentRole,
    centerSettings,
    groups,
    leads,
    submitPublicRegistrationLead,
    updateLeadStatus,
    convertLeadToStudent,
    togglePlanFeatureOverride,
    listStateMode,
    setListStateMode,
    navigate,
    showToast,
  } = useEduflow();

  const isEnabled = isPlanFeatureEnabled(
    centerSettings.currentPlanId,
    'registrationCrm',
    centerSettings
  );
  const canUpdateLead = can(currentActor, 'update', 'leads');
  const canCreateLead = can(currentActor, 'create', 'leads');
  const canConvertLead = can(currentActor, 'create', 'students');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationLeadStatus>('all');

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStage, setNewStage] = useState(() => centerSettings.stages[0] || 'الثالث الثانوي');
  const [newPhone, setNewPhone] = useState('');
  const [newParentName, setNewParentName] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');
  const [newSubject, setNewSubject] = useState('اللغة الفرنسية');
  const [newGroupId, setNewGroupId] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [convertModalLead, setConvertModalLead] = useState<RegistrationLead | null>(null);
  const [convertGroupId, setConvertGroupId] = useState('');
  const [convertFee, setConvertFee] = useState(
    String(centerSettings.defaultStudentMonthlyFee || 450)
  );

  const counts = useMemo(() => countLeadsByStatus(leads), [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...leads]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((lead) => {
        if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
        if (!q) return true;
        return (
          lead.studentName.toLowerCase().includes(q) ||
          lead.ticketCode.toLowerCase().includes(q) ||
          lead.phone.includes(q) ||
          lead.parentPhone.includes(q) ||
          lead.preferredSubject.toLowerCase().includes(q)
        );
      });
  }, [leads, search, statusFilter]);

  const handleCopyRegistrationLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/register`;
    navigator.clipboard?.writeText(url);
    showToast('تم نسخ رابط استمارة التسجيل الأونلاين', 'success');
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = submitPublicRegistrationLead({
      studentName: newStudentName,
      stage: newStage,
      phone: newPhone,
      parentName: newParentName,
      parentPhone: newParentPhone,
      preferredSubject: newSubject,
      preferredGroupId: newGroupId || undefined,
      notes: newNotes,
    });
    if (res.ok) {
      setQuickAddOpen(false);
      setNewStudentName('');
      setNewPhone('');
      setNewParentName('');
      setNewParentPhone('');
      setNewNotes('');
    } else if (res.error) {
      showToast(res.error, 'error');
    }
  };

  const handleOpenConvert = (lead: RegistrationLead) => {
    setConvertModalLead(lead);
    const gId = lead.preferredGroupId || groups[0]?.id || '';
    setConvertGroupId(gId);
    const grp = groups.find((g) => g.id === gId);
    setConvertFee(String(grp?.monthlyPrice || centerSettings.defaultStudentMonthlyFee || 450));
  };

  const handleConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertModalLead) return;
    const student = convertLeadToStudent({
      leadId: convertModalLead.id,
      groupId: convertGroupId || undefined,
      monthlyFee: Math.max(0, Number(convertFee) || 0),
    });
    if (student) {
      setConvertModalLead(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F2A4A]">
            التسجيل الأونلاين وطلبات الالتحاق
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            استقبال استمارات الطلاب الجدد وتحويلهم إلى طلاب فعليين بالمجموعات بضغطة زر
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<ClipboardCopy className="w-4 h-4" />}
            onClick={handleCopyRegistrationLink}
          >
            نسخ رابط الاستمارة
          </Button>
          <Button
            variant="secondary"
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => navigate(ScreenId.ONLINE_REGISTRATION)}
          >
            فتح الاستمارة العامة
          </Button>
          {canCreateLead && isEnabled && (
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setQuickAddOpen(true)}
            >
              إضافة طلب تسجيل
            </Button>
          )}
          <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
        </div>
      </div>

      {!isEnabled ? (
        <Card className="p-6 text-center space-y-3 border-amber-200 bg-amber-50/40">
          <h2 className="text-base font-bold text-[#0F2A4A]">
            إدارة التسجيل الأونلاين غير مفعلة في الباقة الحالية
          </h2>
          <div className="flex items-center justify-center gap-2">
            {currentRole === UserRole.OWNER && (
              <Button
                variant="primary"
                onClick={() =>
                  togglePlanFeatureOverride(
                    centerSettings.currentPlanId,
                    'registrationCrm',
                    true
                  )
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
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">إجمالي الطلبات</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatNumber(counts.total)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">طلبات جديدة</div>
              <div className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">
                {formatNumber(counts.newCount)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">تم التواصل</div>
              <div className="text-xl font-extrabold text-sky-700 tabular-nums mt-1">
                {formatNumber(counts.contactedCount)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[#64748B]">حصة تجريبية</div>
              <div className="text-xl font-extrabold text-[#0F2A4A] tabular-nums mt-1">
                {formatNumber(counts.trialCount)}
              </div>
            </Card>
            <Card className="p-4 col-span-2 lg:col-span-1">
              <div className="text-xs text-[#64748B]">تم التحويل لطالب</div>
              <div className="text-xl font-extrabold text-[#0F766E] tabular-nums mt-1">
                {formatNumber(counts.convertedCount)}
              </div>
            </Card>
          </div>

          <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث برقم الطلب REG أو اسم الطالب أو الهاتف..."
                className="w-full h-11 pr-9 pl-3 rounded-lg border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'new', label: 'جديد' },
                  { id: 'contacted', label: 'تم التواصل' },
                  { id: 'trial', label: 'تجريبي' },
                  { id: 'converted', label: 'تم التحويل' },
                ] as const
              ).map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setStatusFilter(tabItem.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
                    statusFilter === tabItem.id
                      ? 'bg-[#0F2A4A] text-white'
                      : 'text-[#475569] hover:text-[#0F2A4A]'
                  }`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>
          </Card>

          {listStateMode === 'empty' || filteredLeads.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات تسجيل مطابقة"
              description="شارك رابط استمارة التسجيل الأونلاين مع أولياء الأمور لتظهر طلباتهم هنا."
              actionLabel="فتح الاستمارة العامة"
              onAction={() => navigate(ScreenId.ONLINE_REGISTRATION)}
            />
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#F8FAFC] text-xs font-bold text-[#475569] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-3">رقم الطلب</th>
                      <th className="px-4 py-3">الطالب والمرحلة</th>
                      <th className="px-4 py-3">ولي الأمر والهاتف</th>
                      <th className="px-4 py-3">المادة المطلوبة</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredLeads.map((lead) => {
                      const statusChip =
                        lead.status === 'converted'
                          ? { label: 'تم التحويل لطالب', tone: 'success' as const }
                          : lead.status === 'trial'
                          ? { label: 'حصة تجريبية', tone: 'navy' as const }
                          : lead.status === 'contacted'
                          ? { label: 'تم التواصل', tone: 'warning' as const }
                          : lead.status === 'archived'
                          ? { label: 'مؤرشف', tone: 'neutral' as const }
                          : { label: 'جديد', tone: 'danger' as const };

                      return (
                        <tr key={lead.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 tabular-nums font-bold text-[#0F2A4A]">
                            <div>{lead.ticketCode}</div>
                            <div className="text-[11px] text-[#64748B]">
                              {formatDateDDMMYYYY(lead.createdAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-[#0F2A4A]">{lead.studentName}</div>
                            <div className="text-xs text-[#64748B]">{lead.stage}</div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-semibold">{lead.parentName}</div>
                            <div className="tabular-nums text-[#64748B]">
                              طالب: {lead.phone} · ولي أمر: {lead.parentPhone}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-semibold text-[#0F2A4A]">
                              {lead.preferredSubject}
                            </div>
                            {lead.notes && (
                              <div className="text-[#64748B] max-w-[200px] truncate">
                                {lead.notes}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {canUpdateLead && lead.status !== 'converted' ? (
                              <SelectInput
                                value={lead.status}
                                onChange={(e) =>
                                  updateLeadStatus(
                                    lead.id,
                                    e.target.value as RegistrationLeadStatus
                                  )
                                }
                                className="h-9 text-xs min-w-[130px]"
                              >
                                <option value="new">جديد</option>
                                <option value="contacted">تم التواصل</option>
                                <option value="trial">حصة تجريبية</option>
                                <option value="archived">مؤرشف</option>
                              </SelectInput>
                            ) : (
                              <StatusChip label={statusChip.label} tone={statusChip.tone} />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {lead.status === 'converted' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<Users className="w-3.5 h-3.5" />}
                                onClick={() => navigate(ScreenId.STUDENTS)}
                              >
                                عرض بالطلاب
                              </Button>
                            ) : (
                              canConvertLead && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<UserCheck className="w-3.5 h-3.5" />}
                                  onClick={() => handleOpenConvert(lead)}
                                >
                                  تحويل لطالب فعلي
                                </Button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Quick Lead Modal */}
      <Modal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        title="إضافة طلب تسجيل جديد"
      >
        <form onSubmit={handleQuickAddSubmit} className="space-y-3">
          <Field label="اسم الطالب" required>
            <TextInput
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المرحلة الدراسية">
              <SelectInput value={newStage} onChange={(e) => setNewStage(e.target.value)}>
                {centerSettings.stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="موبايل الطالب" required>
              <TextInput
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="tabular-nums"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم ولي الأمر" required>
              <TextInput
                value={newParentName}
                onChange={(e) => setNewParentName(e.target.value)}
                required
              />
            </Field>
            <Field label="موبايل ولي الأمر" required>
              <TextInput
                value={newParentPhone}
                onChange={(e) => setNewParentPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="tabular-nums"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المادة المطلوبة" required>
              <TextInput
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                required
              />
            </Field>
            <Field label="المجموعة المقترحة">
              <SelectInput value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)}>
                <option value="">غير محدد</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field label="ملاحظات">
            <TextInput value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setQuickAddOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" icon={<UserPlus className="w-4 h-4" />}>
              حفظ الطلب
            </Button>
          </div>
        </form>
      </Modal>

      {/* Convert Lead to Student Modal */}
      <Modal
        open={Boolean(convertModalLead)}
        onClose={() => setConvertModalLead(null)}
        title="تحويل طلب التسجيل إلى طالب فعلي"
      >
        {convertModalLead && (
          <form onSubmit={handleConvertSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm space-y-1">
              <div className="font-bold text-[#0F2A4A]">{convertModalLead.studentName}</div>
              <div className="text-xs text-[#64748B]">
                {convertModalLead.stage} · ولي الأمر: {convertModalLead.parentName} (
                <span className="tabular-nums">{convertModalLead.parentPhone}</span>)
              </div>
            </div>

            <Field label="تسكين الطالب في مجموعة (اختياري)">
              <SelectInput
                value={convertGroupId}
                onChange={(e) => {
                  const id = e.target.value;
                  setConvertGroupId(id);
                  const grp = groups.find((g) => g.id === id);
                  if (grp) setConvertFee(String(grp.monthlyPrice));
                }}
              >
                <option value="">بدون مجموعة حالياً</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({formatEGP(g.monthlyPrice)}/شهر)
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="الاشتراك الشهري المبدئي (ج — اختياري لإنشاء فاتورة)">
              <TextInput
                type="number"
                min="0"
                value={convertFee}
                onChange={(e) => setConvertFee(e.target.value)}
                className="tabular-nums"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setConvertModalLead(null)}
              >
                إلغاء
              </Button>
              <Button variant="primary" type="submit" icon={<CheckCircle2 className="w-4 h-4" />}>
                تأكيد التحويل وإضافة الطالب
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// =============================================================================
// 3. PUBLIC ONLINE REGISTRATION FORM (#/register)
// =============================================================================

export const OnlineRegistrationScreen: React.FC = () => {
  const { centerSettings, groups, submitPublicRegistrationLead, navigate } = useEduflow();

  const [studentName, setStudentName] = useState('');
  const [stage, setStage] = useState(() => centerSettings.stages[0] || 'الثالث الثانوي');
  const [phone, setPhone] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [preferredSubject, setPreferredSubject] = useState('اللغة الفرنسية');
  const [preferredGroupId, setPreferredGroupId] = useState('');
  const [notes, setNotes] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [submittedLead, setSubmittedLead] = useState<RegistrationLead | null>(null);

  const stageGroups = useMemo(() => groups.filter((g) => g.stage === stage), [groups, stage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const validation = validatePublicLeadForm({
      studentName,
      stage,
      phone,
      parentName,
      parentPhone,
      preferredSubject,
      preferredGroupId: preferredGroupId || undefined,
      notes,
    });
    if (!validation.ok) {
      setErrorMsg(validation.error || 'تأكد من استكمال كافة البيانات بشكل صحيح');
      return;
    }

    const res = submitPublicRegistrationLead({
      studentName,
      stage,
      phone,
      parentName,
      parentPhone,
      preferredSubject,
      preferredGroupId: preferredGroupId || undefined,
      notes,
    });

    if (!res.ok || !res.lead) {
      setErrorMsg(res.error || 'تعذر حفظ طلب التسجيل');
      return;
    }

    setSubmittedLead(res.lead);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col">
      <header className="bg-white border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <EduflowLogo dark={false} />
            <div className="hidden sm:block text-xs text-[#64748B] border-r border-[#E2E8F0] pr-3">
              بوابة التسجيل الأونلاين — {centerSettings.name}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<Home className="w-4 h-4" />}
              onClick={() => navigate(ScreenId.LANDING)}
            >
              الرئيسية
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(ScreenId.STUDENT_LOGIN)}
            >
              دخول الطالب
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate(ScreenId.LOGIN)}>
              دخول الإدارة
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1] text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              تسجيل طالب جديد أونلاين
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F2A4A]">
              استمارة الالتحاق بـ {centerSettings.name}
            </h1>
            <p className="text-sm text-[#64748B]">
              سجّل بياناتك الآن وسيتواصل معك فريق السنتر لتأكيد المواعيد وحجز المقعد.
            </p>
          </div>

          {submittedLead ? (
            <Card className="p-6 sm:p-8 text-center space-y-4 border-emerald-200 bg-emerald-50/30">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-extrabold text-[#0F2A4A]">
                تم استلام طلب تسجيلك بنجاح!
              </h2>
              <p className="text-sm text-[#475569]">
                احتفظ برقم الطلب التالي للمتابعة مع إدارة {centerSettings.name}:
              </p>
              <div className="inline-block px-5 py-2.5 rounded-xl bg-white border border-emerald-300 text-2xl font-extrabold text-[#0F766E] tabular-nums tracking-wider">
                {submittedLead.ticketCode}
              </div>
              <div className="text-xs text-[#64748B] space-y-1">
                <div>اسم الطالب: {submittedLead.studentName}</div>
                <div>
                  المرحلة: {submittedLead.stage} · المادة: {submittedLead.preferredSubject}
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-3">
                <Button
                  variant="primary"
                  onClick={() => {
                    setSubmittedLead(null);
                    setStudentName('');
                    setPhone('');
                    setParentName('');
                    setParentPhone('');
                    setNotes('');
                  }}
                >
                  تسجيل طالب آخر
                </Button>
                <Button variant="secondary" onClick={() => navigate(ScreenId.LANDING)}>
                  العودة للصفحة الرئيسية
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">
                    {errorMsg}
                  </div>
                )}

                <Field label="اسم الطالب رباعي" required>
                  <TextInput
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="اكتب اسم الطالب الكامل..."
                    required
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="المرحلة الدراسية" required>
                    <SelectInput
                      value={stage}
                      onChange={(e) => {
                        setStage(e.target.value);
                        setPreferredGroupId('');
                      }}
                      required
                    >
                      {centerSettings.stages.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>

                  <Field label="رقم موبايل الطالب" required>
                    <TextInput
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="اسم ولي الأمر" required>
                    <TextInput
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="اسم الأب أو الأم..."
                      required
                    />
                  </Field>

                  <Field label="رقم واتساب ولي الأمر" required>
                    <TextInput
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="المادة المطلوبة" required>
                    <TextInput
                      value={preferredSubject}
                      onChange={(e) => setPreferredSubject(e.target.value)}
                      required
                    />
                  </Field>

                  <Field label="المجموعة المناسبة (اختياري)">
                    <SelectInput
                      value={preferredGroupId}
                      onChange={(e) => setPreferredGroupId(e.target.value)}
                    >
                      <option value="">ترشيح أنسب موعد لي</option>
                      {(stageGroups.length > 0 ? stageGroups : groups).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} — {g.days.join(' و ')} ({g.startTime})
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>

                <Field label="ملاحظات إضافية أو مواعيد مفضلة">
                  <TextInput
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="مثال: يفضل الفترة المسائية بعد الساعة 4 عصراً"
                  />
                </Field>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-full"
                  icon={<UserPlus className="w-4 h-4" />}
                >
                  إرسال طلب التسجيل الآن
                </Button>
              </form>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};
