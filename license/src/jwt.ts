import { SignJWT, jwtVerify, type KeyLike } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { licenseProduct } from './config';

export const PREMIUM_FEATURES = [...licenseProduct.premiumFeatures] as string[];

export type PremiumFeature = string;

export interface LicenseClaims {
  jti: string;
  lic: 'premium';
  features: PremiumFeature[];
  v: number;
}

/**
 * Issue a signed RS256 license JWT.
 */
export async function issueLicenseToken(
  privateKey: KeyLike,
  durationDays = 365,
  features: PremiumFeature[] = [...PREMIUM_FEATURES]
): Promise<{ token: string; jti: string; expiresAt: number }> {
  const jti = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + durationDays * 86400;

  const token = await new SignJWT({ lic: 'premium', features, v: 1 })
    .setProtectedHeader({ alg: 'RS256' })
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, jti, expiresAt: exp };
}

/**
 * Verify an RS256 license JWT. Returns the payload or throws.
 */
export async function verifyLicenseToken(
  token: string,
  publicKey: KeyLike
): Promise<LicenseClaims & { exp: number; iat: number }> {
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
  return payload as unknown as LicenseClaims & { exp: number; iat: number };
}
