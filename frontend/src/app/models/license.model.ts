export type PremiumFeature =
  | 'ai_scheduling'
  // Legacy feature strings carried by promo tokens — no longer gated in the app
  | 'unlimited_schedules'
  | 'backup'
  | 'history'
  | 'permanent_links'
  | 'templates'
  | 'duplicate'
  | 'registered_access';

export const ALL_PREMIUM_FEATURES: PremiumFeature[] = ['ai_scheduling'];

export interface LicenseToken {
  jti: string;
  lic: 'premium';
  features: PremiumFeature[];
  exp: number;
  iat: number;
  v: number;
}

export interface LicenseState {
  token: string;
  claims: LicenseToken;
}
