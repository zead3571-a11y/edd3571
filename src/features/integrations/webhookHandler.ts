import { EduflowRepositories, runWithSystemActor } from '../../data/repositories';
import { UserRole, WebhookEventRecord, WebhookProviderKey } from '../../types/eduflow';

export interface IncomingWebhookRequest {
  centerId: string;
  provider: WebhookProviderKey;
  rawBody: string;
  signature: string;
  nowMs?: number;
  replayToleranceMs?: number;
}

export interface WebhookProcessResult {
  ok: boolean;
  idempotent: boolean;
  status: WebhookEventRecord['status'];
  record?: WebhookEventRecord;
  parsedPayload?: Record<string, unknown>;
  messageAr: string;
}

const DEFAULT_REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

function extractSummary(
  provider: WebhookProviderKey,
  parsed: Record<string, unknown>
): { eventId: string; eventType: string; timestamp: string; summary: string } {
  const eventId =
    typeof parsed.eventId === 'string' && parsed.eventId.trim()
      ? parsed.eventId.trim()
      : '';
  const eventType =
    typeof parsed.eventType === 'string' && parsed.eventType.trim()
      ? parsed.eventType.trim()
      : `${provider}.event`;
  const timestamp =
    typeof parsed.timestamp === 'string' && parsed.timestamp.trim()
      ? parsed.timestamp.trim()
      : '';

  if (provider === 'paymob') {
    const status = String(parsed.status || 'unknown');
    const orderId = String(parsed.orderId || parsed.txId || '');
    const reason = typeof parsed.reasonAr === 'string' ? parsed.reasonAr : '';
    return {
      eventId,
      eventType,
      timestamp,
      summary: `Paymob (${orderId}): ${status}${reason ? ` — ${reason}` : ''}`,
    };
  }

  const waStatus = String(parsed.status || 'unknown');
  const phone = String(parsed.recipientPhone || '');
  const err = typeof parsed.errorAr === 'string' ? parsed.errorAr : '';
  return {
    eventId,
    eventType,
    timestamp,
    summary: `WhatsApp (${phone || parsed.messageId || ''}): ${waStatus}${err ? ` — ${err}` : ''}`,
  };
}

/**
 * Verifies HMAC signature, protects against replay attacks, enforces idempotency by eventId,
 * persists into webhookEvents repository, and writes an activityLog audit record.
 */
export async function processIncomingWebhook(
  repos: EduflowRepositories,
  verifySignature: (rawBody: string, signature: string) => Promise<boolean>,
  req: IncomingWebhookRequest
): Promise<WebhookProcessResult> {
  const nowMs = req.nowMs ?? Date.now();
  const receivedAt = new Date(nowMs).toISOString();
  const toleranceMs = req.replayToleranceMs ?? DEFAULT_REPLAY_TOLERANCE_MS;

  let parsed: Record<string, unknown>;
  try {
    const rawParsed = JSON.parse(req.rawBody);
    if (!rawParsed || typeof rawParsed !== 'object') {
      throw new Error('Invalid JSON object');
    }
    parsed = rawParsed as Record<string, unknown>;
  } catch {
    return runWithSystemActor(() => {
      const record = repos.webhookEvents.create({
        centerId: req.centerId,
        eventId: `malformed-${nowMs}`,
        provider: req.provider,
        eventType: 'malformed',
        signatureValid: false,
        status: 'failed',
        timestamp: receivedAt,
        receivedAt,
        summary: 'تم استلام حمولة Webhook غير صالحة (JSON تالف)',
        errorMessage: 'JSON parse error',
      });
      repos.activityLog.create({
        centerId: req.centerId,
        actorId: 'system',
        actorName: 'بوابة Webhooks',
        actorRole: UserRole.OWNER,
        action: 'webhook.failed',
        resource: 'webhookEvents',
        resourceId: record.id,
        summary: record.summary,
        timestamp: receivedAt,
      });
      return {
        ok: false,
        idempotent: false,
        status: 'failed',
        record,
        messageAr: record.summary,
      };
    });
  }

  const meta = extractSummary(req.provider, parsed);
  const effectiveEventId = meta.eventId || `missing-id-${nowMs}`;

  // 1) Verify HMAC Signature
  const sigValid = await verifySignature(req.rawBody, req.signature);
  if (!sigValid) {
    return runWithSystemActor(() => {
      const record = repos.webhookEvents.create({
        centerId: req.centerId,
        eventId: effectiveEventId,
        provider: req.provider,
        eventType: meta.eventType,
        signatureValid: false,
        status: 'rejected_signature',
        timestamp: meta.timestamp || receivedAt,
        receivedAt,
        summary: `رفض Webhook بسبب توقيع HMAC غير صالح (${meta.eventType})`,
        payloadPreview: req.rawBody.slice(0, 200),
        errorMessage: 'Invalid HMAC-SHA256 signature',
      });
      repos.activityLog.create({
        centerId: req.centerId,
        actorId: 'system',
        actorName: 'بوابة Webhooks',
        actorRole: UserRole.OWNER,
        action: 'webhook.rejected_signature',
        resource: 'webhookEvents',
        resourceId: record.id,
        summary: record.summary,
        timestamp: receivedAt,
      });
      return {
        ok: false,
        idempotent: false,
        status: 'rejected_signature',
        record,
        messageAr: 'تم رفض الـ Webhook: توقيع الأمان (HMAC) غير مطابق.',
      };
    });
  }

  // 2) Replay Protection (timestamp freshness check)
  const parsedTs = Date.parse(meta.timestamp);
  if (!Number.isFinite(parsedTs) || Math.abs(nowMs - parsedTs) > toleranceMs) {
    return runWithSystemActor(() => {
      const record = repos.webhookEvents.create({
        centerId: req.centerId,
        eventId: effectiveEventId,
        provider: req.provider,
        eventType: meta.eventType,
        signatureValid: true,
        status: 'rejected_replay',
        timestamp: meta.timestamp || receivedAt,
        receivedAt,
        summary: `رفض Webhook خارج نافذة الأمان الزمنية (Replay Protection): ${effectiveEventId}`,
        payloadPreview: req.rawBody.slice(0, 200),
        errorMessage: 'Timestamp outside replay window',
      });
      repos.activityLog.create({
        centerId: req.centerId,
        actorId: 'system',
        actorName: 'بوابة Webhooks',
        actorRole: UserRole.OWNER,
        action: 'webhook.rejected_replay',
        resource: 'webhookEvents',
        resourceId: record.id,
        summary: record.summary,
        timestamp: receivedAt,
      });
      return {
        ok: false,
        idempotent: false,
        status: 'rejected_replay',
        record,
        messageAr: 'تم رفض الـ Webhook: الطابع الزمني منتهي الصلاحية (حماية ضد Replay).',
      };
    });
  }

  // 3) Idempotency check by eventId + provider + centerId
  const existingProcessed = runWithSystemActor(() =>
    repos.webhookEvents.list({
      centerId: req.centerId,
      where: (ev) =>
        ev.provider === req.provider &&
        ev.eventId === effectiveEventId &&
        ev.status === 'processed',
    })
  );

  if (existingProcessed.length > 0) {
    return runWithSystemActor(() => {
      const auditDuplicate = repos.webhookEvents.create({
        centerId: req.centerId,
        eventId: effectiveEventId,
        provider: req.provider,
        eventType: meta.eventType,
        signatureValid: true,
        status: 'duplicate',
        timestamp: meta.timestamp,
        receivedAt,
        summary: `حدث مكرر تم تجاهله بأمان (Idempotent): ${effectiveEventId}`,
        payloadPreview: req.rawBody.slice(0, 200),
      });
      return {
        ok: true,
        idempotent: true,
        status: 'duplicate',
        record: auditDuplicate,
        parsedPayload: parsed,
        messageAr: 'تم استلام حدث مكرر — تم تجاهله بأمان دون إعادة التنفيذ (Idempotent).',
      };
    });
  }

  // 4) Persist & record activity log
  return runWithSystemActor(() => {
    const processedAt = new Date(nowMs).toISOString();
    const record = repos.webhookEvents.create({
      centerId: req.centerId,
      eventId: effectiveEventId,
      provider: req.provider,
      eventType: meta.eventType,
      signatureValid: true,
      status: 'processed',
      timestamp: meta.timestamp,
      receivedAt,
      processedAt,
      summary: meta.summary,
      payloadPreview: req.rawBody.slice(0, 200),
    });

    repos.activityLog.create({
      centerId: req.centerId,
      actorId: 'system',
      actorName: 'بوابة Webhooks',
      actorRole: UserRole.OWNER,
      action: 'webhook.processed',
      resource: 'webhookEvents',
      resourceId: record.id,
      summary: `معالجة Webhook (${req.provider}): ${meta.summary}`,
      after: { eventId: record.eventId, eventType: record.eventType, status: record.status },
      timestamp: processedAt,
    });

    return {
      ok: true,
      idempotent: false,
      status: 'processed',
      record,
      parsedPayload: parsed,
      messageAr: `تمت معالجة الحدث (${record.eventType}) بنجاح وتوثيقه في السجل.`,
    };
  });
}
