import { Router, Request, Response } from 'express';
import { getKeyPair } from '../keys';

const router = Router();

/**
 * GET /public-key
 * Returns the RSA-2048 public key in PEM format.
 * Used by the Angular frontend to verify license tokens offline.
 */
router.get('/public-key', async (_req: Request, res: Response) => {
  try {
    const { publicKeyPem } = await getKeyPair();
    res.type('text/plain').send(publicKeyPem);
  } catch (err) {
    console.error('[public-key] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
