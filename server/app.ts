import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { createStoreFromEnv, type TaxiStore } from './db';
import { createRateLimiter } from './rateLimit';
import { parseDepositSms } from './smsParser';
import {
  constantTimeStringEqual,
  signTypedToken,
  verifySmsWebhookHmac,
  verifyTypedToken,
} from './tokens';
import {
  maskCardDisplay,
  normalizeDigits,
  parseTomanInput,
  validateCardNumber,
} from '../src/utils/iranianValidation';

interface RawBodyRequest extends Request {
  rawBody?: string;
}

const RUNTIME_LINK_SECRET = crypto.randomBytes(32).toString('hex');
const RUNTIME_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

function getLinkSecret(): string {
  return process.env.LINK_SIGNING_SECRET?.trim() || RUNTIME_LINK_SECRET;
}

function getWebhookSecret(): string {
  return process.env.WEBHOOK_HMAC_SECRET?.trim() || RUNTIME_WEBHOOK_SECRET;
}

function resolvePublicOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//i, '')}`;
  }
  const proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    req.protocol ||
    'http';
  const host =
    (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    req.get('host') ||
    'localhost:3000';
  return `${proto}://${host}`;
}

export function createApp(customStore?: TaxiStore) {
  const app = express();
  const store = customStore ?? createStoreFromEnv();

  // Optional one-time bootstrap secret hash when LINK_SIGNING_SECRET env is unset in preview
  let claimedAdminHash: { salt: string; hashHex: string } | null = null;

  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const captureRaw = (req: Request, _res: Response, buf: Buffer) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  };

  app.use(express.json({ limit: '64kb', verify: captureRaw }));
  app.use(express.text({ limit: '64kb', type: 'text/plain', verify: captureRaw }));

  const payCreateLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'pay-create' });
  const payClaimLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'pay-claim' });
  const driverSyncLimiter = createRateLimiter({ windowMs: 60_000, max: 90, name: 'drv-sync' });
  const smsWebhookLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: 'sms-hook' });
  const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'admin' });

  function verifyAdminSecret(providedSecret: string): boolean {
    const envSecret = process.env.LINK_SIGNING_SECRET?.trim();
    if (envSecret) {
      return constantTimeStringEqual(providedSecret, envSecret);
    }
    if (claimedAdminHash) {
      const derived = crypto.scryptSync(providedSecret, claimedAdminHash.salt, 32).toString('hex');
      return constantTimeStringEqual(derived, claimedAdminHash.hashHex);
    }
    return false;
  }

  app.get('/api/health', async (_req: Request, res: Response) => {
    const activeGateway = 'direct';
    const envAdminConfigured = Boolean(process.env.LINK_SIGNING_SECRET?.trim());
    res.json({
      ok: true,
      activeGateway,
      storage: store.mode,
      adminSetupRequired: !envAdminConfigured && !claimedAdminHash,
      envConfigured: {
        databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
        linkSigningSecret: envAdminConfigured,
        webhookHmacSecret: Boolean(process.env.WEBHOOK_HMAC_SECRET?.trim()),
      },
    });
  });

  // One-time bootstrap when LINK_SIGNING_SECRET env is not yet configured in preview
  app.post('/api/admin/bootstrap', adminLimiter, (req: Request, res: Response) => {
    if (process.env.LINK_SIGNING_SECRET?.trim()) {
      return res.status(409).json({
        error: 'کلید LINK_SIGNING_SECRET در متغیرهای محیطی تنظیم شده است.',
      });
    }
    if (claimedAdminHash) {
      return res.status(409).json({
        error: 'رمز ادمین قبلاً تنظیم شده است.',
      });
    }
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
    if (secret.length < 6) {
      return res.status(400).json({ error: 'کلید ادمین باید حداقل ۶ کاراکتر باشد.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hashHex = crypto.scryptSync(secret, salt, 32).toString('hex');
    claimedAdminHash = { salt, hashHex };
    return res.json({ ok: true });
  });

  // Admin: register/update driver and return 3 links (passenger, driver, webhook)
  app.post('/api/admin/driver', adminLimiter, async (req: Request, res: Response) => {
    const adminHeader = req.header('x-admin-secret')?.trim() || '';
    if (!adminHeader || !verifyAdminSecret(adminHeader)) {
      return res.status(401).json({ error: 'هدر x-admin-secret نامعتبر است.' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const cardRaw = typeof body.card_number === 'string' ? body.card_number : typeof body.cardNumber === 'string' ? body.cardNumber : '';
    const cardHolder =
      typeof body.card_holder === 'string'
        ? body.card_holder.trim()
        : typeof body.cardHolder === 'string'
        ? body.cardHolder.trim()
        : '';

    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      return res.status(400).json({ error: 'شناسه slug باید ۲ تا ۴۰ کاراکتر انگلیسی، عدد یا خط تیره باشد.' });
    }
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ error: 'نام راننده باید بین ۲ تا ۶۰ کاراکتر باشد.' });
    }

    const cardDigits = normalizeDigits(cardRaw).replace(/\D/g, '');
    if (!validateCardNumber(cardDigits)) {
      return res.status(400).json({ error: 'شماره کارت ۱۶ رقمی معتبر نیست.' });
    }
    if (cardHolder.length < 2 || cardHolder.length > 80) {
      return res.status(400).json({ error: 'نام صاحب کارت را وارد کنید.' });
    }

    try {
      const driver = await store.upsertDriver({
        slug,
        name,
        cardNumber: cardDigits,
        cardHolder,
      });

      const linkSecret = getLinkSecret();
      const nowSec = Math.floor(Date.now() / 1000);
      const drvToken = signTypedToken(
        { typ: 'drv', did: driver.id, slug: driver.slug, iat: nowSec },
        linkSecret
      );
      const smsToken = signTypedToken(
        { typ: 'sms', did: driver.id, slug: driver.slug, iat: nowSec },
        linkSecret
      );

      const origin = resolvePublicOrigin(req);
      return res.json({
        driver,
        tokens: {
          drv: drvToken,
          sms: smsToken,
        },
        links: {
          passengerUrl: `${origin}/d/${encodeURIComponent(driver.slug)}`,
          driverUrl: `${origin}/driver?k=${encodeURIComponent(drvToken)}`,
          webhookUrl: `${origin}/api/webhook/sms/${encodeURIComponent(driver.slug)}?t=${encodeURIComponent(smsToken)}`,
        },
      });
    } catch (err) {
      console.error('Admin driver upsert error:', err);
      return res.status(500).json({ error: 'خطا در ثبت اطلاعات راننده در دیتابیس.' });
    }
  });

  app.get('/api/admin/drivers', adminLimiter, async (req: Request, res: Response) => {
    const adminHeader = req.header('x-admin-secret')?.trim() || '';
    if (!adminHeader || !verifyAdminSecret(adminHeader)) {
      return res.status(401).json({ error: 'هدر x-admin-secret نامعتبر است.' });
    }
    try {
      const list = await store.listDrivers();
      const origin = resolvePublicOrigin(req);
      const linkSecret = getLinkSecret();
      const nowSec = Math.floor(Date.now() / 1000);
      const items = list.map((d) => {
        const drvToken = signTypedToken({ typ: 'drv', did: d.id, slug: d.slug, iat: nowSec }, linkSecret);
        const smsToken = signTypedToken({ typ: 'sms', did: d.id, slug: d.slug, iat: nowSec }, linkSecret);
        return {
          driver: d,
          links: {
            passengerUrl: `${origin}/d/${encodeURIComponent(d.slug)}`,
            driverUrl: `${origin}/driver?k=${encodeURIComponent(drvToken)}`,
            webhookUrl: `${origin}/api/webhook/sms/${encodeURIComponent(d.slug)}?t=${encodeURIComponent(smsToken)}`,
          },
        };
      });
      return res.json({ drivers: items });
    } catch (err) {
      console.error('Admin drivers list error:', err);
      return res.status(500).json({ error: 'خطا در دریافت فهرست رانندگان.' });
    }
  });

  // Passenger public driver profile for /d/:slug
  app.get('/api/d/:slug', async (req: Request, res: Response) => {
    const slug = (req.params.slug || '').trim().toLowerCase();
    try {
      const driver = await store.getDriverBySlug(slug);
      if (!driver) {
        return res.status(404).json({ error: 'راننده با این شناسه یافت نشد.' });
      }
      return res.json({
        slug: driver.slug,
        name: driver.name,
        cardHolder: driver.cardHolder,
        cardNumberMasked: maskCardDisplay(driver.cardNumber),
      });
    } catch (err) {
      console.error('Driver lookup error:', err);
      return res.status(500).json({ error: 'خطا در دریافت اطلاعات راننده.' });
    }
  });

  // Passenger creates unique amount (baseAmount + 0..89 Toman, expires in 15 minutes)
  app.post('/api/pay/create', payCreateLimiter, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const baseAmount =
      typeof body.baseAmount === 'number'
        ? Math.round(body.baseAmount)
        : parseTomanInput(String(body.baseAmount ?? ''));

    if (!slug) {
      return res.status(400).json({ error: 'شناسه راننده ارسال نشده است.' });
    }
    if (!Number.isFinite(baseAmount) || baseAmount < 1000 || baseAmount > 50_000_000) {
      return res.status(400).json({ error: 'مبلغ پایه کرایه باید بین ۱٬۰۰۰ تا ۵۰٬۰۰۰٬۰۰۰ تومان باشد.' });
    }

    try {
      const driver = await store.getDriverBySlug(slug);
      if (!driver) {
        return res.status(404).json({ error: 'راننده یافت نشد.' });
      }

      const payment = await store.createUniquePayment({
        driverId: driver.id,
        baseAmount,
        ttlMinutes: 15,
      });
      if (!payment) {
        return res.status(409).json({
          error: 'در حال حاضر تمام کدهای یکتای این مبلغ پر هستند. لطفاً چند ثانیه بعد یا با مبلغ دیگری تلاش کنید.',
        });
      }

      const expSec = Math.floor(new Date(payment.expiresAt).getTime() / 1000);
      const token = signTypedToken(
        {
          typ: 'pay',
          pid: payment.id,
          did: driver.id,
          slug: driver.slug,
          exp: expSec,
        },
        getLinkSecret()
      );

      return res.json({
        id: payment.id,
        token,
        payUrl: `/pay/${payment.id}?t=${encodeURIComponent(token)}`,
        baseAmount: payment.baseAmount,
        amount: payment.amount,
        status: payment.status,
        expiresAt: payment.expiresAt,
      });
    } catch (err) {
      console.error('Create payment error:', err);
      return res.status(500).json({ error: 'خطا در ایجاد تراکنش پرداخت.' });
    }
  });

  // Passenger polls /api/pay/:id?t=... every 3 seconds
  app.get('/api/pay/:id', async (req: Request, res: Response) => {
    const paymentId = Number.parseInt(req.params.id, 10);
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: 'شناسه پرداخت نامعتبر است.' });
    }

    const verified = verifyTypedToken(token, 'pay', getLinkSecret());
    if (!verified.valid || verified.payload.pid !== paymentId) {
      return res.status(401).json({ error: verified.valid ? 'توکن متعلق به این پرداخت نیست.' : verified.reason });
    }

    try {
      const item = await store.getPaymentWithDriver(paymentId);
      if (!item || item.driverId !== verified.payload.did) {
        return res.status(404).json({ error: 'پرداخت یافت نشد.' });
      }
      return res.json({
        id: item.id,
        status: item.status,
        baseAmount: item.baseAmount,
        amount: item.amount,
        expiresAt: item.expiresAt,
        claimedAt: item.claimedAt,
        confirmedAt: item.confirmedAt,
        driver: {
          slug: item.driver.slug,
          name: item.driver.name,
          cardNumber: item.driver.cardNumber,
          cardHolder: item.driver.cardHolder,
        },
      });
    } catch (err) {
      console.error('Get payment error:', err);
      return res.status(500).json({ error: 'خطا در دریافت وضعیت پرداخت.' });
    }
  });

  // Passenger clicks "پرداخت کردم" -> pending -> claimed
  app.post('/api/pay/:id/claim', payClaimLimiter, async (req: Request, res: Response) => {
    const paymentId = Number.parseInt(req.params.id, 10);
    const token =
      typeof req.body?.t === 'string'
        ? req.body.t
        : typeof req.query.t === 'string'
        ? req.query.t
        : '';

    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: 'شناسه پرداخت نامعتبر است.' });
    }

    const verified = verifyTypedToken(token, 'pay', getLinkSecret());
    if (!verified.valid || verified.payload.pid !== paymentId) {
      return res.status(401).json({ error: verified.valid ? 'توکن متعلق به این پرداخت نیست.' : verified.reason });
    }

    try {
      const updated = await store.claimPayment(paymentId, verified.payload.did);
      if (!updated) {
        return res.status(404).json({ error: 'پرداخت یافت نشد.' });
      }
      return res.json({
        id: updated.id,
        status: updated.status,
        amount: updated.amount,
        claimedAt: updated.claimedAt,
      });
    } catch (err) {
      console.error('Claim payment error:', err);
      return res.status(500).json({ error: 'خطا در ثبت اعلام پرداخت.' });
    }
  });

  // Driver polls every 3 seconds via POST /api/driver/sync
  app.post('/api/driver/sync', driverSyncLimiter, async (req: Request, res: Response) => {
    const token =
      typeof req.body?.k === 'string'
        ? req.body.k
        : typeof req.query.k === 'string'
        ? req.query.k
        : '';

    const verified = verifyTypedToken(token, 'drv', getLinkSecret());
    if (!verified.valid) {
      return res.status(401).json({ error: verified.reason });
    }

    try {
      const driver = await store.getDriverById(verified.payload.did);
      if (!driver) {
        return res.status(404).json({ error: 'حساب راننده یافت نشد.' });
      }
      const syncData = await store.syncDriver(driver.id);
      return res.json({
        driver: {
          id: driver.id,
          slug: driver.slug,
          name: driver.name,
          cardHolder: driver.cardHolder,
          cardNumberMasked: maskCardDisplay(driver.cardNumber),
        },
        ...syncData,
      });
    } catch (err) {
      console.error('Driver sync error:', err);
      return res.status(500).json({ error: 'خطا در همگام‌سازی پنل راننده.' });
    }
  });

  // Driver manually confirms a claimed payment ("موجودی آمد")
  app.post('/api/driver/confirm', driverSyncLimiter, async (req: Request, res: Response) => {
    const token = typeof req.body?.k === 'string' ? req.body.k : '';
    const paymentId = Number(req.body?.paymentId);

    const verified = verifyTypedToken(token, 'drv', getLinkSecret());
    if (!verified.valid) {
      return res.status(401).json({ error: verified.reason });
    }
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: 'شناسه پرداخت نامعتبر است.' });
    }

    try {
      const confirmed = await store.confirmPayment(paymentId, verified.payload.did);
      if (!confirmed) {
        return res.status(404).json({ error: 'پرداخت قابل تایید یافت نشد (ممکن است منقضی شده باشد).' });
      }
      return res.json({ payment: confirmed });
    } catch (err) {
      console.error('Driver manual confirm error:', err);
      return res.status(500).json({ error: 'خطا در تایید دستی پرداخت.' });
    }
  });

  // Bank SMS webhook: HMAC (x-timestamp & x-signature) OR ?t=<typ=sms token>, anti-replay via hook_log
  app.post('/api/webhook/sms/:slug', smsWebhookLimiter, async (req: RawBodyRequest, res: Response) => {
    const slug = (req.params.slug || '').trim().toLowerCase();
    const rawBody =
      req.rawBody ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    try {
      const driver = await store.getDriverBySlug(slug);
      if (!driver) {
        return res.status(404).json({ error: 'راننده یافت نشد.' });
      }

      const queryToken = typeof req.query.t === 'string' ? req.query.t : '';
      const tsHeader = req.header('x-timestamp');
      const sigHeader = req.header('x-signature');

      let replayKey = '';
      if (tsHeader && sigHeader) {
        const hmacCheck = verifySmsWebhookHmac({
          rawBody,
          timestampHeader: tsHeader,
          signatureHeader: sigHeader,
          secret: getWebhookSecret(),
        });
        if (!hmacCheck.valid) {
          return res.status(401).json({ error: hmacCheck.reason });
        }
        replayKey = `hmac:${driver.id}:${tsHeader}:${sigHeader.toLowerCase()}`;
      } else if (queryToken) {
        const tokCheck = verifyTypedToken(queryToken, 'sms', getLinkSecret());
        if (!tokCheck.valid || tokCheck.payload.did !== driver.id || tokCheck.payload.slug !== driver.slug) {
          return res.status(401).json({
            error: tokCheck.valid ? 'توکن وب‌هوک متعلق به این راننده نیست.' : tokCheck.reason,
          });
        }
        const msgIdHeader = req.header('x-message-id')?.trim();
        const bodyMsgId =
          typeof req.body === 'object' && req.body !== null && typeof req.body.messageId === 'string'
            ? req.body.messageId.trim()
            : '';
        const explicitId = msgIdHeader || bodyMsgId;
        const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
        replayKey = explicitId
          ? `sms:${driver.id}:id:${explicitId}`
          : `sms:${driver.id}:hash:${bodyHash}`;
      } else {
        return res.status(401).json({
          error: 'احراز هویت وب‌هوک انجام نشد (x-timestamp و x-signature یا توکن ?t= الزامی است).',
        });
      }

      const smsText =
        typeof req.body === 'string'
          ? req.body
          : typeof req.body?.text === 'string'
          ? req.body.text
          : typeof req.body?.message === 'string'
          ? req.body.message
          : typeof req.body?.sms === 'string'
          ? req.body.sms
          : rawBody;

      const parsed = parseDepositSms(smsText);
      const outcome = await store.processSmsWebhook({
        driverId: driver.id,
        replayKey,
        rawBody: smsText.slice(0, 2000),
        amountCandidates: parsed.isDeposit ? parsed.amountsTomanCandidates : [],
      });

      if (outcome.duplicate) {
        return res.status(409).json({
          ok: false,
          error: 'پیامک تکراری (Replay) شناسایی و رد شد.',
        });
      }

      return res.json({
        ok: true,
        isDeposit: parsed.isDeposit,
        parsedAmountToman: parsed.primaryAmountToman,
        matched: Boolean(outcome.matchedPayment),
        paymentId: outcome.matchedPayment?.id ?? null,
        matchedAmount: outcome.matchedPayment?.amount ?? null,
      });
    } catch (err) {
      console.error('SMS webhook error:', err);
      return res.status(500).json({ error: 'خطا در پردازش وب‌هوک پیامک.' });
    }
  });

  return { app, store };
}
