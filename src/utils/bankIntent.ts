import type { BankAppConfig } from '../config/banks';
import { normalizeDigits } from './iranianValidation';

export type MobilePlatform = 'android' | 'ios' | 'desktop';

export interface BankTapPlan {
  copyText: string;
  toastMessage: string;
  secondaryMessage: string | null;
  intentUri: string | null;
  shouldMonitorVisibility: boolean;
  notInstalledMessage: string;
  fallbackDelayMs: number;
}

const VALID_ANDROID_PKG = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

export function detectMobilePlatform(userAgent: string): MobilePlatform {
  const ua = (userAgent || '').toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

export function buildAndroidIntentUri(pkg: string): string | null {
  const trimmed = (pkg || '').trim();
  if (!trimmed || !VALID_ANDROID_PKG.test(trimmed)) {
    return null;
  }
  return `intent://#Intent;package=${trimmed};end`;
}

export function getBankInitial(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'ب';
  return clean.slice(0, 1);
}

export function getBankTapPlan(params: {
  bank: BankAppConfig;
  cardNumber: string;
  userAgent: string;
}): BankTapPlan {
  const copyText = normalizeDigits(params.cardNumber || '').replace(/\D/g, '');
  const platform = detectMobilePlatform(params.userAgent);
  const intentUri = buildAndroidIntentUri(params.bank.pkg);

  const toastMessage = 'شماره کارت کپی شد؛ در اپ بانک Paste کنید';
  const notInstalledMessage = 'اپ نصب نیست';

  if (!intentUri) {
    return {
      copyText,
      toastMessage,
      secondaryMessage: platform === 'ios' ? 'اپ بانک را باز کنید' : null,
      intentUri: null,
      shouldMonitorVisibility: false,
      notInstalledMessage,
      fallbackDelayMs: 1500,
    };
  }

  if (platform === 'ios') {
    return {
      copyText,
      toastMessage,
      secondaryMessage: 'اپ بانک را باز کنید',
      intentUri: null,
      shouldMonitorVisibility: false,
      notInstalledMessage,
      fallbackDelayMs: 1500,
    };
  }

  if (platform === 'android') {
    return {
      copyText,
      toastMessage,
      secondaryMessage: null,
      intentUri,
      shouldMonitorVisibility: true,
      notInstalledMessage,
      fallbackDelayMs: 1500,
    };
  }

  return {
    copyText,
    toastMessage,
    secondaryMessage: null,
    intentUri: null,
    shouldMonitorVisibility: false,
    notInstalledMessage,
    fallbackDelayMs: 1500,
  };
}
