import { leaveatProductPolicy } from './leaveat';
import type { LicenseProductPolicy } from './types';

const PRODUCT_POLICIES: Record<string, LicenseProductPolicy> = {
  leaveat: leaveatProductPolicy,
};

export function getLicenseProductPolicy(): LicenseProductPolicy {
  const slug = (process.env.EPHEME_LICENSE_PRODUCT || 'leaveat').trim().toLowerCase();
  const policy = PRODUCT_POLICIES[slug];
  if (!policy) {
    throw new Error(`Unknown EPHEME_LICENSE_PRODUCT: ${slug}`);
  }
  return policy;
}

export type { LicenseProductPolicy } from './types';
