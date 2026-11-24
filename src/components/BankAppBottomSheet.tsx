import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Smartphone, X } from 'lucide-react';
import { BANKS, type BankAppConfig } from '../config/banks';
import { getBankInitial, getBankTapPlan } from '../utils/bankIntent';
import { formatCardDisplay, formatToman } from '../utils/iranianValidation';

interface BankAppBottomSheetProps {
  open: boolean;
  cardNumber: string;
  driverName: string;
  amountToman: number;
  onClose: () => void;
}

interface BankFeedbackState {
  bank: BankAppConfig;
  toastMessage: string;
  secondaryMessage: string | null;
  notInstalled: boolean;
}

export function BankAppBottomSheet({
  open,
  cardNumber,
  driverName,
  amountToman,
  onClose,
}: BankAppBottomSheetProps) {
  const [feedback, setFeedback] = useState<BankFeedbackState | null>(null);
  const timerRef = useRef<number | null>(null);
  const visibilityListenerRef = useRef<(() => void) | null>(null);

  function clearPendingMonitor() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (visibilityListenerRef.current) {
      document.removeEventListener('visibilitychange', visibilityListenerRef.current);
      visibilityListenerRef.current = null;
    }
  }

  useEffect(() => {
    if (!open) {
      clearPendingMonitor();
      setFeedback(null);
    }
    return () => {
      clearPendingMonitor();
    };
  }, [open]);

  if (!open) return null;

  function handleBankSelect(bank: BankAppConfig) {
    const plan = getBankTapPlan({
      bank,
      cardNumber,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });

    // ۱) شماره کارت راننده بلافاصله داخل همان کلیک کپی می‌شود
    if (plan.copyText && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(plan.copyText).catch(() => {
        // Ignore clipboard errors in restricted contexts
      });
    }

    clearPendingMonitor();

    setFeedback({
      bank,
      toastMessage: plan.toastMessage,
      secondaryMessage: plan.secondaryMessage,
      notInstalled: false,
    });

    // ۳) در اندروید با intent اپ را باز کن و اگر بعد از ۱.۵ ثانیه صفحه visible بود پیام «اپ نصب نیست» بده
    if (plan.shouldMonitorVisibility && plan.intentUri) {
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
          clearPendingMonitor();
        }
      };
      visibilityListenerRef.current = handleVisibility;
      document.addEventListener('visibilitychange', handleVisibility);

      window.location.href = plan.intentUri;

      timerRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          setFeedback((prev) =>
            prev
              ? {
                  ...prev,
                  notInstalled: true,
                  secondaryMessage: plan.notInstalledMessage,
                }
              : null
          );
        }
        clearPendingMonitor();
      }, plan.fallbackDelayMs);
    }
  }

  const formattedCard = formatCardDisplay(cardNumber);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-sheet-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="بستن پنجره انتخاب بانک"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[86vh] overflow-y-auto">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-amber-400 shrink-0">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="bank-sheet-title" className="text-base font-bold text-slate-900">
                پرداخت با اپ بانک
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                انتخاب بانک برای کپی خودکار کارت و انتقال به برنامه
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن لیست بانک‌ها"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Driver Card & Amount Strip */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-slate-500">کارت {driverName}: </span>
            <span dir="ltr" className="inline-block font-mono font-semibold text-slate-900 tabular-nums">
              {formattedCard || 'شماره کارت ثبت نشده'}
            </span>
          </div>
          <div className="font-bold text-slate-900 tabular-nums">
            {formatToman(amountToman)} تومان
          </div>
        </div>

        {/* Feedback / Toast Banner */}
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-2xl border p-3.5 text-xs space-y-1.5 ${
              feedback.notInstalled
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {feedback.notInstalled ? (
                <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
              )}
              <span>{feedback.toastMessage}</span>
            </div>

            {feedback.secondaryMessage && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {feedback.secondaryMessage}
                </span>
                {feedback.notInstalled && feedback.bank.store && (
                  <a
                    href={feedback.bank.store}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                  >
                    <span>نصب {feedback.bank.name}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Banks Grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {BANKS.map((bank) => {
            const isSelected = feedback?.bank.name === bank.name;
            return (
              <button
                key={bank.name}
                type="button"
                onClick={() => handleBankSelect(bank)}
                className={`min-h-[54px] flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-right transition cursor-pointer ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/25'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold shrink-0 ${
                    isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-amber-400'
                  }`}
                >
                  {getBankInitial(bank.name)}
                </span>
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {bank.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
