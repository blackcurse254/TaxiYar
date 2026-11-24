const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseTomanInput(raw: string): number {
  const normalized = normalizeDigits(raw).replace(/[^\d]/g, '');
  if (!normalized) return 0;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatToman(amount: number): string {
  return new Intl.NumberFormat('fa-IR').format(Math.max(0, Math.round(amount)));
}

export function validateCardNumber(raw: string): boolean {
  const digits = normalizeDigits(raw).replace(/\D/g, '');
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let val = Number(digits[i]);
    if (i % 2 === 0) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
  }
  return sum % 10 === 0;
}

export function formatCardDisplay(raw: string): string {
  const digits = normalizeDigits(raw).replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

export function maskCardDisplay(raw: string): string {
  const digits = normalizeDigits(raw).replace(/\D/g, '');
  if (digits.length !== 16) return '••••-••••-••••-••••';
  return `${digits.slice(0, 4)}-••••-••••-${digits.slice(-4)}`;
}
