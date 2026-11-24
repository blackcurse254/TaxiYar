import { useCallback, useEffect, useState } from 'react';
import { CarTaxiFront, Check, Copy, KeyRound, Smartphone } from 'lucide-react';
import { AdminPage } from './components/AdminPage';
import { DriverDashboardPage } from './components/DriverDashboardPage';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PassengerAmountPage } from './components/PassengerAmountPage';
import { PassengerPayPage } from './components/PassengerPayPage';
import { formatToman } from './utils/iranianValidation';
import type { HealthStatus } from './types/taxi';

type ParsedRoute =
  | { view: 'home' }
  | { view: 'passenger-amount'; slug: string }
  | { view: 'passenger-pay'; paymentId: string; token: string }
  | { view: 'driver'; driverToken: string }
  | { view: 'admin' };

function parseLocation(pathname: string, search: string): ParsedRoute {
  const params = new URLSearchParams(search);
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  const dMatch = cleanPath.match(/^\/d\/([^/]+)$/);
  if (dMatch) {
    return { view: 'passenger-amount', slug: decodeURIComponent(dMatch[1]) };
  }

  const payMatch = cleanPath.match(/^\/pay\/(\d+)$/);
  if (payMatch) {
    return { view: 'passenger-pay', paymentId: payMatch[1], token: params.get('t') || '' };
  }

  if (cleanPath === '/driver') {
    return { view: 'driver', driverToken: params.get('k') || '' };
  }

  if (cleanPath === '/admin') {
    return { view: 'admin' };
  }

  return { view: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<ParsedRoute>(() =>
    parseLocation(window.location.pathname, window.location.search)
  );
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activePayAmount, setActivePayAmount] = useState<number | null>(null);
  const [copiedAmountTop, setCopiedAmountTop] = useState(false);
  const [slugInput, setSlugInput] = useState('ali');

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) setHealth(await res.json());
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const onPop = () => {
      setRoute(parseLocation(window.location.pathname, window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [refreshHealth]);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setRoute(parseLocation(window.location.pathname, window.location.search));
    window.scrollTo({ top: 0 });
  }, []);

  function handleCopyAmountTop() {
    if (!activePayAmount) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(String(activePayAmount)).catch(() => {});
    }
    setCopiedAmountTop(true);
    window.setTimeout(() => setCopiedAmountTop(false), 1800);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-14">
      {/* Sticky Top Bar with Persistent "کپی مبلغ" on /pay/:id */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <CarTaxiFront className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <span>کرایه‌یار</span>
          </a>

          <nav aria-label="ناوبری اصلی" className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => navigate('/')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                route.view === 'home' || route.view === 'passenger-amount' || route.view === 'passenger-pay'
                  ? 'border-amber-500 text-slate-950 font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              پرداخت مسافر
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                route.view === 'admin'
                  ? 'border-amber-500 text-slate-950 font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              مدیریت رانندگان
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            {route.view === 'passenger-pay' && activePayAmount !== null ? (
              <button
                type="button"
                onClick={handleCopyAmountTop}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedAmountTop ? (
                  <Check className="h-3.5 w-3.5 text-slate-950" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-950" aria-hidden="true" />
                )}
                <span className="tabular-nums">
                  {copiedAmountTop ? 'مبلغ کپی شد' : `کپی مبلغ (${formatToman(activePayAmount)})`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(route.view === 'admin' ? '/' : '/admin')}
                className="min-h-[38px] rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {route.view === 'admin' ? 'صفحه مسافر' : 'پنل ادمین'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {route.view === 'home' && (
          <div className="mx-auto max-w-2xl space-y-6">
            <section className="rounded-3xl bg-slate-900 p-6 sm:p-8 text-white space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-400">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                <span>پرداخت مستقیم کارت‌به‌کارت تاکسی</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-snug">
                واریز مستقیم کرایه به کارت راننده بدون درگاه واسط
              </h1>
              <p className="text-xs sm:text-sm leading-6 text-slate-300">
                مبلغ با کد یکتای ۰ تا ۸۹ تومانی ایجاد می‌شود، مسافر با اپ بانک خود کارت‌به‌کارت می‌کند و واریز از طریق پیامک بانک یا تایید راننده به‌صورت صوتی اعلام می‌شود.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = slugInput.trim().toLowerCase();
                  if (clean) navigate(`/d/${encodeURIComponent(clean)}`);
                }}
                className="pt-2 flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  dir="ltr"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="slug راننده (مثلاً ali)"
                  aria-label="شناسه راننده"
                  className="flex-1 min-h-[46px] rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-mono text-white placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[46px] rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap"
                >
                  <span>ورود به صفحه مسافر </span>
                  <span dir="ltr" className="inline-block font-mono">(/d/:slug)</span>
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">ثبت راننده جدید و دریافت لینک‌ها</h2>
                <p className="mt-1 text-xs text-slate-500">
                  ورود به صفحه مدیریت (/admin) برای دریافت لینک مسافر، لینک پنل راننده و وب‌هوک پیامک.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <KeyRound className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <span>باز کردن </span>
                <span dir="ltr" className="inline-block font-mono">/admin</span>
              </button>
            </section>
          </div>
        )}

        {route.view === 'passenger-amount' && (
          <PassengerAmountPage slug={route.slug} onNavigate={navigate} />
        )}

        {route.view === 'passenger-pay' && (
          <PassengerPayPage
            paymentId={route.paymentId}
            token={route.token}
            onAmountReady={setActivePayAmount}
            onNavigate={navigate}
          />
        )}

        {route.view === 'driver' && <DriverDashboardPage driverToken={route.driverToken} />}

        {route.view === 'admin' && (
          <AdminPage health={health} onHealthRefresh={refreshHealth} onNavigate={navigate} />
        )}
      </main>

      <OfflineIndicator />
    </div>
  );
}
