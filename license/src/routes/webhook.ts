import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { getKeyPair } from '../keys';
import { issueLicenseToken } from '../jwt';
import { getPool } from '../db';
import { licenseProduct } from '../config';

const router = Router();

const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
const FRONTEND_URL = licenseProduct.frontendUrl;

/**
 * POST /webhook/lemonsqueezy
 *
 * Handles Lemon Squeezy webhook events. On `order_created`:
 *  1. Verifies HMAC-SHA256 signature
 *  2. Issues a signed RS256 license JWT
 *  3. Records the license in Postgres
 *  4. Returns 200 (Lemon Squeezy does not follow the redirect — the token
 *     is surfaced via the `redirect_url` with ?token= appended by our
 *     webhook handler, or via a custom post-purchase URL).
 *
 * The activation URL is stored in the webhook response meta so the
 * frontend can display it after the order is confirmed.
 */
router.post('/webhook/lemonsqueezy', async (req: Request, res: Response) => {
  if (!LS_WEBHOOK_SECRET) {
    console.warn('[webhook] LEMONSQUEEZY_WEBHOOK_SECRET not set — rejecting');
    res.status(501).json({ error: 'Webhook not configured' });
    return;
  }

  // Verify HMAC signature
  const signature = req.headers['x-signature'] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: 'Missing X-Signature header' });
    return;
  }

  const rawBody: Buffer = (req as Request & { rawBody: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: 'Raw body not available' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', LS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    console.warn('[webhook] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.body as {
    meta: { event_name: string; custom_data?: Record<string, string> };
    data: {
      id: string;
      attributes: { status: string; identifier: string };
    };
  };

  if (event.meta.event_name !== 'order_created') {
    // Acknowledge but don't process other events
    res.json({ received: true });
    return;
  }

  const orderId: string = event.data.id;

  try {
    // Idempotency: don't double-issue for the same order
    const pool = getPool();
    const existing = await pool.query('SELECT jti FROM licenses WHERE order_id = $1', [orderId]);
    if (existing.rows.length > 0) {
      console.log(`[webhook] Duplicate order ${orderId} — skipping`);
      res.json({ received: true });
      return;
    }

    const { privateKey } = await getKeyPair();
    const { token, jti, expiresAt } = await issueLicenseToken(privateKey);

    await pool.query(
      'INSERT INTO licenses (jti, order_id, issued_at, expires_at, status) VALUES ($1, $2, $3, $4, $5)',
      [jti, orderId, Math.floor(Date.now() / 1000), expiresAt, 'active']
    );

    console.log(`[webhook:${licenseProduct.slug}] Issued license ${jti} for order ${orderId}`);

    // Respond with the activation token — Lemon Squeezy's post-purchase page
    // can be configured to redirect to FRONTEND_URL/activate?token=<token>
    res.json({ received: true, activationUrl: `${FRONTEND_URL}/activate?token=${encodeURIComponent(token)}` });
  } catch (err) {
    console.error('[webhook] Error processing order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
