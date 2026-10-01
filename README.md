# 🔐 Angry Mod Auth Server

A lightweight Node.js/Express authentication server for the Angry Mod app, designed for `lib.myvipsite.fun`. Uses a JSON file database — no external DB required.

---

## Features

| Feature | Detail |
|---|---|
| Auth endpoint | `POST /api/auth` — validates key + device ID |
| Key format | `ANGRY-XXXX-XXXX-XXXX` (random alphanumeric) |
| HWID lock | Binds a key to the first device that uses it |
| Expiry | Per-key optional expiry date |
| Admin panel | Bootstrap dark-mode UI at `/admin` |
| Rate limiting | 10 auth attempts / 15 min per IP |
| Security | Helmet, CORS, admin secret |
| Storage | Flat JSON file (`keys.json`) — Render-friendly |

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables (PowerShell example)
$env:ADMIN_SECRET = "my-super-secret"
$env:PORT = "3000"

# 3. Start
npm start
```

Open **http://localhost:3000/admin** and enter your `ADMIN_SECRET`.

---

## API Reference

### `POST /api/auth`
Authenticate with a key and device ID.

**Request body:**
```json
{ "key": "ANGRY-XXXX-XXXX-XXXX", "device_id": "unique-device-id" }
```

**Success `200`:**
```json
{ "status": "success", "message": "Login Success", "token": "..." }
```

**Failure `401`:**
```json
{ "status": "error", "message": "Invalid Key" }
```

---

### `GET /admin/keys`
List all keys.

**Header:** `x-admin-secret: <ADMIN_SECRET>`  
— or — query param `?secret=<ADMIN_SECRET>`

---

### `POST /admin/keys/generate`
Generate a new key.

**Header:** `x-admin-secret: <ADMIN_SECRET>`

**Body (all optional):**
```json
{
  "expiresInDays": 30,
  "hwidLock": true,
  "note": "VIP user"
}
```

---

### `DELETE /admin/keys/:key`
Delete a key.

**Header:** `x-admin-secret: <ADMIN_SECRET>`  
— or — query param `?secret=<ADMIN_SECRET>`

---

### `GET /health`
```json
{ "status": "ok", "uptime": 123.45 }
```

---

## Deploy to Render.com

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Blueprint**.
3. Select your repo — Render will auto-detect `render.yaml`.
4. The `ADMIN_SECRET` is auto-generated. Find it in **Environment** after deploy.
5. Your server will be live at `https://<service-name>.onrender.com`.

> **Persistent disk**: `render.yaml` mounts a 1 GB disk at `/data`. Update `KEYS_FILE` in `server.js` to `/data/keys.json` for production persistence across deploys.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_SECRET` | `changeme-admin-secret` | Admin panel password — **change this!** |

---

## File Structure

```
epic-fermi/
  server.js        Main Express server
  keys.json        JSON key database (auto-created)
  package.json
  .gitignore
  render.yaml      Render.com deployment config
  README.md
  public/
    admin.html     Bootstrap admin panel
```
