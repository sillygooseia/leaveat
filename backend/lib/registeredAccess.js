/**
 * Registered Access — device registration & member schedule viewing
 *
 * Allows admins to publish a schedule snapshot and generate per-person
 * one-time invite links. Recipients register their device once and can
 * then access the schedule at /my-schedule without needing a new link.
 *
 * Usage:
 *   const { router, initTables } = require('./lib/registeredAccess');
 *   await initTables(pgPool, LICENSE_PUBLIC_KEY_PEM);
 *   app.use('/api', router);
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { makeFeatureLicenseMiddleware } = require('@epheme/core/licenseMiddleware');

const router = express.Router();

let _pool = null;
let _publicKeyPem = null;

/**
 * Initialize tables and store references.
 * Called once from index.js after the pgPool is ready.
 */
async function initTables(pool, publicKeyPem) {
  _pool = pool;
  _publicKeyPem = publicKeyPem;

  // published_workspaces must be created before the tables that reference it
  await pool.query(`
    CREATE TABLE IF NOT EXISTS published_workspaces (
      id            UUID PRIMARY KEY,
      admin_jti     TEXT NOT NULL,
      schedule_id   TEXT NOT NULL,
      schedule_name TEXT NOT NULL,
      schedule_data JSONB NOT NULL,
      mode          TEXT NOT NULL DEFAULT 'workplace',
      visibility    TEXT NOT NULL DEFAULT 'own',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (admin_jti, schedule_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_access_tokens (
      id               UUID PRIMARY KEY,
      workspace_id     UUID NOT NULL REFERENCES published_workspaces(id) ON DELETE CASCADE,
      member_name      TEXT NOT NULL,
      registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_accessed_at TIMESTAMPTZ,
      revoked          BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id              UUID PRIMARY KEY,
      workspace_id    UUID NOT NULL REFERENCES published_workspaces(id) ON DELETE CASCADE,
      member_name     TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      claimed_at      TIMESTAMPTZ,
      access_token_id UUID REFERENCES workspace_access_tokens(id)
    )
  `);

  // Activity events — family activities with configurable volunteer roles
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_events (
      id               UUID PRIMARY KEY,
      workspace_id     UUID NOT NULL REFERENCES published_workspaces(id) ON DELETE CASCADE,
      title            TEXT NOT NULL,
      activity_type    TEXT NOT NULL DEFAULT 'activity',
      location         TEXT,
      start_at         TIMESTAMPTZ NOT NULL,
      end_at           TIMESTAMPTZ NOT NULL,
      participants     JSONB NOT NULL DEFAULT '[]',
      notes            TEXT,
      volunteers       JSONB NOT NULL DEFAULT '[]',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migrate existing tables: add volunteers column, drop legacy driver/pickup columns
  await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS volunteers JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE activity_events DROP COLUMN IF EXISTS driver_token_id`);
  await pool.query(`ALTER TABLE activity_events DROP COLUMN IF EXISTS driver_name`);
  await pool.query(`ALTER TABLE activity_events DROP COLUMN IF EXISTS pickup_token_id`);
  await pool.query(`ALTER TABLE activity_events DROP COLUMN IF EXISTS pickup_name`);

  console.log('[registeredAccess] Tables initialized');
}

// ─── Admin auth middleware ────────────────────────────────────────────────────

/**
 * Verifies the Bearer JWT and checks:
 *   - valid RS256 signature
 *   - lic === 'premium'
 *   - features includes 'registered_access'
 * Attaches payload to req.licensePayload.
 */
async function requireRegisteredAccess(req, res, next) {
  return _requireRegisteredAccess(req, res, next);
}

const _requireRegisteredAccess = makeFeatureLicenseMiddleware({
  getPublicKeyPem: () => _publicKeyPem,
  requiredLicense: 'premium',
  requiredFeatures: ['registered_access'],
  attachProperty: 'licensePayload',
  precheck: () => (_pool ? null : 'Database not available'),
  logPrefix: 'registeredAccess',
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/workspace/publish
 * Upserts a published workspace with the latest schedule snapshot.
 * Body: { scheduleId, snapshot, mode, visibility }
 * Returns: { workspaceId, updatedAt }
 */
router.post('/workspace/publish', requireRegisteredAccess, async (req, res) => {
  try {
    const { scheduleId, snapshot, mode = 'workplace', visibility = 'own' } = req.body;

    if (!scheduleId || typeof scheduleId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: scheduleId' });
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return res.status(400).json({ error: 'Missing required field: snapshot' });
    }
    if (!['workplace', 'family', 'personal'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "workplace", "family", or "personal"' });
    }
    if (!['own', 'all'].includes(visibility)) {
      return res.status(400).json({ error: 'visibility must be "own" or "all"' });
    }

    const adminJti = req.licensePayload.jti;
    const scheduleName = snapshot.name || 'Unnamed Schedule';
    const newId = uuidv4();

    const result = await _pool.query(
      `INSERT INTO published_workspaces
         (id, admin_jti, schedule_id, schedule_name, schedule_data, mode, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (admin_jti, schedule_id) DO UPDATE
         SET schedule_name = EXCLUDED.schedule_name,
             schedule_data = EXCLUDED.schedule_data,
             mode          = EXCLUDED.mode,
             visibility    = EXCLUDED.visibility,
             updated_at    = NOW()
       RETURNING id, updated_at`,
      [newId, adminJti, scheduleId, scheduleName, JSON.stringify(snapshot), mode, visibility]
    );

    const row = result.rows[0];
    console.log(`[registeredAccess] Workspace published: ${row.id} (${scheduleName})`);
    res.json({ workspaceId: row.id, updatedAt: row.updated_at });
  } catch (err) {
    console.error('[registeredAccess] Error publishing workspace:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspace/:wid/invite
 * Creates a one-time invite link for a named member.
 * Body: { memberName }
 * Returns: { inviteId, inviteUrl }
 */
router.post('/workspace/:wid/invite', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid } = req.params;
    const { memberName } = req.body;
    const adminJti = req.licensePayload.jti;

    if (!memberName || typeof memberName !== 'string' || !memberName.trim()) {
      return res.status(400).json({ error: 'Missing required field: memberName' });
    }

    // Verify the workspace belongs to this admin
    const wsResult = await _pool.query(
      'SELECT id FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const inviteId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await _pool.query(
      `INSERT INTO workspace_invites (id, workspace_id, member_name, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [inviteId, wid, memberName.trim(), expiresAt]
    );

    const inviteUrl = `/join/${inviteId}`;
    console.log(`[registeredAccess] Invite created for "${memberName.trim()}" in workspace ${wid}`);
    res.json({ inviteId, inviteUrl });
  } catch (err) {
    console.error('[registeredAccess] Error creating invite:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspace/:wid/registrations
 * Lists all invites + registered devices for a workspace.
 * Returns: { registrations[] }
 */
router.get('/workspace/:wid/registrations', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid } = req.params;
    const adminJti = req.licensePayload.jti;

    const wsResult = await _pool.query(
      'SELECT id, mode, visibility FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const result = await _pool.query(
      `SELECT
         i.id               AS invite_id,
         i.member_name,
         i.created_at       AS invite_created_at,
         i.expires_at,
         i.claimed_at,
         t.id               AS token_id,
         t.registered_at,
         t.last_accessed_at,
         t.revoked
       FROM workspace_invites i
       LEFT JOIN workspace_access_tokens t ON t.id = i.access_token_id
       WHERE i.workspace_id = $1
       ORDER BY i.created_at DESC`,
      [wid]
    );

    const now = new Date();
    const registrations = result.rows.map(row => ({
      inviteId: row.invite_id,
      memberName: row.member_name,
      inviteCreatedAt: row.invite_created_at,
      expiresAt: row.expires_at,
      status: row.token_id
        ? (row.revoked ? 'revoked' : 'registered')
        : (new Date(row.expires_at) < now ? 'expired' : 'pending'),
      tokenId: row.token_id || null,
      registeredAt: row.registered_at || null,
      lastAccessedAt: row.last_accessed_at || null,
    }));

    res.json({ registrations });
  } catch (err) {
    console.error('[registeredAccess] Error fetching registrations:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/workspace/registration/:token_id
 * Revokes an access token. Only the owning admin can revoke.
 */
router.delete('/workspace/registration/:token_id', requireRegisteredAccess, async (req, res) => {
  try {
    const { token_id } = req.params;
    const adminJti = req.licensePayload.jti;

    const result = await _pool.query(
      `UPDATE workspace_access_tokens t
       SET revoked = TRUE
       FROM published_workspaces w
       WHERE t.id = $1
         AND t.workspace_id = w.id
         AND w.admin_jti = $2
       RETURNING t.id`,
      [token_id, adminJti]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Access token not found' });
    }

    console.log(`[registeredAccess] Token revoked: ${token_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[registeredAccess] Error revoking token:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Member routes (no auth — access token is the credential) ────────────────

/**
 * GET /api/workspace/invite/:invite_id/preview
 * Returns invite metadata without consuming it.
 * Returns: { workspaceName, memberName, mode, visibility }
 */
router.get('/workspace/invite/:invite_id/preview', async (req, res) => {
  try {
    if (!_pool) return res.status(503).json({ error: 'Database not available' });

    const result = await _pool.query(
      `SELECT i.member_name, i.expires_at, i.claimed_at,
              w.schedule_name, w.mode, w.visibility
       FROM workspace_invites i
       JOIN published_workspaces w ON w.id = i.workspace_id
       WHERE i.id = $1`,
      [req.params.invite_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const row = result.rows[0];

    if (row.claimed_at) {
      return res.status(410).json({ error: 'This invite has already been used' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invite has expired' });
    }

    res.json({
      workspaceName: row.schedule_name,
      memberName: row.member_name,
      mode: row.mode,
      visibility: row.visibility,
    });
  } catch (err) {
    console.error('[registeredAccess] Error fetching invite preview:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspace/register/:invite_id
 * Claims a one-time invite and mints an access token.
 * Returns: { accessTokenId, workspaceName, memberName, mode, visibility }
 */
router.post('/workspace/register/:invite_id', async (req, res) => {
  if (!_pool) return res.status(503).json({ error: 'Database not available' });

  const client = await _pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT i.id, i.member_name, i.expires_at, i.claimed_at,
              w.id AS workspace_id, w.schedule_name, w.mode, w.visibility
       FROM workspace_invites i
       JOIN published_workspaces w ON w.id = i.workspace_id
       WHERE i.id = $1
       FOR UPDATE OF i`,
      [req.params.invite_id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = result.rows[0];

    if (invite.claimed_at) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This invite has already been used' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This invite has expired' });
    }

    const tokenId = uuidv4();

    await client.query(
      `INSERT INTO workspace_access_tokens (id, workspace_id, member_name, registered_at)
       VALUES ($1, $2, $3, NOW())`,
      [tokenId, invite.workspace_id, invite.member_name]
    );

    await client.query(
      `UPDATE workspace_invites SET claimed_at = NOW(), access_token_id = $1 WHERE id = $2`,
      [tokenId, invite.id]
    );

    await client.query('COMMIT');

    console.log(`[registeredAccess] Invite ${invite.id} claimed — token ${tokenId} created`);
    res.json({
      accessTokenId: tokenId,
      workspaceName: invite.schedule_name,
      memberName: invite.member_name,
      mode: invite.mode,
      visibility: invite.visibility,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[registeredAccess] Error registering invite:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/workspace/view/:access_token_id
 * Returns the latest published schedule for a registered device.
 * Returns: { scheduleData, scheduleName, mode, visibility, memberName, updatedAt }
 */
router.get('/workspace/view/:access_token_id', async (req, res) => {
  try {
    if (!_pool) return res.status(503).json({ error: 'Database not available' });

    const result = await _pool.query(
      `SELECT t.id, t.member_name, t.revoked,
              w.schedule_data, w.schedule_name, w.mode, w.visibility, w.updated_at
       FROM workspace_access_tokens t
       JOIN published_workspaces w ON w.id = t.workspace_id
       WHERE t.id = $1`,
      [req.params.access_token_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Access token not found' });
    }

    const row = result.rows[0];

    if (row.revoked) {
      return res.status(401).json({ error: 'Access has been revoked' });
    }

    // Fire-and-forget last_accessed_at update
    _pool.query(
      'UPDATE workspace_access_tokens SET last_accessed_at = NOW() WHERE id = $1',
      [row.id]
    ).catch(err => console.warn('[registeredAccess] last_accessed_at update failed:', err.message));

    res.json({
      scheduleData: row.schedule_data,
      scheduleName: row.schedule_name,
      mode: row.mode,
      visibility: row.visibility,
      memberName: row.member_name,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[registeredAccess] Error fetching schedule view:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Activity event routes ────────────────────────────────────────────────────

/**
 * POST /api/workspace/:wid/events
 * Admin creates an activity event.
 * Body: { title, activityType, location, startAt, endAt, participants, notes }
 * Returns: { event }
 */
router.post('/workspace/:wid/events', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid } = req.params;
    const adminJti = req.licensePayload.jti;
    const { title, activityType = 'activity', location, startAt, endAt, participants = [], notes, slots = [] } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Missing required field: title' });
    }
    if (!startAt || !endAt) {
      return res.status(400).json({ error: 'Missing required fields: startAt, endAt' });
    }

    const wsResult = await _pool.query(
      'SELECT id FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Strip tokenId/name from slots — only claim endpoints may set those
    const volunteers = slots.map(s => ({ id: s.id, label: s.label }));

    const eventId = uuidv4();
    const result = await _pool.query(
      `INSERT INTO activity_events
         (id, workspace_id, title, activity_type, location, start_at, end_at, participants, notes, volunteers, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [eventId, wid, title.trim(), activityType, location || null, startAt, endAt, JSON.stringify(participants), notes || null, JSON.stringify(volunteers)]
    );

    console.log(`[registeredAccess] Activity event created: ${eventId} in workspace ${wid}`);
    res.status(201).json({ event: _formatEvent(result.rows[0]) });
  } catch (err) {
    console.error('[registeredAccess] Error creating activity event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspace/:wid/events
 * Admin lists all activity events for a workspace.
 * Returns: { events[] }
 */
router.get('/workspace/:wid/events', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid } = req.params;
    const adminJti = req.licensePayload.jti;

    const wsResult = await _pool.query(
      'SELECT id FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const result = await _pool.query(
      `SELECT * FROM activity_events WHERE workspace_id = $1 ORDER BY start_at ASC`,
      [wid]
    );

    res.json({ events: result.rows.map(_formatEvent) });
  } catch (err) {
    console.error('[registeredAccess] Error fetching activity events:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/workspace/:wid/events/:eid
 * Admin updates an activity event (title, times, participants, etc).
 * Body: { title?, activityType?, location?, startAt?, endAt?, participants?, notes? }
 * Returns: { event }
 */
router.put('/workspace/:wid/events/:eid', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid, eid } = req.params;
    const adminJti = req.licensePayload.jti;

    const wsResult = await _pool.query(
      'SELECT id FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const { title, activityType, location, startAt, endAt, participants, notes, slots } = req.body;

    // Use a transaction to merge slots while preserving existing claims
    const client = await _pool.connect();
    try {
      await client.query('BEGIN');

      const currentRow = await client.query(
        'SELECT volunteers FROM activity_events WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
        [eid, wid]
      );
      if (currentRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Event not found' });
      }

      let mergedVolunteers = null;
      if (slots !== undefined) {
        // For each new slot, preserve existing claim if slot id matches
        const existing = currentRow.rows[0].volunteers || [];
        const claimsById = {};
        for (const v of existing) {
          if (v.tokenId) claimsById[v.id] = { tokenId: v.tokenId, name: v.name };
        }
        mergedVolunteers = JSON.stringify(
          slots.map(s => ({ id: s.id, label: s.label, ...(claimsById[s.id] || {}) }))
        );
      }

      const result = await client.query(
        `UPDATE activity_events
         SET title         = COALESCE($1, title),
             activity_type = COALESCE($2, activity_type),
             location      = COALESCE($3, location),
             start_at      = COALESCE($4, start_at),
             end_at        = COALESCE($5, end_at),
             participants  = COALESCE($6, participants),
             notes         = COALESCE($7, notes),
             volunteers    = COALESCE($8, volunteers),
             updated_at    = NOW()
         WHERE id = $9 AND workspace_id = $10
         RETURNING *`,
        [
          title?.trim() || null,
          activityType || null,
          location !== undefined ? location : null,
          startAt || null,
          endAt || null,
          participants !== undefined ? JSON.stringify(participants) : null,
          notes !== undefined ? notes : null,
          mergedVolunteers,
          eid,
          wid,
        ]
      );

      await client.query('COMMIT');
      res.json({ event: _formatEvent(result.rows[0]) });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
    return;
  } catch (err) {
    console.error('[registeredAccess] Error updating activity event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/workspace/:wid/events/:eid
 * Admin deletes an activity event.
 */
router.delete('/workspace/:wid/events/:eid', requireRegisteredAccess, async (req, res) => {
  try {
    const { wid, eid } = req.params;
    const adminJti = req.licensePayload.jti;

    const wsResult = await _pool.query(
      'SELECT id FROM published_workspaces WHERE id = $1 AND admin_jti = $2',
      [wid, adminJti]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const result = await _pool.query(
      'DELETE FROM activity_events WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [eid, wid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    console.log(`[registeredAccess] Activity event deleted: ${eid}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[registeredAccess] Error deleting activity event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspace/view/:access_token_id/events
 * Member device fetches all activity events for their workspace.
 * Returns: { events[], memberName }
 */
router.get('/workspace/view/:access_token_id/events', async (req, res) => {
  try {
    if (!_pool) return res.status(503).json({ error: 'Database not available' });

    const tokenResult = await _pool.query(
      `SELECT t.id, t.member_name, t.revoked, t.workspace_id
       FROM workspace_access_tokens t
       WHERE t.id = $1`,
      [req.params.access_token_id]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Access token not found' });
    }

    const token = tokenResult.rows[0];
    if (token.revoked) {
      return res.status(401).json({ error: 'Access has been revoked' });
    }

    const result = await _pool.query(
      `SELECT * FROM activity_events WHERE workspace_id = $1 ORDER BY start_at ASC`,
      [token.workspace_id]
    );

    // Fire-and-forget last_accessed_at update
    _pool.query(
      'UPDATE workspace_access_tokens SET last_accessed_at = NOW() WHERE id = $1',
      [token.id]
    ).catch(err => console.warn('[registeredAccess] last_accessed_at update failed:', err.message));

    res.json({ events: result.rows.map(_formatEvent), memberName: token.member_name });
  } catch (err) {
    console.error('[registeredAccess] Error fetching events for member:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/events/:eid/claim
 * Registered device claims a volunteer slot on an event.
 * Body: { accessTokenId, slotId }
 * Returns: { event }
 */
router.post('/events/:eid/claim', async (req, res) => {
  try {
    if (!_pool) return res.status(503).json({ error: 'Database not available' });

    const { eid } = req.params;
    const { accessTokenId, slotId } = req.body;

    if (!accessTokenId || typeof accessTokenId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: accessTokenId' });
    }
    if (!slotId || typeof slotId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: slotId' });
    }

    const tokenResult = await _pool.query(
      'SELECT id, member_name, revoked, workspace_id FROM workspace_access_tokens WHERE id = $1',
      [accessTokenId]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Access token not found' });
    }
    const token = tokenResult.rows[0];
    if (token.revoked) {
      return res.status(401).json({ error: 'Access has been revoked' });
    }

    const client = await _pool.connect();
    try {
      await client.query('BEGIN');

      const eventResult = await client.query(
        'SELECT id, workspace_id, volunteers FROM activity_events WHERE id = $1 FOR UPDATE',
        [eid]
      );
      if (eventResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Event not found' });
      }
      const eventRow = eventResult.rows[0];
      if (eventRow.workspace_id !== token.workspace_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Event does not belong to your workspace' });
      }

      const volunteers = Array.isArray(eventRow.volunteers) ? [...eventRow.volunteers] : [];
      const slotIdx = volunteers.findIndex(s => s.id === slotId);
      if (slotIdx === -1) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Volunteer slot not found' });
      }
      volunteers[slotIdx] = { ...volunteers[slotIdx], tokenId: token.id, name: token.member_name };

      const updated = await client.query(
        'UPDATE activity_events SET volunteers = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [JSON.stringify(volunteers), eid]
      );
      await client.query('COMMIT');

      console.log(`[registeredAccess] Event ${eid}: slot "${volunteers[slotIdx].label}" claimed by "${token.member_name}"`);
      res.json({ event: _formatEvent(updated.rows[0]) });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[registeredAccess] Error claiming event slot:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/events/:eid/claim
 * Registered device unclaims their volunteer slot.
 * Body: { accessTokenId, slotId }
 * Returns: { event }
 */
router.delete('/events/:eid/claim', async (req, res) => {
  try {
    if (!_pool) return res.status(503).json({ error: 'Database not available' });

    const { eid } = req.params;
    const { accessTokenId, slotId } = req.body;

    if (!accessTokenId || typeof accessTokenId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: accessTokenId' });
    }
    if (!slotId || typeof slotId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: slotId' });
    }

    const tokenResult = await _pool.query(
      'SELECT id, member_name, revoked, workspace_id FROM workspace_access_tokens WHERE id = $1',
      [accessTokenId]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Access token not found' });
    }
    const token = tokenResult.rows[0];
    if (token.revoked) {
      return res.status(401).json({ error: 'Access has been revoked' });
    }

    const client = await _pool.connect();
    try {
      await client.query('BEGIN');

      const eventResult = await client.query(
        'SELECT id, workspace_id, volunteers FROM activity_events WHERE id = $1 FOR UPDATE',
        [eid]
      );
      if (eventResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Event not found' });
      }
      const eventRow = eventResult.rows[0];
      if (eventRow.workspace_id !== token.workspace_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Event does not belong to your workspace' });
      }

      const volunteers = Array.isArray(eventRow.volunteers) ? [...eventRow.volunteers] : [];
      const slotIdx = volunteers.findIndex(s => s.id === slotId && s.tokenId === token.id);
      if (slotIdx === -1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You do not currently hold this volunteer slot' });
      }

      const slotLabel = volunteers[slotIdx].label;
      volunteers[slotIdx] = { id: volunteers[slotIdx].id, label: slotLabel };

      const updated = await client.query(
        'UPDATE activity_events SET volunteers = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [JSON.stringify(volunteers), eid]
      );
      await client.query('COMMIT');

      console.log(`[registeredAccess] Event ${eid}: slot "${slotLabel}" unclaimed by token ${token.id}`);
      res.json({ event: _formatEvent(updated.rows[0]) });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[registeredAccess] Error unclaiming event slot:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _formatEvent(row) {
  return {
    id:           row.id,
    workspaceId:  row.workspace_id,
    title:        row.title,
    activityType: row.activity_type,
    location:     row.location,
    startAt:      row.start_at,
    endAt:        row.end_at,
    participants: Array.isArray(row.participants) ? row.participants : (row.participants || []),
    notes:        row.notes,
    volunteers:   Array.isArray(row.volunteers) ? row.volunteers : (row.volunteers || []),
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

module.exports = { router, initTables };
