import { getLicenseProductPolicy } from './products';

export const LICENSE_ROUTE_PREFIXES = ['', '/api/license'];
export const licenseProduct = getLicenseProductPolicy();
export const licenseLogPrefix = `[license:${licenseProduct.slug}]`;
