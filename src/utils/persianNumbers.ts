const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد'];

function threeDigitsToPersian(num: number): string {
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rem = num % 100;

  if (h > 0) parts.push(HUNDREDS[h]);
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }

  return parts.join(' و ');
}

export function numberToPersianWords(n: number): string {
  const clean = Math.max(0, Math.floor(n));
  if (clean === 0) return 'صفر';

  const groups: string[] = [];
  let remaining = clean;
  let scaleIdx = 0;

  while (remaining > 0 && scaleIdx < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const words = threeDigitsToPersian(chunk);
      groups.unshift(SCALES[scaleIdx] ? `${words} ${SCALES[scaleIdx]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  return groups.join(' و ');
}

export function formatDepositAnnouncement(amountToman: number): string {
  return `مبلغ ${numberToPersianWords(amountToman)} تومان واریز شد`;
}
