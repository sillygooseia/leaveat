import { Request, Response, NextFunction } from 'express';
import { getKeyPair } from '../keys';
import { verifyLicenseToken, type LicenseClaims } from '../jwt';
import { isLicenseRevoked } from '../db';

export interface AuthenticatedRequest extends Request {
  license?: LicenseClaims & { exp: number; iat: number };
}

/**
 * Express middleware: verifies the RS256 license JWT in the Authorization header.
 * On success, injects req.license with the decoded claims.
 */
export async function requireLicense(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { publicKey } = await getKeyPair();
    const claims = await verifyLicenseToken(token, publicKey);

    // Revocation check against Postgres
    const revoked = await isLicenseRevoked(claims.jti!);
    if (revoked) {
      res.status(403).json({ error: 'License has been revoked' });
      return;
    }

    req.license = claims;
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired license token' });
  }
}
