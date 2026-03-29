import { Router, Response } from 'express';
import { requireLicense, type AuthenticatedRequest } from '../middleware/verify-license';
import { getRedis } from '../redis-client';

const router = Router();

const MAX_BACKUP_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /backup/:jti
 * Stores an encrypted schedule backup blob in Redis.
 * The blob is opaque to the server — AES-256-GCM encrypted by the client.
 * No TTL: backup persists as long as Redis has the data.
 */
router.post('/backup/:jti', requireLicense as any, async (req: AuthenticatedRequest, res: Response) => {
  const { jti } = req.params;

  // Ensure the authenticated license matches the requested jti
  if (req.license!.jti !== jti) {
    res.status(403).json({ error: 'License jti does not match requested backup slot' });
    return;
  }

  const { blob } = req.body as { blob?: string };
  if (!blob || typeof blob !== 'string') {
    res.status(400).json({ error: 'Missing required field: blob (base64 string)' });
    return;
  }

  const blobBytes = Buffer.byteLength(blob, 'utf8');
  if (blobBytes > MAX_BACKUP_BYTES) {
    res.status(413).json({ error: `Backup too large (max ${MAX_BACKUP_BYTES} bytes)` });
    return;
  }

  try {
    const redis = getRedis();
    const backupPayload = JSON.stringify({ blob, savedAt: Date.now() });
    await redis.set(`backup:${jti}`, backupPayload);
    console.log(`[backup] Stored backup for jti ${jti} (${blobBytes} bytes)`);
    res.json({ ok: true, savedAt: Date.now() });
  } catch (err) {
    console.error('[backup] Error storing backup:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /backup/:jti
 * Retrieves the encrypted backup blob for the given jti.
 */
router.get('/backup/:jti', requireLicense as any, async (req: AuthenticatedRequest, res: Response) => {
  const { jti } = req.params;

  if (req.license!.jti !== jti) {
    res.status(403).json({ error: 'License jti does not match requested backup slot' });
    return;
  }

  try {
    const redis = getRedis();
    const raw = await redis.get(`backup:${jti}`);
    if (!raw) {
      res.status(404).json({ error: 'No backup found for this license' });
      return;
    }

    const { blob, savedAt } = JSON.parse(raw) as { blob: string; savedAt: number };
    res.json({ blob, savedAt });
  } catch (err) {
    console.error('[backup] Error retrieving backup:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
