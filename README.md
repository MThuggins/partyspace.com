# PartySpace Website 🎉
> Fully integrated with the PartySpace mobile app (Expo / React Native)

---

## What's in this repo

```
partyspace-integrated/
├── public/
│   ├── index.html              ← Website (fetches live venues from your API)
│   ├── api-client.js           ← Browser API client (mirrors app's tRPC calls)
│   └── .well-known/
│       ├── apple-app-site-association   ← iOS Universal Links
│       └── assetlinks.json              ← Android App Links
├── server.js                   ← Node 24 server + API proxy (no CORS)
├── netlify.toml                ← Netlify deployment config
├── package.json                ← engines: node >=24
├── .nvmrc                      ← pins node 24
├── .env.example                ← environment variables template
└── INTEGRATION.md              ← full architecture docs
```

---

## How the App ↔ Website integration works

```
Mobile App (Expo)          Website (this repo)
      │                           │
      └──── same tRPC backend ────┘
                   │
              TiDB Cloud DB

Shared: auth tokens · venue data · bookings · messages · reviews
```

### 5 integration points built in:

| Feature | How it works |
|---|---|
| **Shared API** | `api-client.js` calls the exact same tRPC routes the app uses |
| **Shared Auth** | Login once on web or app — JWT token works on both |
| **Deep Links** | "Open in App" buttons on every venue card use `manus20260209214049://venue/[id]` |
| **QR Codes** | Auto-generated QR codes link to app download + individual venues |
| **Universal Links** | `/.well-known/` files make `partyspace.com/venues/42` open the app directly |

---

## Quick Start

```bash
# 1. Ensure Node 24
node -v   # v24.x.x  (run: nvm install 24 && nvm use 24 if needed)

# 2. Copy env file
cp .env.example .env

# 3. (Optional) Add your backend URL to .env
# TRPC_API_URL=https://your-api.railway.app/trpc
# Without this the site shows demo venues automatically

# 4. Run
npm run dev
# → http://localhost:3000
```

The site works out of the box with **demo venues** if no backend URL is set.
A yellow banner appears at the top when demo mode is active.

---

## Connecting to your real backend

The mobile app already has a working tRPC backend. All you need is its URL.

**Step 1 — Find your backend URL**

Check the app source for where `EXPO_PUBLIC_API_URL` or the tRPC URL is set.
It will look like `https://something.railway.app` or `https://something.render.com`.

**Step 2 — Set it in two places**

Local (`.env`):
```
TRPC_API_URL=https://your-api.railway.app/trpc
```

Netlify (Site settings → Environment variables):
```
TRPC_API_URL = https://your-api.railway.app/trpc
```

**Step 3 — Update `netlify.toml`**

Replace the proxy redirect URL:
```toml
[[redirects]]
  from = "/api/trpc/*"
  to = "https://your-api.railway.app/trpc/:splat"   # ← your real URL
```

That's it. The website now reads and writes the same database as the app.

---

## Deploy to Netlify

```
1. Push this folder to GitHub
2. netlify.com → Add new site → Import from GitHub
3. Build command:     (leave blank)
4. Publish directory: public
5. Add environment variable: TRPC_API_URL = your backend URL
6. Deploy
```

Node 24 is set automatically via `netlify.toml` → `NODE_VERSION = "24"`.

---

## Activate Universal Links (optional but recommended)

Universal Links make `https://partyspace.com/venues/42` open directly in
the app instead of the browser when the app is installed.

**iOS:**
1. Get your Apple Team ID from developer.apple.com
2. Edit `public/.well-known/apple-app-site-association`:
   ```json
   "appID": "YOUR_ACTUAL_TEAM_ID.space.manus.partyspace.app.t20260209214049"
   ```

**Android:**
1. Get your SHA-256 cert fingerprint from Google Play Console →
   Setup → App integrity → App signing key certificate
2. Edit `public/.well-known/assetlinks.json`:
   ```json
   "sha256_cert_fingerprints": ["AA:BB:CC:...your real fingerprint..."]
   ```

Both files are already served at the correct URLs by the server.

---

## Deep link scheme

The app's deep link scheme (from `app.config.ts`) is:
```
manus20260209214049
```

Example deep links the website generates:
| Action | URL |
|---|---|
| Open venue #42 | `manus20260209214049://venue/42` |
| Open host dashboard | `manus20260209214049://host-dashboard` |
| Open bookings | `manus20260209214049://bookings` |

---

## Auth flow

```
User fills in email + password on website
  → POST /api/trpc/auth.loginEmail  (proxied to your backend)
  → Response: { success: true, token: "jwt...", user: {...} }
  → Token stored in localStorage

Same token works in the app (stored in SecureStore)
Both platforms hit the same /auth.loginEmail endpoint
```
