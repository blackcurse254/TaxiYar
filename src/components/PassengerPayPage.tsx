import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import { formatCardDisplay, formatToman } from '../utils/iranianValidation';
import type { PayDetailResponse } from '../types/taxi';
import { BankAppBottomSheet } from './BankAppBottomSheet';

interface PassengerPayPageProps {
  paymentId: string;
  token: string;
  onAmountReady: (amount: number | null) => void;
  onNavigate: (to: string) => void;
}

export function PassengerPayPage({
  paymentId,
  token,
  onAmountReady,
  onNavigate,
}: PassengerPayPageProps) {
  const [payment, setPayment] = useState<PayDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/pay/${encodeURIComponent(paymentId)}?t=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'اطلاعات پرداخت معتبر نیست.');
        onAmountReady(null);
      } else {
        setPayment(data);
        onAmountReady(data.amount);
        setError('');
      }
    } catch {
      setError('خطا در بررسی وضعیت پرداخت.');
    } finally {
      setLoading(false);
    }
  }, [paymentId, token, onAmountReady]);

  useEffect(() => {
    fetchStatus();
    return () => onAmountReady(null);
  }, [fetchStatus, onAmountReady]);

  // Poll every 3 seconds while pending or claimed
  useEffect(() => {
    if (!payment || payment.status === 'confirmed' || payment.status === 'expired') {
      return;
    }
    const pollTimer = window.setInterval(() => {
      fetchStatus();
    }, 3000);
    return () => window.clearInterval(pollTimer);
  }, [payment, fetchStatus]);

  // 1-second countdown ticker
  useEffect(() => {
    if (!payment || payment.status === 'confirmed' || payment.status === 'expired') {
      return;
    }
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [payment]);

  function handleCopyCard() {
    if (!payment) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payment.driver.cardNumber).catch(() => {});
    }
    setCopiedCard(true);
    window.setTimeout(() => setCopiedCard(false), 1800);
  }

  async function handleClaim() {
    if (!payment) return;
    setClaiming(true);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(paymentId)}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در ثبت اعلام پرداخت');
      } else {
        setPayment((prev) =>
          prev ? { ...prev, status: data.status, claimedAt: data.claimedAt } : prev
        );
      }
    } catch {
      setError('خطا در ارسال درخواست اعلام پرداخت.');
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        در حال دریافت اطلاعات کارت و مبلغ یکتا...
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center space-y-4">
        <p className="text-sm font-semibold text-rose-700">{error || 'پرداخت یافت نشد.'}</p>
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
        >
          بازگشت به صفحه اصلی
        </button>
      </div>
    );
  }

  const remainingMs = Math.max(0, new Date(payment.expiresAt).getTime() - nowMs);
  const remMin = Math.floor(remainingMs / 60000);
  const remSec = Math.floor((remainingMs % 60000) / 1000);
  const countdownStr = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Status Banner */}
      {payment.status === 'confirmed' && (
        <div
          role="status"
          className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 flex items-center gap-3 text-emerald-950"
        >
          <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-base font-bold">پرداخت تایید شد</h1>
            <p className="text-xs text-emerald-800 mt-0.5 tabular-nums">
              مبلغ {formatToman(payment.amount)} تومان به حساب {payment.driver.cardHolder} نشست و به راننده اعلام شد.
            </p>
          </div>
        </div>
      )}

      {payment.status === 'claimed' && (
        <div
          role="status"
          className="rounded-3xl border border-amber-300 bg-amber-50 p-5 flex items-center gap-3 text-amber-950"
        >
          <Clock className="h-6 w-6 text-amber-700 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-base font-bold">اعلام پرداخت شما ثبت شد</h1>
            <p className="text-xs text-amber-800 mt-0.5">
              در حال بررسی خودکار پیامک واریز یا تایید راننده (به‌روزرسانی هر ۳ ثانیه)...
            </p>
          </div>
        </div>
      )}

      {payment.status === 'expired' && (
        <div
          role="alert"
          className="rounded-3xl border border-rose-200 bg-rose-50 p-5 flex items-center justify-between gap-3 text-rose-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0" aria-hidden="true" />
            <div>
              <h1 className="text-base font-bold">مهلت ۱۵ دقیقه‌ای این مبلغ به پایان رسید</h1>
              <p className="text-xs text-rose-700 mt-0.5">لطفاً مبلغ یکتای جدید دریافت کنید.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(`/d/${encodeURIComponent(payment.driver.slug)}`)}
            className="min-h-[40px] rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            دریافت مجدد
          </button>
        </div>
      )}

      {/* Exact Unique Amount + Driver Card */}
      <section className="rounded-3xl bg-slate-900 p-6 text-white space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">مبلغ دقیق قابل انتقال (کارت‌به‌کارت)</p>
            <div className="mt-1 text-3xl font-bold text-amber-400 tabular-nums">
              {formatToman(payment.amount)} <span className="text-base font-medium text-amber-200">تومان</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300 tabular-nums">
              مبلغ پایه {formatToman(payment.baseAmount)} + {formatToman(payment.amount - payment.baseAmount)} تومان کد یکتا
            </p>
          </div>

          {payment.status !== 'confirmed' && payment.status !== 'expired' && (
            <div className="rounded-2xl bg-slate-800 px-3 py-2 text-center shrink-0">
              <div className="text-[10px] text-slate-400">اعتبار</div>
              <div className="font-mono text-sm font-bold text-white tabular-nums" dir="ltr">
                {countdownStr}
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-400">
              شماره کارت راننده ({payment.driver.name} · به نام {payment.driver.cardHolder})
            </div>
            <div
              dir="ltr"
              className="mt-1.5 inline-block font-mono text-lg sm:text-xl font-bold tracking-wider text-white tabular-nums"
            >
              {formatCardDisplay(payment.driver.cardNumber)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyCard}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 cursor-pointer"
          >
            {copiedCard ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            <span>{copiedCard ? 'کارت کپی شد' : 'کپی شماره کارت'}</span>
          </button>
        </div>
      </section>

      {/* Payment Actions */}
      {(payment.status === 'pending' || payment.status === 'claimed') && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
          <p className="text-xs leading-6 text-slate-600">
            لطفاً دقیقاً مبلغ <strong className="text-slate-900 tabular-nums">{formatToman(payment.amount)} تومان</strong> را از طریق اپ بانک خود به کارت بالا انتقال دهید و سپس دکمه «پرداخت کردم» را بزنید.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBankSheetOpen(true)}
              className="min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.99] cursor-pointer"
            >
              <Smartphone className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <span>پرداخت با اپ بانک</span>
            </button>

            <button
              type="button"
              disabled={claiming || payment.status === 'claimed'}
              onClick={handleClaim}
              className="min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              <UserCheck className="h-5 w-5" aria-hidden="true" />
              <span>
                {payment.status === 'claimed'
                  ? 'اعلام پرداخت ثبت شد'
                  : claiming
                  ? 'در حال ثبت...'
                  : 'پرداخت کردم'}
              </span>
            </button>
          </div>
        </section>
      )}

      <BankAppBottomSheet
        open={bankSheetOpen}
        cardNumber={payment.driver.cardNumber}
        driverName={payment.driver.name}
        amountToman={payment.amount}
        onClose={() => setBankSheetOpen(false)}
      />
    </div>
  );
}
