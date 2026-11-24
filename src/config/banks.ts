export interface BankAppConfig {
  name: string;
  pkg: string;
  store?: string;
}

/**
 * فهرست اپلیکیشن‌های بانکی برای پرداخت کارت‌به‌کارت مستقیم.
 * برای افزودن یا ویرایش، فقط این آرایه را تغییر دهید.
 * اگر مقدار pkg خالی ('') باشد، فقط کپی شماره کارت انجام می‌شود.
 */
export const BANKS: BankAppConfig[] = [
  { name: 'ملی (بام)', pkg: 'ir.bmi.bam', store: 'https://cafebazaar.ir/app/ir.bmi.bam' },
  { name: 'ملت', pkg: 'com.pmb.mobile', store: 'https://cafebazaar.ir/app/com.pmb.mobile' },
  { name: 'سپه', pkg: 'ir.sepah.mobilebank', store: 'https://cafebazaar.ir/app/ir.sepah.mobilebank' },
  { name: 'صادرات', pkg: 'com.bsi.mobilebank', store: 'https://cafebazaar.ir/app/com.bsi.mobilebank' },
  { name: 'تجارت', pkg: 'ir.tejaratbank.mobilebank', store: 'https://cafebazaar.ir/app/ir.tejaratbank.mobilebank' },
  { name: 'پاسارگاد', pkg: 'com.bpi.mobilebank', store: 'https://cafebazaar.ir/app/com.bpi.mobilebank' },
  { name: 'سامان (blu)', pkg: 'com.samanpr.blu', store: 'https://cafebazaar.ir/app/com.samanpr.blu' },
  { name: 'رفاه', pkg: 'ir.refahbank.mobile', store: 'https://cafebazaar.ir/app/ir.refahbank.mobile' },
  { name: 'آینده', pkg: 'ir.ba24.abplus', store: 'https://cafebazaar.ir/app/ir.ba24.abplus' },
  { name: 'شهر (آپ/همراه شهر)', pkg: 'com.asanpardakht.android', store: 'https://cafebazaar.ir/app/com.asanpardakht.android' },
  { name: 'پست‌بانک', pkg: 'ir.postbank.mobile', store: 'https://cafebazaar.ir/app/ir.postbank.mobile' },
  { name: 'کشاورزی', pkg: 'ir.bki.mobile', store: 'https://cafebazaar.ir/app/ir.bki.mobile' },
  { name: 'مسکن', pkg: 'ir.bankmaskan.mobile', store: 'https://cafebazaar.ir/app/ir.bankmaskan.mobile' },
  { name: 'ملل', pkg: '' },
];
