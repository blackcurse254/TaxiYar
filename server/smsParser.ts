import { normalizeDigits } from '../src/utils/iranianValidation';

export interface ParsedDepositSms {
  isDeposit: boolean;
  unit: 'toman' | 'rial' | 'unknown';
  amountsTomanCandidates: number[];
  primaryAmountToman: number | null;
  reason?: string;
}

const DEPOSIT_KEYWORDS = [
  'واریز',
  'واريز',
  'انتقال به',
  'به حساب',
  'به کارت',
  'بستانکار',
  'دریافت',
  'افزایش موجودی',
  'کارت به کارت به',
];

const WITHDRAWAL_KEYWORDS = ['برداشت', 'کسر', 'خرید', 'بدهکار', 'کاهش موجودی', 'پرداخت قبض'];

const BALANCE_LINE_MARKERS = ['مانده', 'موجودی', 'موجودي', 'balance'];

function extractNumbersFromLine(line: string): number[] {
  const cleaned = normalizeDigits(line).replace(/[,٬،_]/g, '');
  const matches = cleaned.match(/\b\d{3,10}\b/g);
  if (!matches) return [];
  return matches
    .map((m) => Number.parseInt(m, 10))
    .filter((n) => Number.isFinite(n) && n >= 100);
}

export function parseDepositSms(rawSms: string): ParsedDepositSms {
  const text = normalizeDigits((rawSms || '').trim());
  if (!text) {
    return {
      isDeposit: false,
      unit: 'unknown',
      amountsTomanCandidates: [],
      primaryAmountToman: null,
      reason: 'متن پیامک خالی است.',
    };
  }

  const hasDepositCue = DEPOSIT_KEYWORDS.some((kw) => text.includes(kw)) || /(^|\s)\+\s*\d/.test(text);
  const hasWithdrawalCue = WITHDRAWAL_KEYWORDS.some((kw) => text.includes(kw)) || /(^|\s)-\s*\d/.test(text);

  if (hasWithdrawalCue && !hasDepositCue) {
    return {
      isDeposit: false,
      unit: 'unknown',
      amountsTomanCandidates: [],
      primaryAmountToman: null,
      reason: 'پیامک برداشت است نه واریز.',
    };
  }

  if (!hasDepositCue) {
    return {
      isDeposit: false,
      unit: 'unknown',
      amountsTomanCandidates: [],
      primaryAmountToman: null,
      reason: 'نشانه واریز در متن پیامک یافت نشد.',
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Filter out lines that report balance ("مانده:" / "موجودی:") when transaction lines exist
  const txLines = lines.filter((line) => !BALANCE_LINE_MARKERS.some((m) => line.toLowerCase().includes(m)));
  const inspectLines = txLines.length > 0 ? txLines : lines;

  // Prefer lines containing explicit amount/deposit words
  const prioritized = inspectLines.filter(
    (l) => DEPOSIT_KEYWORDS.some((kw) => l.includes(kw)) || l.includes('مبلغ') || /(^|\s)\+\s*\d/.test(l)
  );
  const targetLines = prioritized.length > 0 ? prioritized : inspectLines;

  const isExplicitRial = /ریال|ريال|\brial\b|\birr\b/i.test(targetLines.join(' ')) && !/تومان/.test(targetLines.join(' '));
  const isExplicitToman = /تومان|\btoman\b/i.test(targetLines.join(' '));

  const unit: 'toman' | 'rial' | 'unknown' = isExplicitRial ? 'rial' : isExplicitToman ? 'toman' : 'unknown';

  const rawValues: number[] = [];
  for (const line of targetLines) {
    // Strip masked card numbers like 6037****1234 or 4-digit card chunks before extracting amounts
    const withoutCards = line.replace(/\b\d{4}[-\s*•]{1,6}\d{4}\b/g, ' ').replace(/\b\d{16}\b/g, ' ');
    rawValues.push(...extractNumbersFromLine(withoutCards));
  }

  const candidatesSet = new Set<number>();
  for (const val of rawValues) {
    if (unit === 'rial') {
      if (val >= 1000) candidatesSet.add(Math.round(val / 10));
    } else if (unit === 'toman') {
      candidatesSet.add(val);
    } else {
      // Unknown unit: support exact Toman AND Rial/10 if divisible by 10
      candidatesSet.add(val);
      if (val >= 10000 && val % 10 === 0) {
        candidatesSet.add(val / 10);
      }
    }
  }

  const candidates = Array.from(candidatesSet);
  return {
    isDeposit: candidates.length > 0,
    unit,
    amountsTomanCandidates: candidates,
    primaryAmountToman: candidates[0] ?? null,
    reason: candidates.length > 0 ? undefined : 'مبلغ واریز در متن پیامک یافت نشد.',
  };
}
