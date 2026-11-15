import { signHmacSha256Hex, verifyHmacSha256Hex } from './hmacCrypto';

export type GatewayPaymentMethod = 'card' | 'wallet' | 'fawry';
export type GatewayTransactionStatus = 'pending' | 'success' | 'failure' | 'cancelled' | 'refunded';
export type MockCheckoutOutcome = 'success' | 'failure' | 'pending' | 'cancel';

export interface CreateCheckoutInput {
  centerId: string;
  invoiceIds: string[];
  amount: number;
  method: GatewayPaymentMethod;
  returnUrl: string;
}

export interface CheckoutSessionResult {
  txId: string;
  orderId: string;
  checkoutUrl: string;
  amount: number;
  method: GatewayPaymentMethod;
  status: GatewayTransactionStatus;
  createdAt: string;
}

export interface GatewayTransaction {
  txId: string;
  orderId: string;
  centerId: string;
  invoiceIds: string[];
  amount: number;
  refundedAmount: number;
  method: GatewayPaymentMethod;
  status: GatewayTransactionStatus;
  createdAt: string;
  updatedAt: string;
  failureReasonAr?: string;
}

export interface RefundResult {
  ok: boolean;
  refundId?: string;
  txId: string;
  refundedAmount: number;
  errorAr?: string;
}

export interface PaymobWebhookPayload {
  eventId: string;
  eventType: 'payment.succeeded' | 'payment.failed' | 'payment.pending' | 'payment.cancelled' | 'payment.refunded';
  timestamp: string;
  centerId: string;
  txId: string;
  orderId: string;
  invoiceIds: string[];
  amountCents: number;
  method: GatewayPaymentMethod;
  status: GatewayTransactionStatus;
  reasonAr?: string;
}

export interface PaymentProvider {
  readonly providerName: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
  getTransaction(txId: string): Promise<GatewayTransaction | null>;
  refund(txId: string, amount: number, reason: string): Promise<RefundResult>;
}

/**
 * Ephemeral in-memory mock HMAC signing key used ONLY inside MockPaymobProvider.
 * NEVER stored in localStorage, CenterSettings, or exported backups.
 */
const MOCK_PAYMOB_EPHEMERAL_HMAC_SECRET = 'eduflow-dev-mock-paymob-hmac-secret-do-not-persist';

export class MockPaymobProvider implements PaymentProvider {
  public readonly providerName = 'MockPaymobProvider';
  private transactions = new Map<string, GatewayTransaction>();

  public async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
    if (!input.invoiceIds.length) {
      throw new Error('يجب تحديد فاتورة واحدة على الأقل لإنشاء جلسة الدفع.');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('مبلغ الدفع يجب أن يكون أكبر من صفر.');
    }

    const now = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const txId = `pmob-tx-${Date.now()}-${rand}`;
    const orderId = `ORD-${rand}`;

    const tx: GatewayTransaction = {
      txId,
      orderId,
      centerId: input.centerId,
      invoiceIds: [...input.invoiceIds],
      amount: Number(input.amount.toFixed(2)),
      refundedAmount: 0,
      method: input.method,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.set(txId, tx);

    const separator = input.returnUrl.includes('?') ? '&' : '?';
    const checkoutUrl = `${input.returnUrl}${separator}mockCheckout=${encodeURIComponent(txId)}&order=${encodeURIComponent(orderId)}`;

    return {
      txId,
      orderId,
      checkoutUrl,
      amount: tx.amount,
      method: input.method,
      status: tx.status,
      createdAt: now,
    };
  }

  public async buildSignedOutcomeWebhook(
    txId: string,
    outcome: MockCheckoutOutcome,
    overrides?: { timestamp?: string; eventId?: string }
  ): Promise<{ rawBody: string; signature: string; payload: PaymobWebhookPayload }> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error('معاملة الدفع غير موجودة في المحاكي.');
    }

    const mappedStatus: GatewayTransactionStatus =
      outcome === 'success'
        ? 'success'
        : outcome === 'failure'
        ? 'failure'
        : outcome === 'cancel'
        ? 'cancelled'
        : 'pending';

    const eventType: PaymobWebhookPayload['eventType'] =
      outcome === 'success'
        ? 'payment.succeeded'
        : outcome === 'failure'
        ? 'payment.failed'
        : outcome === 'cancel'
        ? 'payment.cancelled'
        : 'payment.pending';

    const reasonAr =
      outcome === 'failure'
        ? 'تم رفض البطاقة من البنك المُصدر (رصيد غير كافٍ أو انتهاء المهلة)'
        : outcome === 'cancel'
        ? 'قام المستخدم بإلغاء عملية الدفع قبل الإتمام'
        : outcome === 'pending'
        ? 'بانتظار تأكيد سداد كود فوري / المحفظة الإلكترونية'
        : 'تم تأكيد التحصيل بنجاح عبر بوابة الدفع التجريبية';

    tx.status = mappedStatus;
    tx.updatedAt = new Date().toISOString();
    if (outcome === 'failure' || outcome === 'cancel') {
      tx.failureReasonAr = reasonAr;
    }

    const payload: PaymobWebhookPayload = {
      eventId: overrides?.eventId || `evt-pmob-${tx.orderId}-${outcome}-${Date.now()}`,
      eventType,
      timestamp: overrides?.timestamp || new Date().toISOString(),
      centerId: tx.centerId,
      txId: tx.txId,
      orderId: tx.orderId,
      invoiceIds: [...tx.invoiceIds],
      amountCents: Math.round(tx.amount * 100),
      method: tx.method,
      status: mappedStatus,
      reasonAr,
    };

    const rawBody = JSON.stringify(payload);
    const signature = await signHmacSha256Hex(rawBody, MOCK_PAYMOB_EPHEMERAL_HMAC_SECRET);
    return { rawBody, signature, payload };
  }

  /**
   * Simulates the async hosted checkout redirect -> webhook callback with a configurable delay.
   */
  public simulateCheckoutOutcome(
    txId: string,
    outcome: MockCheckoutOutcome,
    onWebhook: (signed: { rawBody: string; signature: string; payload: PaymobWebhookPayload }) => Promise<void> | void,
    delayMs = 250
  ): Promise<{ rawBody: string; signature: string; payload: PaymobWebhookPayload }> {
    return new Promise((resolve, reject) => {
      const waitMs = Math.max(0, delayMs);
      setTimeout(() => {
        this.buildSignedOutcomeWebhook(txId, outcome)
          .then(async (signed) => {
            await onWebhook(signed);
            resolve(signed);
          })
          .catch(reject);
      }, waitMs);
    });
  }

  public async verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
    return verifyHmacSha256Hex(rawBody, signature, MOCK_PAYMOB_EPHEMERAL_HMAC_SECRET);
  }

  public async getTransaction(txId: string): Promise<GatewayTransaction | null> {
    const found = this.transactions.get(txId);
    return found ? { ...found, invoiceIds: [...found.invoiceIds] } : null;
  }

  public async refund(txId: string, amount: number, reason: string): Promise<RefundResult> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      return { ok: false, txId, refundedAmount: 0, errorAr: 'المعاملة غير موجودة.' };
    }
    if (tx.status !== 'success' && tx.status !== 'refunded') {
      return {
        ok: false,
        txId,
        refundedAmount: 0,
        errorAr: 'لا يمكن استرداد معاملة غير مكتملة الدفع.',
      };
    }
    const available = Number((tx.amount - tx.refundedAmount).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0 || amount > available) {
      return {
        ok: false,
        txId,
        refundedAmount: tx.refundedAmount,
        errorAr: `مبلغ الاسترداد غير صالح (المتاح للاسترداد: ${available} ج).`,
      };
    }
    if (!reason.trim()) {
      return {
        ok: false,
        txId,
        refundedAmount: tx.refundedAmount,
        errorAr: 'يرجى إدخال سبب الاسترداد.',
      };
    }

    tx.refundedAmount = Number((tx.refundedAmount + amount).toFixed(2));
    if (tx.refundedAmount >= tx.amount) {
      tx.status = 'refunded';
    }
    tx.updatedAt = new Date().toISOString();

    return {
      ok: true,
      refundId: `rf-${Date.now()}`,
      txId,
      refundedAmount: tx.refundedAmount,
    };
  }
}

export const defaultMockPaymobProvider = new MockPaymobProvider();
