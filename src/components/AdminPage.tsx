import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, KeyRound, PlusCircle, ShieldCheck } from 'lucide-react';
import { formatCardDisplay, validateCardNumber } from '../utils/iranianValidation';
import type { AdminDriverCreatedResponse, HealthStatus } from '../types/taxi';
import { QrCodeView } from './QrCodeView';

interface AdminPageProps {
  health: HealthStatus | null;
  onHealthRefresh: () => void;
  onNavigate: (to: string) => void;
}

export function AdminPage({ health, onHealthRefresh, onNavigate }: AdminPageProps) {
  const [adminSecret, setAdminSecret] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);

  const [slug, setSlug] = useState('ali');
  const [name, setName] = useState('علی رضایی');
  const [cardNumber, setCardNumber] = useState('6037991100001233');
  const [cardHolder, setCardHolder] = useState('علی رضایی');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AdminDriverCreatedResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>('');

  const cardValid = useMemo(() => validateCardNumber(cardNumber), [cardNumber]);

  useEffect(() => {
    setError('');
  }, [adminSecret]);

  async function handleBootstrap(e: FormEvent) {
    e.preventDefault();
    setBootstrapError('');
    setBootstrapping(true);
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: bootstrapSecret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBootstrapError(data.error || 'خطا در تنظیم رمز اولیه ادمین');
        return;
      }
      setAdminSecret(bootstrapSecret);
      onHealthRefresh();
    } catch {
      setBootstrapError('ارتباط با سرور برقرار نشد.');
    } finally {
      setBootstrapping(false);
    }
  }

  async function handleCreateDriver(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!adminSecret.trim()) {
      setError('کلید ادمین (x-admin-secret / LINK_SIGNING_SECRET) را وارد کنید.');
      return;
    }
    if (!cardValid) {
      setError('شماره کارت ۱۶ رقمی معتبر نیست.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret.trim(),
        },
        body: JSON.stringify({
          slug,
          name,
          card_number: cardNumber,
          card_holder: cardHolder,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ثبت راننده ناموفق بود.');
        return;
      }
      setResult(data);
    } catch {
      setError('خطا در ارتباط با سرور مدیریت.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy(key: string, text: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1800);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-6 space-y-5">
        {health?.adminSetupRequired && (
          <form
            onSubmit={handleBootstrap}
            className="rounded-3xl border border-amber-300 bg-amber-50 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
              <KeyRound className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <span>تنظیم اولیه کلید ادمین (پیش‌نمایش بدون متغیر محیطی)</span>
            </div>
            <p className="text-xs leading-5 text-amber-900">
              متغیر محیطی <span className="font-mono">LINK_SIGNING_SECRET</span> هنوز تنظیم نشده است. برای تست در پیش‌نمایش یک کلید حداقل ۶ کاراکتری ثبت کنید (در تولید از Env خوانده می‌شود).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                placeholder="حداقل ۶ کاراکتر..."
                className="flex-1 min-h-[42px] rounded-xl border border-amber-300 bg-white px-3 text-sm font-mono"
              />
              <button
                type="submit"
                disabled={bootstrapping}
                className="min-h-[42px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer shrink-0"
              >
                {bootstrapping ? 'در حال ثبت...' : 'تنظیم کلید ادمین'}
              </button>
            </div>
            {bootstrapError && <p className="text-xs text-rose-700 font-medium">{bootstrapError}</p>}
          </form>
        )}

        <form
          onSubmit={handleCreateDriver}
          className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-slate-900">ثبت راننده و دریافت ۳ لینک</h1>
            <span className="text-xs text-slate-500">
              دیتابیس: {health?.storage === 'neon' ? 'Neon PostgreSQL' : 'حافظه پیش‌نمایش'}
            </span>
          </div>

          <div>
            <label htmlFor="admin-secret-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              کلید ادمین (هدر <span className="font-mono">x-admin-secret</span>)
            </label>
            <input
              id="admin-secret-input"
              type="password"
              required
              dir="ltr"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="LINK_SIGNING_SECRET"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adm-slug" className="block text-xs font-semibold text-slate-700 mb-1.5">
                شناسه یکتای مسیر (slug)
              </label>
              <input
                id="adm-slug"
                type="text"
                required
                dir="ltr"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ali"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label htmlFor="adm-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                نام راننده (نمایشی)
              </label>
              <input
                id="adm-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adm-card" className="block text-xs font-semibold text-slate-700 mb-1.5">
              شماره کارت ۱۶ رقمی راننده
            </label>
            <input
              id="adm-card"
              type="text"
              inputMode="numeric"
              required
              dir="ltr"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <p className={`mt-1 text-[11px] ${cardValid ? 'text-emerald-700' : 'text-rose-600'}`}>
              {cardValid ? (
                <>
                  <span>کارت معتبر: </span>
                  <span dir="ltr" className="inline-block font-mono tabular-nums">
                    {formatCardDisplay(cardNumber)}
                  </span>
                </>
              ) : (
                'شماره کارت ۱۶ رقمی نامعتبر است'
              )}
            </p>
          </div>

          <div>
            <label htmlFor="adm-holder" className="block text-xs font-semibold text-slate-700 mb-1.5">
              نام صاحب کارت
            </label>
            <input
              id="adm-holder"
              type="text"
              required
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            <PlusCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span>{submitting ? 'در حال ثبت در دیتابیس...' : 'ثبت راننده و تولید ۳ لینک'}</span>
          </button>
        </form>
      </div>

      {/* Output: 3 Links + QR Codes */}
      <aside className="lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">خروجی لینک‌ها و کد QR</h2>
        </div>

        {!result ? (
          <p className="text-xs leading-6 text-slate-500">
            پس از ثبت راننده، لینک مسافر (<span className="font-mono">/d/:slug</span>)، لینک پنل صوتی راننده (<span className="font-mono">/driver?k=...</span>) و لینک وب‌هوک پیامک بانک به همراه کد QR نمایش داده می‌شوند.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900">QR مسافر (/d/{result.driver.slug})</div>
                <QrCodeView value={result.links.passengerUrl} size={150} label="QR لینک مسافر" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900">QR پنل راننده</div>
                <QrCodeView value={result.links.driverUrl} size={150} label="QR لینک راننده" />
              </div>
            </div>

            {[
              {
                key: 'passenger',
                label: '۱. لینک مسافر (نصب داخل تاکسی)',
                url: result.links.passengerUrl,
                navPath: `/d/${encodeURIComponent(result.driver.slug)}`,
              },
              {
                key: 'driver',
                label: '۲. لینک اختصاصی راننده (typ=drv)',
                url: result.links.driverUrl,
                navPath: `/driver?k=${encodeURIComponent(result.tokens.drv)}`,
              },
              {
                key: 'webhook',
                label: '۳. لینک وب‌هوک پیامک بانک (typ=sms)',
                url: result.links.webhookUrl,
                navPath: null,
              },
            ].map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.key, item.url)}
                      className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      {copiedKey === item.key ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedKey === item.key ? 'کپی شد' : 'کپی'}</span>
                    </button>
                    {item.navPath && (
                      <button
                        type="button"
                        onClick={() => onNavigate(item.navPath!)}
                        className="min-h-[34px] inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>باز کردن</span>
                      </button>
                    )}
                  </div>
                </div>
                <div dir="ltr" className="font-mono text-[11px] text-slate-700 break-all">
                  {item.url}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
