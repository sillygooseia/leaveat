const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');
const { Pool } = require('pg');
const { router: registeredAccessRouter, initTables: initRegisteredAccessTables } = require('./lib/registeredAccess');
const { sendMail, isEmailEnabled } = require('./lib/mailer');
const { buildIpRateLimiter } = require('@epheme/core/rateLimiter');
const { makeFeatureLicenseMiddleware, makeLicensePublicKeyHandler } = require('@epheme/core/licenseMiddleware');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || null;
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || '300000', 10); // 5 min default
const DATABASE_URL = process.env.DATABASE_URL || null;
const LICENSE_PUBLIC_KEY_PEM = process.env.LICENSE_PUBLIC_KEY || null;
const MAIL_NOTIFY = process.env.MAIL_NOTIFY || 'support@leaveat.com';

// Redis client (optional — falls back to in-memory Map when not configured)
let redis = null;
let store = new Map(); // In-memory fallback

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: true });
  redis.on('error', (err) => {
    console.error('[leaveat] Redis error:', err && err.message ? err.message : err);
  });
  redis.on('connect', () => {
    console.log('[leaveat] Redis connected for share link persistence');
  });
} else {
  console.warn('[leaveat] No REDIS_URL set — using in-memory storage (share links lost on restart)');
}

// Rate limiters (silently no-op when Redis is not available)
function buildLazyRateLimiter(keyPrefix, windowSecs, defaultLimit, envKey) {
  let _mw = null;
  return async function (req, res, next) {
    if (!redis) return next();
    if (!_mw) _mw = buildIpRateLimiter(redis, keyPrefix, windowSecs, defaultLimit, envKey);
    return _mw(req, res, next);
  };
}
const shareLimiter   = buildLazyRateLimiter('leaveat_share',   60,  10, 'RATE_LIMIT_SHARE');
const supportLimiter = buildLazyRateLimiter('leaveat_support', 600,  5, 'RATE_LIMIT_SUPPORT');

// Storage abstraction for Redis or in-memory Map
const storage = {
  async set(id, data, ttlSeconds) {
    if (redis) {
      if (ttlSeconds === 0) {
        // Permanent link — store without TTL
        await redis.set(`share:${id}`, JSON.stringify(data));
      } else {
        await redis.setex(`share:${id}`, ttlSeconds, JSON.stringify(data));
      }
    } else {
      const expiresAt = ttlSeconds === 0 ? Infinity : Date.now() + ttlSeconds * 1000;
      store.set(id, { data, expiresAt });
    }
  },
  async get(id) {
    if (redis) {
      const raw = await redis.get(`share:${id}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Redis TTL handles expiration automatically
      return { data, expiresAt: null }; // expiresAt not needed for Redis
    } else {
      const entry = store.get(id);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(id);
        return null; // expired
      }
      return entry;
    }
  },
  async delete(id) {
    if (redis) {
      await redis.del(`share:${id}`);
    } else {
      store.delete(id);
    }
  },
  async cleanup() {
    if (!redis) {
      // Only needed for in-memory store (Redis handles TTL automatically)
      const now = Date.now();
      let deletedCount = 0;
      for (const [id, entry] of store.entries()) {
        if (now > entry.expiresAt) {
          store.delete(id);
          deletedCount++;
        }
      }
      if (deletedCount > 0) {
        console.log(`[leaveat] Cleaned up ${deletedCount} expired share link(s)`);
      }
    }
  }
};

// Periodic cleanup job (only runs for in-memory store)
setInterval(() => storage.cleanup(), CLEANUP_INTERVAL_MS);

app.post('/api/share', shareLimiter, async (req, res) => {
  try {
    const data = req.body.data;
    const rawTtl = req.body.ttlSeconds;
    const ttlSeconds = rawTtl === 0 ? 0 : (parseInt(rawTtl) || 604800); // 0 = permanent
    if (!data) {
      return res.status(400).json({ error: 'Missing required field: data' });
    }
    const id = uuidv4();
    const expiresAt = ttlSeconds === 0 ? null : Date.now() + ttlSeconds * 1000;
    await storage.set(id, data, ttlSeconds);
    const url = `/s/${id}`;
    res.json({ id, url, expiresAt });
    console.log(`[leaveat] Created share link ${id} (TTL: ${ttlSeconds === 0 ? 'permanent' : ttlSeconds + 's'})`);
  } catch (err) {
    console.error('[leaveat] Error creating share link:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/share/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const entry = await storage.get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    res.json({ id, data: entry.data, expiresAt: entry.expiresAt });
  } catch (err) {
    console.error('[leaveat] Error fetching share link:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Short share URL (used by public view page)
app.get('/s/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const entry = await storage.get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }
    res.json({ id, data: entry.data, expiresAt: entry.expiresAt });
  } catch (err) {
    console.error('[leaveat] Error fetching share link:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Postgres (registered access) ───────────────────────────────────────────

let pgPool = null;

if (DATABASE_URL) {
  pgPool = new Pool({ connectionString: DATABASE_URL });
  pgPool.connect()
    .then(client => { console.log('[leaveat] Postgres connected'); client.release(); })
    .then(() => initRegisteredAccessTables(pgPool, LICENSE_PUBLIC_KEY_PEM))
    .catch(err => console.error('[leaveat] Postgres init error:', err.message));
} else {
  console.warn('[leaveat] No DATABASE_URL set — registered access will be unavailable');
}

// ─── License public key ──────────────────────────────────────────────────────

// GET /api/license/public-key
// Returns the RSA SPKI public key used to verify license JWTs client-side.
app.get('/api/license/public-key', makeLicensePublicKeyHandler({
  getPublicKeyPem: () => LICENSE_PUBLIC_KEY_PEM,
}));

// ─── Support ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.post('/api/support', supportLimiter, async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return res.status(400).json({ error: 'name is required' });
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'A valid email is required' });
  if (!message || typeof message !== 'string' || message.trim().length === 0)
    return res.status(400).json({ error: 'message is required' });
  if (name.length > 200 || email.length > 254 || message.length > 5000)
    return res.status(400).json({ error: 'Input too long' });
  if (!isEmailEnabled()) {
    console.warn('[leaveat] Support request received but email not configured');
    return res.status(503).json({ error: 'Support contact is not currently available' });
  }
  try {
    await sendMail({
      to: MAIL_NOTIFY,
      subject: `[LeaveAt Support] ${name.trim()}`,
      text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`,
      html: `<p><strong>Name:</strong> ${escapeHtml(name.trim())}</p><p><strong>Email:</strong> ${escapeHtml(email.trim())}</p><hr><p>${escapeHtml(message.trim()).replace(/\n/g, '<br>')}</p>`,
    });
    res.json({ ok: true });
    console.log(`[leaveat] Support request from ${email.trim()}`);
  } catch (err) {
    console.error('[leaveat] Failed to send support email:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

app.use('/api', registeredAccessRouter);

// ─── BafGo suite identity ─────────────────────────────────────────────────────

// GET /api/suite
// Identifies this service as part of the BafGo suite.
// Used by the homepage /api/products health-check and by Hub sync clients.
app.get('/api/suite', (req, res) => {
  res.json({ product: 'leaveat', slug: 'schedule', version: '0.1.0', bafgoSuite: true });
});

app.listen(PORT, () => {
  console.log(`LeaveAt backend listening on port ${PORT}`);
});
