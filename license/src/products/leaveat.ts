import type { LicenseProductPolicy } from './types';

export const leaveatProductPolicy: LicenseProductPolicy = {
  slug: 'leaveat',
  displayName: 'LeaveAt',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4201',
  premiumFeatures: [
    'unlimited_schedules',
    'backup',
    'history',
    'permanent_links',
    'templates',
    'duplicate',
    'registered_access',
  ],
  checkout: {
    provider: 'lemonsqueezy',
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    storeId: process.env.LEMONSQUEEZY_STORE_ID,
    variantId: process.env.LEMONSQUEEZY_VARIANT_ID,
  },
  promo: {
    enabled: true,
    total: 100,
    durationDays: 365,
    statusCacheTtlSeconds: 30,
    rateLimitMax: 5,
    rateLimitWindowSeconds: 900,
  },
  passkey: {
    rpName: process.env.WEBAUTHN_RP_NAME || 'LeaveAt',
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:4201',
    userNamePrefix: 'leaveat',
    userDisplayName: 'LeaveAt License',
  },
  mailNotifyDefault: 'support@leaveat.com',
};
