import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeViewProps {
  value: string;
  size?: number;
  label?: string;
}

export function QrCodeView({ value, size = 184, label = 'کد QR لینک پرداخت' }: QrCodeViewProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-400"
      >
        در حال تولید QR...
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      <img
        src={dataUrl}
        alt={label}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-xl block"
      />
    </div>
  );
}
