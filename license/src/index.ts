import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { initSchema } from './db';
import { getKeyPair } from './keys';
import { LICENSE_ROUTE_PREFIXES, licenseLogPrefix } from './config';

import publicKeyRouter from './routes/public-key';
import checkoutRouter from './routes/checkout';
import webhookRouter from './routes/webhook';
import restoreRouter from './routes/restore';
import backupRouter from './routes/backup';
import passkeyRouter from './routes/passkey';
import promoRouter from './routes/promo';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust reverse proxy (nginx/k8s) for real client IP in X-Forwarded-For
// Only enable when running behind a trusted proxy — prevents IP spoofing.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

// ── Raw body capture for webhook signature verification ──────────────────────
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:4201').split(',').map(o => o.trim());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// ── Routes ───────────────────────────────────────────────────────────────────
for (const prefix of LICENSE_ROUTE_PREFIXES) {
  app.use(prefix, publicKeyRouter);
  app.use(prefix, checkoutRouter);
  app.use(prefix, webhookRouter);
  app.use(prefix, restoreRouter);
  app.use(prefix, backupRouter);
  app.use(prefix, passkeyRouter);
  app.use(prefix, promoRouter);
}

// Dev-only token issuance — strictly disabled in production
if (!IS_PROD) {
  const devRouter = require('./routes/dev').default;
  for (const prefix of LICENSE_ROUTE_PREFIXES) {
    app.use(prefix, devRouter);
  }
  console.log(`${licenseLogPrefix} DEV mode: /dev/issue-token endpoint is active`);
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    // Warm up key pair
    await getKeyPair();

    // Run DB migrations if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      try {
        await initSchema();
      } catch (err) {
        if (IS_PROD) {
          throw err;
        }
        console.warn('[license] DATABASE_URL is set but Postgres is unavailable - continuing without DB-backed features');
        console.warn('[license] Passkey, restore, revocation, and backup features will be unavailable in this dev session');
      }
    } else {
      console.warn(`${licenseLogPrefix} No DATABASE_URL — skipping schema init (passkey + revocation unavailable)`);
    }

    app.listen(PORT, () => {
      console.log(`${licenseLogPrefix} Listening on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
    });
  } catch (err) {
    console.error(`${licenseLogPrefix} Fatal startup error:`, err);
    process.exit(1);
  }
})();
