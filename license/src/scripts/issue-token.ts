/**
 * Standalone script to issue a dev license token.
 * Usage: npm run issue-token [durationDays]
 *
 * Requires the license service .env to be present (for key loading).
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from the project root
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getKeyPair } from '../keys';
import { issueLicenseToken, PREMIUM_FEATURES } from '../jwt';
import { initSchema, registerIssuedLicense } from '../db';
import { licenseProduct } from '../config';

(async () => {
  const durationDays = Number(process.argv[2]) || 365;
  const isProd = process.env.NODE_ENV === 'production';

  const { privateKey } = await getKeyPair();
  const { token, jti, expiresAt } = await issueLicenseToken(privateKey, durationDays, [...PREMIUM_FEATURES]);

  if (process.env.DATABASE_URL) {
    try {
      await initSchema();
      await registerIssuedLicense({ jti, expiresAt, status: 'active' });
      console.log(`[license:${licenseProduct.slug}] Registered issued token in licenses table`);
    } catch (err) {
      if (isProd) {
        throw err;
      }
      console.warn(`[license:${licenseProduct.slug}] Failed to register issued token in database - continuing without DB registration`);
      console.warn(err);
    }
  }

  console.log('\n=== DEV LICENSE TOKEN ===');
  console.log(`jti:       ${jti}`);
  console.log(`expires:   ${new Date(expiresAt * 1000).toISOString()}`);
  console.log(`\nToken (paste into ${licenseProduct.displayName} Premium Activation → "Paste Token"):\n`);
  console.log(token);
  console.log('\n=========================\n');
})();
