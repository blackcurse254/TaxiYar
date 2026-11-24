export type PaymentStatus = 'pending' | 'claimed' | 'confirmed' | 'expired';

export interface DriverPublicInfo {
  slug: string;
  name: string;
  cardHolder: string;
  cardNumberMasked: string;
}

export interface PayDetailResponse {
  id: number;
  status: PaymentStatus;
  baseAmount: number;
  amount: number;
  expiresAt: string;
  claimedAt: string | null;
  confirmedAt: string | null;
  driver: {
    slug: string;
    name: string;
    cardNumber: string;
    cardHolder: string;
  };
}

export interface PaymentRecordItem {
  id: number;
  driverId: number;
  baseAmount: number;
  amount: number;
  status: PaymentStatus;
  announced: boolean;
  expiresAt: string;
  claimedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface DriverSyncResponse {
  driver: {
    id: number;
    slug: string;
    name: string;
    cardHolder: string;
    cardNumberMasked: string;
  };
  newlyConfirmed: PaymentRecordItem[];
  claimedPayments: PaymentRecordItem[];
  recentConfirmed: PaymentRecordItem[];
  pendingCount: number;
}

export interface AdminDriverCreatedResponse {
  driver: {
    id: number;
    slug: string;
    name: string;
    cardNumber: string;
    cardHolder: string;
    createdAt: string;
  };
  tokens: {
    drv: string;
    sms: string;
  };
  links: {
    passengerUrl: string;
    driverUrl: string;
    webhookUrl: string;
  };
}

export interface HealthStatus {
  ok: boolean;
  activeGateway: string;
  storage: 'neon' | 'memory';
  adminSetupRequired: boolean;
  envConfigured: {
    databaseUrl: boolean;
    linkSigningSecret: boolean;
    webhookHmacSecret: boolean;
  };
}
