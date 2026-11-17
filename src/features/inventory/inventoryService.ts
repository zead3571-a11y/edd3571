import { InventoryItem, InventoryTransaction } from '../../types/eduflow';

export function findLowStockItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.stockQty <= item.minStockAlert);
}

export function computeInventorySummary(
  items: InventoryItem[],
  transactions: InventoryTransaction[]
): {
  totalUnits: number;
  totalStockValue: number;
  lowStockCount: number;
  salesRevenue: number;
} {
  const totalUnits = items.reduce((sum, i) => sum + i.stockQty, 0);
  const totalStockValue = items.reduce((sum, i) => sum + i.stockQty * i.unitPrice, 0);
  const lowStockCount = findLowStockItems(items).length;
  const salesRevenue = transactions
    .filter((t) => t.type === 'sale')
    .reduce((sum, t) => sum + t.totalAmount, 0);
  return { totalUnits, totalStockValue, lowStockCount, salesRevenue };
}

export function validateInventoryTransaction(params: {
  item: InventoryItem;
  type: InventoryTransaction['type'];
  qty: number;
}): { ok: boolean; error?: string; nextStockQty: number } {
  const qty = Math.floor(Number(params.qty));
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      ok: false,
      error: 'يجب أن تكون الكمية رقماً صحيحاً أكبر من صفر.',
      nextStockQty: params.item.stockQty,
    };
  }

  if (params.type === 'restock') {
    return {
      ok: true,
      nextStockQty: params.item.stockQty + qty,
    };
  }

  if (params.type === 'sale' || params.type === 'issue') {
    if (qty > params.item.stockQty) {
      return {
        ok: false,
        error: `الكمية المطلوبة (${qty}) تتجاوز المتاح في المخزون (${params.item.stockQty}).`,
        nextStockQty: params.item.stockQty,
      };
    }
    return {
      ok: true,
      nextStockQty: params.item.stockQty - qty,
    };
  }

  // adjustment keeps qty as delta >= 0 allowed to clamp at 0
  return {
    ok: true,
    nextStockQty: Math.max(0, params.item.stockQty - qty),
  };
}
