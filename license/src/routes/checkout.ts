import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { licenseProduct } from '../config';

const router = Router();

const LS_API_KEY = licenseProduct.checkout.apiKey;
const LS_STORE_ID = licenseProduct.checkout.storeId;
const LS_VARIANT_ID = licenseProduct.checkout.variantId;
const FRONTEND_URL = licenseProduct.frontendUrl;

function isConfigured(): boolean {
  return !!(LS_API_KEY && LS_STORE_ID && LS_VARIANT_ID);
}

/**
 * POST /checkout
 * Creates a Lemon Squeezy hosted checkout URL and returns it.
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
      const checkoutData: Record<string, unknown> = {
        data: {
          type: 'checkouts',
          attributes: {
            checkout_options: {
              embed: false,
              media: false,
              logo: true,
            },
            checkout_data: {
              email: req.body.email,
              custom: {
                redirect_url: `${FRONTEND_URL}/activate`,
              },
            },
            product_options: {
              redirect_url: `${FRONTEND_URL}/activate`,
            },
            expires_at: null,
          },
          relationships: {
            store: { data: { type: 'stores', id: LS_STORE_ID } },
            variant: { data: { type: 'variants', id: LS_VARIANT_ID } },
          },
        },
      };

      const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LS_API_KEY}`,
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify(checkoutData),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[checkout] Lemon Squeezy error:', response.status, text);
        res.status(502).json({ error: 'Failed to create checkout' });
        return;
      }

      const json = await response.json() as { data: { attributes: { url: string } } };
      res.json({ checkoutUrl: json.data.attributes.url });
    } catch (err) {
      console.error('[checkout] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
