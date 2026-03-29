import { Router, Request, Response } from 'express';
import { getKeyPair } from '../keys';
import { issueLicenseToken, PREMIUM_FEATURES, type PremiumFeature } from '../jwt';
import { licenseProduct } from '../config';

const router = Router();

/**
 * DEV ONLY — not mounted in production.
 *
 * POST /dev/issue-token
 * Issues a signed license JWT without requiring a payment.
 * Used for local development and testing before Lemon Squeezy is configured.
 *
 * Body (all optional):
 *   { durationDays?: number, features?: string[] }
 */
router.post('/dev/issue-token', async (req: Request, res: Response) => {
  try {
    const durationDays = Number(req.body?.durationDays) || 365;
    const rawFeatures = req.body?.features as string[] | undefined;
    const features: PremiumFeature[] = (rawFeatures && Array.isArray(rawFeatures))
      ? rawFeatures.filter((f): f is PremiumFeature => (PREMIUM_FEATURES as readonly string[]).includes(f))
      : [...PREMIUM_FEATURES];

    const { privateKey } = await getKeyPair();
    const { token, jti, expiresAt } = await issueLicenseToken(privateKey, durationDays, features);

    console.log(`[dev:${licenseProduct.slug}] Issued test token jti=${jti} duration=${durationDays}d`);
    res.json({ token, jti, expiresAt, note: 'DEV TOKEN — not recorded in database' });
  } catch (err) {
    console.error('[dev] Error issuing token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
