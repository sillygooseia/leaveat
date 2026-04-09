import type { LicenseProductPolicy } from './types';

export const leaveatProductPolicy: LicenseProductPolicy = {
  slug: 'leaveat',
  displayName: 'LeaveAt',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4201',
  premiumFeatures: ['ai_scheduling'],
  checkout: {
    provider: 'stripe',
    secretKey: process.env.STRIPE_SECRET_KEY,
    priceId: process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
