import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { importPKCS8, importSPKI, type KeyLike } from 'jose';

export interface KeyPair {
  privateKey: KeyLike;
  publicKey: KeyLike;
  publicKeyPem: string;
}

let _keyPair: KeyPair | null = null;

/**
 * Load or generate the RSA-2048 key pair used for signing license JWTs.
 *
 * Priority:
 *  1. PRIVATE_KEY_PEM env var (production — injected as k8s secret)
 *  2. ./keys/private.pem file (dev convenience — gitignored)
 *  3. Generate fresh pair on the fly and write to ./keys/ (first-run dev)
 */
export async function getKeyPair(): Promise<KeyPair> {
  if (_keyPair) return _keyPair;

  let privatePem: string;
  let publicPem: string;

  if (process.env.PRIVATE_KEY_PEM) {
    // Production: key injected via environment variable
    privatePem = process.env.PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
    if (!process.env.PUBLIC_KEY_PEM) {
      throw new Error('PUBLIC_KEY_PEM env var is required when PRIVATE_KEY_PEM is set');
    }
    publicPem = process.env.PUBLIC_KEY_PEM.replace(/\\n/g, '\n');
    console.log('[keys] Loaded RSA key pair from environment variables');
  } else {
    // Dev: read from or generate ./keys/
    const keysDir = path.join(__dirname, '..', 'keys');
    const privateKeyPath = path.join(keysDir, 'private.pem');
    const publicKeyPath = path.join(keysDir, 'public.pem');

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      privatePem = fs.readFileSync(privateKeyPath, 'utf8');
      publicPem = fs.readFileSync(publicKeyPath, 'utf8');
      console.log('[keys] Loaded RSA key pair from ./keys/');
    } else {
      console.log('[keys] Generating new RSA-2048 key pair...');
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      privatePem = privateKey as string;
      publicPem = publicKey as string;
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(privateKeyPath, privatePem, { mode: 0o600 });
      fs.writeFileSync(publicKeyPath, publicPem);
      console.log('[keys] Generated and saved RSA key pair to ./keys/');
    }
  }

  const privateKey = await importPKCS8(privatePem, 'RS256');
  const publicKey = await importSPKI(publicPem, 'RS256');

  _keyPair = { privateKey, publicKey, publicKeyPem: publicPem };
  return _keyPair;
}
