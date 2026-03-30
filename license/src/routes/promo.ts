import { Router, Request, Response } from 'express';
import { getKeyPair } from '../keys';
import { issueLicenseToken, PREMIUM_FEATURES } from '../jwt';
import { licenseProduct } from '../config';
import {
  registerIssuedLicense,
  getPromoClaimedCount,
  hasIpHashClaimedPromo,
  recordPromoClaim,
} from '../db';
import { sendMail, isEmailEnabled } from '../mailer';

const { clientIp, hashIp } = require('@epheme/core/rateLimiter') as {
  clientIp: (req: Request) => string;
  hashIp: (ip: string) => string;
};

const router = Router();

const PROMO_TOTAL = licenseProduct.promo.total;
const PROMO_DURATION_DAYS = licenseProduct.promo.durationDays;
/** Redis cache TTL for the status counter (seconds). */
const STATUS_CACHE_TTL = licenseProduct.promo.statusCacheTtlSeconds;
/** Max claim attempts per IP per window before rate-limiting. */
const RATE_LIMIT_MAX = licenseProduct.promo.rateLimitMax;
const RATE_LIMIT_WINDOW_SECONDS = licenseProduct.promo.rateLimitWindowSeconds;

/**
 * GET /promo/status
 * Public — returns { claimed, total, remaining }
 * Cached 30 s in Redis when available.
 */
router.get('/promo/status', async (_req: Request, res: Response) => {
  if (!licenseProduct.promo.enabled) {
    res.status(404).json({ error: 'Promo program not enabled' });
    return;
  }

  // Try Redis cache first
  try {
    const { getRedis } = await import('../redis-client');
    const redis = getRedis();
    const cached = await redis.get('promo:status');
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  try {
    const claimed = await getPromoClaimedCount();
    const payload = { claimed, total: PROMO_TOTAL, remaining: Math.max(0, PROMO_TOTAL - claimed) };

    // Best-effort cache write
    try {
      const { getRedis } = await import('../redis-client');
      const redis = getRedis();
      await redis.setex('promo:status', STATUS_CACHE_TTL, JSON.stringify(payload));
    } catch {
      // ignore
    }

    res.json(payload);
  } catch (err) {
    console.error('[promo] Error fetching status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /promo/claim
 * Public — issues a free 1-year premium license JWT.
 * Abuse-prevention layers (each one after the previous):
 *   1. Redis rate limit — max 5 attempts per IP-hash per 15-minute window
 *   2. Postgres UNIQUE constraint on claimed_ip_hash — one claim per network hash ever
 *   3. Pool cap — hard stop at 100 total claims
 */
router.post('/promo/claim', async (req: Request, res: Response) => {
  if (!licenseProduct.promo.enabled) {
    res.status(404).json({ error: 'Promo program not enabled' });
    return;
  }

  const ipHash = hashIp(clientIp(req));

  // 1. IP-hash rate limit via Redis (skip gracefully if Redis unavailable)
  try {
    const { getRedis } = await import('../redis-client');
    const redis = getRedis();
    const rateLimitKey = `promo:ratelimit:${ipHash}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (attempts > RATE_LIMIT_MAX) {
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please try again later.' });
      return;
    }
  } catch {
    // Redis unavailable — skip rate limiting, continue
  }

  try {
    // 2. One-per-network-hash check
    const alreadyClaimed = await hasIpHashClaimedPromo(ipHash);
    if (alreadyClaimed) {
      res.status(409).json({ error: 'already_claimed', message: 'A free license has already been claimed from this network.' });
      return;
    }

    // 3. Pool exhaustion check
    const claimed = await getPromoClaimedCount();
    if (claimed >= PROMO_TOTAL) {
      res.status(410).json({ error: 'pool_exhausted', message: 'All free licenses have been claimed. Upgrade to Premium to continue.' });
      return;
    }

    // Issue the license
    const { privateKey } = await getKeyPair();
    const { token, jti, expiresAt } = await issueLicenseToken(privateKey, PROMO_DURATION_DAYS, [...PREMIUM_FEATURES]);

    // Record in licenses table first (FK constraint requirement)
    await registerIssuedLicense({ jti, expiresAt, orderId: 'promo' });

    // Record the claim with hashed network identity only.
    await recordPromoClaim(jti, ipHash);

    // Invalidate Redis status cache
    try {
      const { getRedis } = await import('../redis-client');
      const redis = getRedis();
      await redis.del('promo:status');
    } catch {
      // ignore
    }

    const newCount = claimed + 1;
    console.log(`[promo] Issued promo license ${jti} to network ${ipHash} (${newCount}/${PROMO_TOTAL})`);

    if (isEmailEnabled()) {
      const remaining = Math.max(0, PROMO_TOTAL - newCount);
      const notify = process.env.MAIL_NOTIFY || licenseProduct.mailNotifyDefault;
      sendMail({
        to: notify,
        subject: `[${licenseProduct.displayName}] Free license claimed`,
        text: `A free ${PROMO_DURATION_DAYS}-day Premium license was claimed.\n\nNetwork Hash: ${ipHash}\nJTI: ${jti}\nClaimed: ${newCount} / ${PROMO_TOTAL}\nRemaining: ${remaining}`,
      }).catch((err: Error) => console.error('[promo] Failed to send claim notification:', err.message));
    }

    res.json({ token, jti, expiresAt, remaining: Math.max(0, PROMO_TOTAL - newCount) });
  } catch (err: any) {
    // Postgres unique violation on claimed_ip_hash — race condition guard
    if (err?.code === '23505') {
      res.status(409).json({ error: 'already_claimed', message: 'A free license has already been claimed from this network.' });
      return;
    }
    console.error('[promo] Error claiming promo license:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
