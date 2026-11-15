/**
 * Ephemeral HMAC-SHA256 helpers using Web Crypto API.
 * PROTOTYPE-ONLY / MOCK PROVIDER HARNESS:
 * In production, HMAC secrets live ONLY in server-side environment variables
 * (PAYMOB_HMAC_SECRET, WHATSAPP_APP_SECRET) and webhooks are verified inside
 * server/edge functions — NEVER in browser storage or client state.
 */

function getSubtleCrypto(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('واجهة Web Crypto API غير متاحة في هذه البيئة.');
  }
  return c.subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signHmacSha256Hex(rawBody: string, secret: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', key, encoder.encode(rawBody));
  return bytesToHex(new Uint8Array(sig));
}

export async function verifyHmacSha256Hex(
  rawBody: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!rawBody || !signatureHex || !secret) return false;
  const normalizedSig = signatureHex.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedSig)) return false;
  const expected = await signHmacSha256Hex(rawBody, secret);
  return constantTimeEqual(expected, normalizedSig);
}
