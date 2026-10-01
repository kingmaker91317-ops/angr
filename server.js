const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'angry-admin-2024';
const KEYS_FILE = path.join(__dirname, 'keys.json');

// ─── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { status: 'error', message: 'Too many requests' } });
app.use('/api/', limiter);

// ─── DB Helpers ───────────────────────────────────────────
function loadKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); }
  catch { return []; }
}

function saveKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ANGRY-${seg()}-${seg()}-${seg()}`;
}

// Startup: load seed keys from env var (survives restarts)
function initKeys() {
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '[]');
  const seedEnv = process.env.SEED_KEYS;
  if (!seedEnv) return;
  try {
    const seedKeys = JSON.parse(seedEnv);
    const existing = loadKeys();
    let changed = false;
    for (const sk of seedKeys) {
      if (!existing.find(k => k.key === sk.key)) {
        existing.push(sk);
        changed = true;
        console.log(`✅ Seed key loaded: ${sk.key}`);
      }
    }
    if (changed) saveKeys(existing);
  } catch (e) {
    console.error('SEED_KEYS parse error:', e.message);
  }
}
initKeys();

// ─── Auth Middleware ──────────────────────────────────────
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  next();
}

// ═══════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════

// Root → redirect to admin
app.get('/', (req, res) => res.redirect('/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── AUTH ENDPOINT ────────────────────────────────────────
// POST /api/auth  → { key, device_id }
app.post('/api/auth', (req, res) => {
  const { key, device_id } = req.body;

  if (!key) return res.status(400).json({ status: 'error', message: 'Key required' });

  const keys = loadKeys();
  const entry = keys.find(k => k.key === key.trim().toUpperCase());

  if (!entry) {
    return res.status(401).json({ status: 'error', message: 'Invalid Key' });
  }

  // Expiry check
  if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
    return res.status(403).json({ status: 'error', message: 'Key Expired' });
  }

  // HWID lock
  if (entry.hwid && device_id && entry.hwid !== device_id) {
    return res.status(403).json({ status: 'error', message: 'Device Mismatch' });
  }

  // First use - lock HWID
  if (!entry.hwid && device_id) {
    entry.hwid = device_id;
    entry.first_used = new Date().toISOString();
    saveKeys(keys);
  }

  // Last used update
  entry.last_used = new Date().toISOString();
  entry.use_count = (entry.use_count || 0) + 1;
  saveKeys(keys);

  return res.json({
    status: 'success',
    message: 'Login Success',
    token: crypto.randomBytes(16).toString('hex'),
    user: entry.label || 'User',
    expires_at: entry.expires_at || null
  });
});

// ─── ALTERNATIVE ENDPOINTS (same logic) ──────────────────
app.post('/api/login', (req, res, next) => { req.url = '/api/auth'; next('route'); });

// ═══════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════

// Admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// List all keys
app.get('/admin/keys', adminAuth, (req, res) => {
  const keys = loadKeys();
  res.json({ status: 'ok', count: keys.length, keys });
});

// Generate new key
app.post('/admin/keys/generate', adminAuth, (req, res) => {
  const { label, days, note } = req.body;
  const keys = loadKeys();

  const newKey = {
    key: generateKey(),
    label: label || 'User',
    note: note || '',
    created_at: new Date().toISOString(),
    expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
    hwid: null,
    first_used: null,
    last_used: null,
    use_count: 0
  };

  keys.push(newKey);
  saveKeys(keys);

  res.json({ status: 'ok', message: 'Key generated', key: newKey });
});

// Delete key
app.delete('/admin/keys/:key', adminAuth, (req, res) => {
  let keys = loadKeys();
  const before = keys.length;
  keys = keys.filter(k => k.key !== req.params.key.toUpperCase());
  if (keys.length === before) return res.status(404).json({ status: 'error', message: 'Key not found' });
  saveKeys(keys);
  res.json({ status: 'ok', message: 'Key deleted' });
});

// Reset HWID
app.post('/admin/keys/:key/reset-hwid', adminAuth, (req, res) => {
  const keys = loadKeys();
  const entry = keys.find(k => k.key === req.params.key.toUpperCase());
  if (!entry) return res.status(404).json({ status: 'error', message: 'Key not found' });
  entry.hwid = null;
  saveKeys(keys);
  res.json({ status: 'ok', message: 'HWID reset' });
});

// Stats
app.get('/admin/stats', adminAuth, (req, res) => {
  const keys = loadKeys();
  const now = new Date();
  res.json({
    status: 'ok',
    total: keys.length,
    active: keys.filter(k => !k.expires_at || new Date(k.expires_at) > now).length,
    expired: keys.filter(k => k.expires_at && new Date(k.expires_at) <= now).length,
    used: keys.filter(k => k.use_count > 0).length
  });
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Angry Mod Auth Server running on port ${PORT}`);
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '[]');
});
