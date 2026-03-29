import { Router, Request, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorDevice, RegistrationResponseJSON } from '@simplewebauthn/types';
import { getPool } from '../db';
import { getKeyPair } from '../keys';
import { requireLicense, type AuthenticatedRequest } from '../middleware/verify-license';
import { getRedis } from '../redis-client';
import { SignJWT } from 'jose';
import { PREMIUM_FEATURES } from '../jwt';
import { v4 as uuidv4 } from 'uuid';
import { licenseProduct } from '../config';

const router = Router();

const RP_NAME = licenseProduct.passkey.rpName;
const RP_ID = licenseProduct.passkey.rpId;
const ORIGIN = licenseProduct.passkey.origin;
const CHALLENGE_TTL = 300; // 5 minutes

/**
 * POST /passkey/register/options
 * Returns WebAuthn registration options for the authenticated license's jti.
 */
router.post('/passkey/register/options', requireLicense as any, async (req: AuthenticatedRequest, res: Response) => {
  const jti = req.license!.jti;
  try {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: jti,
      userName: `${licenseProduct.passkey.userNamePrefix}-${jti.slice(0, 8)}`,
      userDisplayName: licenseProduct.passkey.userDisplayName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in Redis
    const redis = getRedis();
    await redis.setex(`passkey:challenge:reg:${jti}`, CHALLENGE_TTL, options.challenge);

    res.json(options);
  } catch (err) {
    console.error('[passkey] register options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /passkey/register/verify
 * Verifies attestation and stores the credential.
 */
router.post('/passkey/register/verify', requireLicense as any, async (req: AuthenticatedRequest, res: Response) => {
  const jti = req.license!.jti;
  try {
    const redis = getRedis();
    const expectedChallenge = await redis.get(`passkey:challenge:reg:${jti}`);
    if (!expectedChallenge) {
      res.status(400).json({ error: 'Registration challenge expired or not found' });
      return;
    }

    const body = req.body as RegistrationResponseJSON;
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Registration verification failed' });
      return;
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const pool = getPool();
    const credentialId = Buffer.from(credentialID).toString('base64url');
    const publicKeyB64 = Buffer.from(credentialPublicKey).toString('base64');

    await pool.query(
      `INSERT INTO passkey_credentials (id, jti, credential_id, public_key, sign_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (credential_id) DO NOTHING`,
      [uuidv4(), jti, credentialId, publicKeyB64, counter, Date.now()]
    );

    await redis.del(`passkey:challenge:reg:${jti}`);
    console.log(`[passkey] Registered credential for jti ${jti}`);
    res.json({ verified: true });
  } catch (err) {
    console.error('[passkey] register verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /passkey/authenticate/options
 * Returns authentication options. Works as a discoverable credential flow —
 * no jti needed upfront.
 */
router.post('/passkey/authenticate/options', async (_req: Request, res: Response) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
    });

    const challengeId = uuidv4();
    const redis = getRedis();
    await redis.setex(`passkey:challenge:auth:${challengeId}`, CHALLENGE_TTL, options.challenge);

    res.json({ ...options, challengeId });
  } catch (err) {
    console.error('[passkey] auth options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /passkey/authenticate/verify
 * Verifies assertion, returns a fresh license JWT for the associated jti.
 */
router.post('/passkey/authenticate/verify', async (req: Request, res: Response) => {
  const { challengeId, ...authResponse } = req.body as AuthenticationResponseJSON & { challengeId: string };

  if (!challengeId) {
    res.status(400).json({ error: 'Missing challengeId' });
    return;
  }

  try {
    const redis = getRedis();
    const pool = getPool();

    const expectedChallenge = await redis.get(`passkey:challenge:auth:${challengeId}`);
    if (!expectedChallenge) {
      res.status(400).json({ error: 'Authentication challenge expired or not found' });
      return;
    }

    // Look up credential by id
    const credentialIdB64 = authResponse.id;
    const credResult = await pool.query<{
      id: string; jti: string; credential_id: string; public_key: string; sign_count: number;
    }>(
      'SELECT id, jti, credential_id, public_key, sign_count FROM passkey_credentials WHERE credential_id = $1',
      [credentialIdB64]
    );

    if (credResult.rows.length === 0) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const cred = credResult.rows[0];
    const authenticator: AuthenticatorDevice = {
      credentialID: Buffer.from(cred.credential_id, 'base64url'),
      credentialPublicKey: Buffer.from(cred.public_key, 'base64'),
      counter: cred.sign_count,
    };

    const verification = await verifyAuthenticationResponse({
      response: authResponse as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator,
    });

    if (!verification.verified) {
      res.status(401).json({ error: 'Authentication failed' });
      return;
    }

    // Update sign count
    await pool.query(
      'UPDATE passkey_credentials SET sign_count = $1 WHERE id = $2',
      [verification.authenticationInfo.newCounter, cred.id]
    );

    // Check license status
    const licenseResult = await pool.query<{ expires_at: number; status: string }>(
      'SELECT expires_at, status FROM licenses WHERE jti = $1',
      [cred.jti]
    );

    if (licenseResult.rows.length === 0 || licenseResult.rows[0].status !== 'active') {
      res.status(403).json({ error: 'License is not active' });
      return;
    }

    const { expires_at: expiresAt } = licenseResult.rows[0];
    const nowSeconds = Math.floor(Date.now() / 1000);

    const { privateKey } = await getKeyPair();
    const token = await new SignJWT({ lic: 'premium', features: [...PREMIUM_FEATURES], v: 1 })
      .setProtectedHeader({ alg: 'RS256' })
      .setJti(cred.jti)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAt)
      .sign(privateKey);

    await redis.del(`passkey:challenge:auth:${challengeId}`);
    console.log(`[passkey] Authenticated passkey for jti ${cred.jti}`);
    res.json({ token, expiresAt });
  } catch (err) {
    console.error('[passkey] auth verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
