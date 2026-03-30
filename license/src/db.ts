import { Pool } from 'pg';

const { hashIp } = require('@epheme/core/rateLimiter') as {
  hashIp: (ip: string) => string;
};

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    _pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return _pool;
}

/**
 * Run schema migrations on startup — idempotent CREATE TABLE IF NOT EXISTS.
 */
export async function initSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      jti         TEXT PRIMARY KEY,
      order_id    TEXT UNIQUE,
      issued_at   BIGINT NOT NULL,
      expires_at  BIGINT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id              TEXT PRIMARY KEY,
      jti             TEXT NOT NULL REFERENCES licenses(jti) ON DELETE CASCADE,
      credential_id   TEXT NOT NULL UNIQUE,
      public_key      TEXT NOT NULL,
      sign_count      BIGINT NOT NULL DEFAULT 0,
      created_at      BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_passkey_jti ON passkey_credentials(jti);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_claims (
      id          SERIAL PRIMARY KEY,
      jti         TEXT NOT NULL REFERENCES licenses(jti),
      claimed_ip_hash TEXT,
      claimed_at  BIGINT NOT NULL
    );
  `);

  await pool.query(`
    ALTER TABLE promo_claims ADD COLUMN IF NOT EXISTS claimed_ip_hash TEXT;
  `);

  const legacyIpColumn = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'promo_claims'
        AND column_name = 'claimed_ip'
    ) AS exists;
  `);

  if (legacyIpColumn.rows[0]?.exists) {
    const legacyRows = await pool.query<{ id: number; claimed_ip: string }>(
      `SELECT id, claimed_ip
       FROM promo_claims
       WHERE claimed_ip IS NOT NULL
         AND (claimed_ip_hash IS NULL OR claimed_ip_hash = '')`
    );

    for (const row of legacyRows.rows) {
      await pool.query(
        'UPDATE promo_claims SET claimed_ip_hash = $1 WHERE id = $2',
        [hashIp(row.claimed_ip), row.id]
      );
    }

    await pool.query('DROP INDEX IF EXISTS idx_promo_claims_ip');
    await pool.query('ALTER TABLE promo_claims DROP COLUMN IF EXISTS claimed_ip');
  }

  await pool.query(`
    UPDATE promo_claims
    SET claimed_ip_hash = 'unknown'
    WHERE claimed_ip_hash IS NULL OR claimed_ip_hash = '';
  `);

  await pool.query(`
    ALTER TABLE promo_claims ALTER COLUMN claimed_ip_hash SET NOT NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_claims_ip_hash ON promo_claims(claimed_ip_hash);
  `);

  console.log('[db] Schema verified');
}

export async function getPromoClaimedCount(): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM promo_claims');
  return parseInt(result.rows[0].count, 10);
}

export async function hasIpHashClaimedPromo(ipHash: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('SELECT 1 FROM promo_claims WHERE claimed_ip_hash = $1 LIMIT 1', [ipHash]);
  return result.rows.length > 0;
}

export async function recordPromoClaim(jti: string, ipHash: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'INSERT INTO promo_claims (jti, claimed_ip_hash, claimed_at) VALUES ($1, $2, $3)',
    [jti, ipHash, Math.floor(Date.now() / 1000)]
  );
}

export async function isLicenseRevoked(jti: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query<{ status: string }>(
    'SELECT status FROM licenses WHERE jti = $1',
    [jti]
  );
  if (result.rows.length === 0) return true; // unknown = treated as revoked
  return result.rows[0].status !== 'active';
}

export async function registerIssuedLicense(params: {
  jti: string;
  expiresAt: number;
  issuedAt?: number;
  orderId?: string | null;
  status?: string;
}): Promise<void> {
  const pool = getPool();
  const issuedAt = params.issuedAt ?? Math.floor(Date.now() / 1000);
  const status = params.status ?? 'active';

  await pool.query(
    `INSERT INTO licenses (jti, order_id, issued_at, expires_at, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (jti) DO UPDATE
     SET order_id = EXCLUDED.order_id,
         issued_at = EXCLUDED.issued_at,
         expires_at = EXCLUDED.expires_at,
         status = EXCLUDED.status`,
    [params.jti, params.orderId ?? null, issuedAt, params.expiresAt, status]
  );
}
