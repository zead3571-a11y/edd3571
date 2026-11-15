import { signHmacSha256Hex, verifyHmacSha256Hex } from './hmacCrypto';

export type WhatsAppMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  variables: Record<string, string>;
}

export interface SendTextInput {
  to: string;
  body: string;
  lastInboundAt?: string;
  nowMs?: number;
}

export interface MessagingSendResult {
  ok: boolean;
  messageId?: string;
  status?: WhatsAppMessageStatus;
  errorCode?: string;
  errorAr?: string;
  timestamp: string;
}

export interface ParsedWhatsAppStatusWebhook {
  eventId: string;
  eventType: 'whatsapp.status';
  timestamp: string;
  messageId: string;
  recipientPhone: string;
  status: WhatsAppMessageStatus;
  errorCode?: string;
  errorAr?: string;
}

export interface MessagingProvider {
  readonly providerName: string;
  sendTemplate(input: SendTemplateInput): Promise<MessagingSendResult>;
  sendText(input: SendTextInput): Promise<MessagingSendResult>;
  parseStatusWebhook(payload: unknown): ParsedWhatsAppStatusWebhook | null;
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Ephemeral in-memory mock app secret used ONLY inside MockWhatsAppCloudProvider.
 * NEVER stored in browser localStorage or CenterSettings.
 */
const MOCK_WHATSAPP_EPHEMERAL_APP_SECRET = 'eduflow-dev-mock-wa-app-secret-do-not-persist';

export const WHATSAPP_ERROR_EXPLANATIONS_AR: Record<string, string> = {
  '131026': 'رقم الهاتف غير مسجل على واتساب أو تعذر استلام الرسالة (Error 131026).',
  '131047': 'انتهت نافذة خدمة العملاء (24 ساعة)؛ يجب استخدام قالب معتمد (Error 131047).',
  '131051': 'نوع الرسالة غير مدعوم في واجهة واتساب السحابية (Error 131051).',
  '132000': 'عدد متغيرات القالب لا يطابق القالب المعتمد في Meta (Error 132000).',
};

export function explainWhatsAppErrorAr(code?: string): string {
  if (!code) return 'فشل غير محدد من مزود واتساب.';
  return WHATSAPP_ERROR_EXPLANATIONS_AR[code] || `رمز خطأ واتساب (${code}): تعذر تسليم الرسالة.`;
}

export function isWithin24HourCustomerWindow(lastInboundAt?: string, nowMs = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const parsed = Date.parse(lastInboundAt);
  if (!Number.isFinite(parsed)) return false;
  const diff = nowMs - parsed;
  return diff >= 0 && diff <= TWENTY_FOUR_HOURS_MS;
}

export class MockWhatsAppCloudProvider implements MessagingProvider {
  public readonly providerName = 'MockWhatsAppCloudProvider';

  public async sendTemplate(input: SendTemplateInput): Promise<MessagingSendResult> {
    const nowIso = new Date().toISOString();
    if (!input.to.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: '131026',
        errorAr: explainWhatsAppErrorAr('131026'),
        timestamp: nowIso,
      };
    }
    if (!input.templateName.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: '132000',
        errorAr: explainWhatsAppErrorAr('132000'),
        timestamp: nowIso,
      };
    }

    return {
      ok: true,
      messageId: `wamid.mock.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`,
      status: 'sent',
      timestamp: nowIso,
    };
  }

  public async sendText(input: SendTextInput): Promise<MessagingSendResult> {
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (!isWithin24HourCustomerWindow(input.lastInboundAt, nowMs)) {
      return {
        ok: false,
        status: 'failed',
        errorCode: '131047',
        errorAr: explainWhatsAppErrorAr('131047'),
        timestamp: nowIso,
      };
    }
    if (!input.body.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: '131051',
        errorAr: explainWhatsAppErrorAr('131051'),
        timestamp: nowIso,
      };
    }

    return {
      ok: true,
      messageId: `wamid.mock.${nowMs}.${Math.random().toString(36).slice(2, 7)}`,
      status: 'sent',
      timestamp: nowIso,
    };
  }

  public parseStatusWebhook(payload: unknown): ParsedWhatsAppStatusWebhook | null {
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;
    const status = obj.status as WhatsAppMessageStatus | undefined;
    if (!status || !['sent', 'delivered', 'read', 'failed'].includes(status)) {
      return null;
    }
    const messageId = typeof obj.messageId === 'string' ? obj.messageId : '';
    const recipientPhone = typeof obj.recipientPhone === 'string' ? obj.recipientPhone : '';
    const eventId = typeof obj.eventId === 'string' ? obj.eventId : '';
    const timestamp =
      typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString();
    if (!messageId || !eventId) return null;

    const errorCode = typeof obj.errorCode === 'string' ? obj.errorCode : undefined;
    const errorAr =
      status === 'failed'
        ? typeof obj.errorAr === 'string' && obj.errorAr
          ? obj.errorAr
          : explainWhatsAppErrorAr(errorCode || '131026')
        : undefined;

    return {
      eventId,
      eventType: 'whatsapp.status',
      timestamp,
      messageId,
      recipientPhone,
      status,
      errorCode,
      errorAr,
    };
  }

  public async buildSignedStatusWebhook(params: {
    messageId: string;
    recipientPhone: string;
    status: WhatsAppMessageStatus;
    errorCode?: string;
    eventId?: string;
    timestamp?: string;
  }): Promise<{ rawBody: string; signature: string; payload: ParsedWhatsAppStatusWebhook }> {
    const payload: ParsedWhatsAppStatusWebhook = {
      eventId: params.eventId || `evt-wa-${params.messageId}-${params.status}-${Date.now()}`,
      eventType: 'whatsapp.status',
      timestamp: params.timestamp || new Date().toISOString(),
      messageId: params.messageId,
      recipientPhone: params.recipientPhone,
      status: params.status,
      errorCode: params.status === 'failed' ? params.errorCode || '131026' : undefined,
      errorAr:
        params.status === 'failed'
          ? explainWhatsAppErrorAr(params.errorCode || '131026')
          : undefined,
    };
    const rawBody = JSON.stringify(payload);
    const signature = await signHmacSha256Hex(rawBody, MOCK_WHATSAPP_EPHEMERAL_APP_SECRET);
    return { rawBody, signature, payload };
  }

  public async verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
    return verifyHmacSha256Hex(rawBody, signature, MOCK_WHATSAPP_EPHEMERAL_APP_SECRET);
  }
}

export const defaultMockWhatsAppProvider = new MockWhatsAppCloudProvider();
