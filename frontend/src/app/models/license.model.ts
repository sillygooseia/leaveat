export type PremiumFeature =
  | 'unlimited_schedules'
  | 'backup'
  | 'history'
  | 'permanent_links'
  | 'templates'
  | 'duplicate'
  | 'registered_access';

export const ALL_PREMIUM_FEATURES: PremiumFeature[] = [
  'unlimited_schedules',
  'backup',
  'history',
  'permanent_links',
  'templates',
  'duplicate',
  'registered_access',
];

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
