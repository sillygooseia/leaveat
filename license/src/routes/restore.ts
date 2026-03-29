import { Router, Request, Response } from 'express';
import { getRedis } from '../redis-client';
import { requireLicense, type AuthenticatedRequest } from '../middleware/verify-license';
import { licenseProduct } from '../config';

const router = Router();

const RESTORE_CODE_TTL_SECONDS = 86400; // 24 hours
const CODE_LENGTH = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1 to avoid confusion

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  // Use crypto.randomFillSync equivalent pattern
  const { randomBytes } = require('crypto') as typeof import('crypto');
  const buf = randomBytes(CODE_LENGTH * 2); // extra to avoid modulo bias
  let code = '';
  let i = 0;
  while (code.length < CODE_LENGTH) {
    const byte = buf[i++];
    if (byte < 256 - (256 % CODE_CHARS.length)) {
      code += CODE_CHARS[byte % CODE_CHARS.length];
    }
  }
  return code;
}

const MAX_ACTIVE_CODES_PER_JTI = 5;

/**
 * POST /restore/code
 * Requires a valid license JWT. Generates an 8-char one-time restore code
 * stored in Redis with a 24-hour TTL.
 *
 * Active-code count is tracked per-jti via a sorted set scored by expiry
 * (restore:codes:{jti}), avoiding a full KEYS scan.
 */
router.post('/restore/code', requireLicense as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const redis = getRedis();
    const jti = req.license!.jti;
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + RESTORE_CODE_TTL_SECONDS;
    const setKey = `restore:codes:${jti}`;

    // Prune members whose code key has already expired, then count remaining.
    await redis.zremrangebyscore(setKey, 0, now);
    const activeCount = await redis.zcard(setKey);
    if (activeCount >= MAX_ACTIVE_CODES_PER_JTI) {
      res.status(429).json({ error: 'Too many active restore codes. Wait for one to expire or use an existing code.' });
      return;
    }

    const code = generateCode();
    await redis.setex(`restore:code:${code}`, RESTORE_CODE_TTL_SECONDS, jti);
    await redis.zadd(setKey, expiry, code);
    await redis.expire(setKey, RESTORE_CODE_TTL_SECONDS + 60); // keep set alive slightly beyond last code

    res.json({ code, expiresInSeconds: RESTORE_CODE_TTL_SECONDS });
  } catch (err) {
    console.error('[restore] Error generating code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /restore/:code
 * Redeems a one-time restore code. Returns a freshly re-signed license JWT
 * for the jti associated with the code. Deletes the code after use.
 */
router.get('/restore/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!code || code.length !== CODE_LENGTH) {
    res.status(400).json({ error: 'Invalid restore code format' });
    return;
  }

  try {
    const redis = getRedis();
    const { getPool, isLicenseRevoked } = await import('../db');
    const { getKeyPair } = await import('../keys');
    const { issueLicenseToken } = await import('../jwt');

    const jti = await redis.get(`restore:code:${code.toUpperCase()}`);
    if (!jti) {
      res.status(404).json({ error: 'Restore code not found or expired' });
      return;
    }

    // Check license is still active
    const revoked = await isLicenseRevoked(jti);
    if (revoked) {
      const upperCode = code.toUpperCase();
      await redis.del(`restore:code:${upperCode}`);
      await redis.zrem(`restore:codes:${jti}`, upperCode);
      res.status(403).json({ error: 'License is no longer active' });
      return;
    }

    // Fetch license metadata to preserve expiry
    const pool = getPool();
    const result = await pool.query<{ expires_at: number }>(
      'SELECT expires_at FROM licenses WHERE jti = $1',
      [jti]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'License record not found' });
      return;
    }

    const expiresAt = result.rows[0].expires_at;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remainingDays = Math.ceil((expiresAt - nowSeconds) / 86400);

    if (remainingDays <= 0) {
      res.status(403).json({ error: 'License has expired' });
      return;
    }

    // Re-sign a token for the same jti with remaining duration
    const { privateKey } = await getKeyPair();
    const { SignJWT } = await import('jose');
    const { PREMIUM_FEATURES } = await import('../jwt');

    const token = await new SignJWT({ lic: 'premium', features: [...PREMIUM_FEATURES], v: 1 })
      .setProtectedHeader({ alg: 'RS256' })
      .setJti(jti)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAt)
      .sign(privateKey);

    // Delete the code (one-time use) and remove from the per-jti tracking set.
    const upperCode = code.toUpperCase();
    await redis.del(`restore:code:${upperCode}`);
    await redis.zrem(`restore:codes:${jti}`, upperCode);

    console.log(`[restore:${licenseProduct.slug}] Code redeemed for jti ${jti}`);
    res.json({ token, expiresAt });
  } catch (err) {
    console.error('[restore] Error redeeming code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
