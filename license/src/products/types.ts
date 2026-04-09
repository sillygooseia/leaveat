export interface PromoPolicy {
  enabled: boolean;
  total: number;
  durationDays: number;
  statusCacheTtlSeconds: number;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
}

export interface CheckoutPolicy {
  provider: 'stripe';
  secretKey?: string;
  priceId?: string;
  webhookSecret?: string;
}

export interface PasskeyPolicy {
  rpName: string;
  rpId: string;
  origin: string;
  userNamePrefix: string;
  userDisplayName: string;
}

export interface LicenseProductPolicy {
  slug: string;
  displayName: string;
  frontendUrl: string;
  premiumFeatures: string[];
  checkout: CheckoutPolicy;
  promo: PromoPolicy;
  passkey: PasskeyPolicy;
  mailNotifyDefault: string;
}
