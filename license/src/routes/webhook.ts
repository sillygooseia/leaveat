import { Router, Request, Response } from 'express';
import Stripe = require('stripe');
import { getKeyPair } from '../keys';
import { issueLicenseToken } from '../jwt';
import { getPool } from '../db';
import { licenseProduct } from '../config';

const router = Router();

const STRIPE_WEBHOOK_SECRET = licenseProduct.checkout.webhookSecret;
const FRONTEND_URL = licenseProduct.frontendUrl;

/**
 * POST /webhook/stripe
 *
 * Handles Stripe webhook events:
 *  - checkout.session.completed    -> Issue JWT, record in Postgres
 *  - invoice.payment_succeeded     -> Re-issue JWT for renewal, revoke old
 *  - customer.subscription.deleted -> Mark licence cancelled (expires naturally)
 */
router.post('/webhook/stripe', async (req: Request, res: Response) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn('[webhook] STRIPE_WEBHOOK_SECRET not set -- rejecting');
    res.status(501).json({ error: 'Webhook not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    res.status(401).json({ error: 'Missing Stripe-Signature header' });
    return;
  }

  const rawBody: Buffer = (req as Request & { rawBody: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: 'Raw body not available' });
    return;
  }

  let event: any;
  try {
    const stripe = new Stripe(licenseProduct.checkout.secretKey!);
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.warn('[webhook] Stripe signature verification failed:', err.message);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const pool = getPool();

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const orderId: string = session.id;

      const existing = await pool.query('SELECT jti FROM licenses WHERE order_id = $1', [orderId]);
      if (existing.rows.length > 0) {
        console.log(`[webhook] Duplicate checkout session ${orderId} -- skipping`);
        res.json({ received: true });
        return;
      }

      const { privateKey } = await getKeyPair();
      const { token, jti, expiresAt } = await issueLicenseToken(privateKey);

      await pool.query(
        'INSERT INTO licenses (jti, order_id, issued_at, expires_at, status) VALUES ($1, $2, $3, $4, $5)',
        [jti, orderId, Math.floor(Date.now() / 1000), expiresAt, 'active']
      );

      console.log(`[webhook:${licenseProduct.slug}] Issued license ${jti} for checkout ${orderId}`);
      res.json({ received: true, activationUrl: `${FRONTEND_URL}/activate?token=${encodeURIComponent(token)}` });

    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      const subscriptionId: string | undefined = invoice.subscription;
      if (!subscriptionId) { res.json({ received: true }); return; }

      const existing = await pool.query(
        "SELECT jti FROM licenses WHERE order_id = $1 AND status = 'active' ORDER BY issued_at DESC LIMIT 1",
        [subscriptionId]
      );

      const { privateKey } = await getKeyPair();
      const { token, jti, expiresAt } = await issueLicenseToken(privateKey);

      await pool.query(
        'INSERT INTO licenses (jti, order_id, issued_at, expires_at, status) VALUES ($1, $2, $3, $4, $5)',
        [jti, subscriptionId, Math.floor(Date.now() / 1000), expiresAt, 'active']
      );

      if (existing.rows.length > 0) {
        await pool.query("UPDATE licenses SET status = 'renewed' WHERE jti = $1", [existing.rows[0].jti]);
      }

      console.log(`[webhook:${licenseProduct.slug}] Renewed license ${jti} for subscription ${subscriptionId}`);
      res.json({ received: true, activationUrl: `${FRONTEND_URL}/activate?token=${encodeURIComponent(token)}` });

    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      await pool.query(
        "UPDATE licenses SET status = 'cancelled' WHERE order_id = $1 AND status = 'active'",
        [subscription.id]
      );
      console.log(`[webhook:${licenseProduct.slug}] Cancelled licenses for subscription ${subscription.id}`);
      res.json({ received: true });

    } else {
      res.json({ received: true });
    }
  } catch (err) {
    console.error('[webhook] Error processing event:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
