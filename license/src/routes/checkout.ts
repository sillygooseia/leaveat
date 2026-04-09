import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { licenseProduct } from '../config';
import Stripe = require('stripe');

const router = Router();

const STRIPE_SECRET_KEY = licenseProduct.checkout.secretKey;
const STRIPE_PRICE_ID = licenseProduct.checkout.priceId;
const FRONTEND_URL = licenseProduct.frontendUrl;

function isConfigured(): boolean {
  return !!(STRIPE_SECRET_KEY && STRIPE_PRICE_ID);
}

/**
 * POST /checkout
 * Creates a Stripe hosted checkout session URL and returns it.
 * The frontend redirects the user to this URL to complete payment.
 */
router.post(
  '/checkout',
  [
    body('email').optional().isEmail().normalizeEmail(),
  ],
  async (req: Request, res: Response) => {
    if (!isConfigured()) {
      res.status(501).json({ error: 'Payment processor not configured' });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY!);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: STRIPE_PRICE_ID!, quantity: 1 }],
        success_url: `${FRONTEND_URL}/activate?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/premium`,
        customer_email: req.body.email || undefined,
      });

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error('[checkout] Stripe error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
