import crypto from 'node:crypto';

export type TokenType = 'pay' | 'drv' | 'sms';

export interface PayTokenPayload {
  typ: 'pay';
  pid: number;
  did: number;
  slug: string;
  exp: number;
}

export interface DriverTokenPayload {
  typ: 'drv';
  did: number;
  slug: string;
  iat: number;
}

export interface SmsTokenPayload {
  typ: 'sms';
  did: number;
  slug: string;
  iat: number;
}

export type TypedTokenPayload = PayTokenPayload | DriverTokenPayload | SmsTokenPayload;

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function signTypedToken(payload: TypedTokenPayload, secret: string): string {
  const body = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${toBase64Url(sig)}`;
}

export function verifyTypedToken<T extends TokenType>(
  token: string,
  expectedTyp: T,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
):
  | { valid: true; payload: Extract<TypedTokenPayload, { typ: T }> }
  | { valid: false; reason: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'توکن ارسال نشده است.' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'ساختار توکن نامعتبر است.' };
  }
  const [body, sigPart] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest();
  let providedSig: Buffer;
  try {
    providedSig = fromBase64Url(sigPart);
  } catch {
    return { valid: false, reason: 'امضای توکن قابل خواندن نیست.' };
  }

  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
    return { valid: false, reason: 'امضای توکن معتبر نیست.' };
  }

  try {
    const parsed = JSON.parse(fromBase64Url(body).toString('utf8')) as TypedTokenPayload;
    if (parsed.typ !== expectedTyp) {
      return { valid: false, reason: `نوع توکن نامعتبر است (انتظار ${expectedTyp}).` };
    }
    if ('exp' in parsed && typeof parsed.exp === 'number' && parsed.exp < nowSec) {
      return { valid: false, reason: 'مهلت زمانی توکن منقضی شده است.' };
    }
    return {
      valid: true,
      payload: parsed as Extract<TypedTokenPayload, { typ: T }>,
    };
  } catch {
    return { valid: false, reason: 'محتوای توکن معتبر نیست.' };
  }
}

export function signSmsWebhook(rawBody: string, timestampSec: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
}

export function verifySmsWebhookHmac(params: {
  rawBody: string;
  timestampHeader?: string;
  signatureHeader?: string;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): { valid: boolean; timestampSec?: number; reason?: string } {
  const { rawBody, timestampHeader, signatureHeader, secret, toleranceSec = 300 } = params;
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);

  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: 'هدرهای x-timestamp یا x-signature ارسال نشده‌اند.' };
  }

  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, reason: 'مقدار x-timestamp نامعتبر است.' };
  }

  if (Math.abs(nowSec - ts) > toleranceSec) {
    return { valid: false, timestampSec: ts, reason: 'زمان درخواست وب‌هوک منقضی شده است.' };
  }

  const normalizedSig = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedSig)) {
    return { valid: false, timestampSec: ts, reason: 'فرمت x-signature نامعتبر است.' };
  }

  const expectedHex = signSmsWebhook(rawBody, ts, secret);
  const a = Buffer.from(normalizedSig, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, timestampSec: ts, reason: 'عدم تطابق امضای HMAC پیامک.' };
  }

  return { valid: true, timestampSec: ts };
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
