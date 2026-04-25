# PartySpace — App ↔ Website Integration Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PartySpace Ecosystem                  │
│                                                         │
│  ┌──────────────┐         ┌──────────────────────────┐  │
│  │  Mobile App  │         │      Website             │  │
│  │ (Expo/RN)    │◄───────►│  (Node.js + HTML)        │  │
│  │              │         │                          │  │
│  │  tRPC Client │         │  tRPC Client (browser)   │  │
│  └──────┬───────┘         └───────────┬──────────────┘  │
│         │                             │                  │
│         └──────────┬──────────────────┘                  │
│                    │                                     │
│            ┌───────▼────────┐                           │
│            │  tRPC Backend  │                           │
│            │  (Node.js API) │                           │
│            └───────┬────────┘                           │
│                    │                                     │
│            ┌───────▼────────┐                           │
│            │  TiDB Cloud    │                           │
│            │  (MySQL)       │                           │
│            └────────────────┘                           │
└─────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Shared tRPC API
Both the mobile app and website call the same backend API.

**Key API routes (from app source):**
| Route | Description |
|---|---|
| `venues.list` | List venues with city/category filters |
| `venues.getById` | Single venue detail |
| `venues.myVenues` | Host's own venues |
| `auth.loginEmail` | Email + password login |
| `analytics.ownerDashboard` | Host dashboard stats |
| `reviews.venueReviews` | Reviews for a venue |
| `serviceProviders.list` | List service providers |
| `favorites.check` | Check if venue is favorited |
| `favorites.toggle` | Toggle favorite |
| `bookings.*` | Booking management |
| `messages.*` | Messaging |

**Website API Client** (`public/api-client.js`):
```js
// Set your tRPC backend URL in .env
TRPC_API_URL=https://your-backend.com/trpc

// Usage in website JS:
const venues = await api.venues.list({ city: 'New York', category: 'wedding' });
```

### 2. Authentication Sharing (SSO)
The app uses JWT tokens stored in secure storage. The website shares the same auth system.

**Flow:**
```
User logs in on Website
  → POST /trpc/auth.loginEmail
  → Receives JWT token
  → Store in localStorage (website)
  → Include as Authorization: Bearer <token> header on all API calls

User logs in on App  
  → Same endpoint, same token format
  → Stored in SecureStore (mobile)

Token is valid on BOTH platforms — same backend validates it.
```

**Website login implementation:** See `public/auth.js`

### 3. Deep Links (App ↔ Web)

The app's deep link scheme is: `manus20260209214049`

**From Website → App:**
```html
<!-- Open a specific venue in the app -->
<a href="manus20260209214049://venue/42">Open in App</a>

<!-- Universal link fallback (if app not installed, goes to website) -->
<a href="https://partyspace.com/venues/42" 
   data-app-link="manus20260209214049://venue/42">
  View Venue
</a>
```

**From App → Website:**
The app's `shareBooking` and social sharing functions already generate
`https://partyspace.com/venues/[id]` style links. When users share a venue,
those links open the website, which shows the venue detail and a 
"Open in App" button.

### 4. QR Codes
QR codes on the website link to the app store or deep link into the app.

**Download QR:** Links to App Store / Play Store
**Venue QR:** Encodes `manus20260209214049://venue/[id]` — scanning opens the venue directly in the app

### 5. Universal Links Setup (HTTPS deep links)

For seamless app opening from web links, set up Apple Universal Links and
Android App Links. Place these files at your domain root:

**`/.well-known/apple-app-site-association`** (iOS):
```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAMID.space.manus.partyspace.app.t20260209214049",
      "paths": ["/venues/*", "/hosts/*", "/booking/*"]
    }]
  }
}
```

**`/.well-known/assetlinks.json`** (Android):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "space.manus.partyspace.app.t20260209214049",
    "sha256_cert_fingerprints": ["YOUR_APP_SHA256_HERE"]
  }
}]
```

### 6. Database Schema Reference

```sql
-- Core tables (TiDB / MySQL)
users          (id, openId, name, email, role, isVenueOwner, isServiceProvider, avatar)
venues         (id, ownerId, name, description, address, city, state, category,
                capacityMin, capacityMax, pricePerHour, amenities JSON, images JSON,
                rating, reviewCount, bookingCount, isActive)
featuredVenues (id, venueId, startDate, endDate, monthlyPrice, status, stripeSubscriptionId)
bookingCommissions (id, bookingId, venueId, bookingAmount, commissionRate, commissionAmount, status)
revenueTracking    (id, venueId, month, featuredVenueRevenue, commissionRevenue, totalRevenue)
```

## Environment Variables

Both the app and website need these:

```bash
# Backend API
TRPC_API_URL=https://your-api.com/trpc

# Database (backend only)
DATABASE_URL=mysql://user:pass@gateway.tidbcloud.com:4000/dbname

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# JWT
JWT_SECRET=your-secret-here

# App
EXPO_PUBLIC_API_URL=https://your-api.com/trpc
```

## Deployment Architecture

```
partyspace.com          → Netlify (static website)
api.partyspace.com      → Your Node.js tRPC backend (Railway / Render / Heroku)
db.partyspace.com       → TiDB Cloud (already configured in app)
```

## File Structure (this repo)

```
partyspace/
├── public/
│   ├── index.html          ← Main website (fetches real API data)
│   ├── api-client.js       ← Browser tRPC client
│   ├── auth.js             ← Shared auth (JWT)
│   └── .well-known/
│       ├── apple-app-site-association
│       └── assetlinks.json
├── server.js               ← Node 24 server + API proxy
├── src/
│   └── api-proxy.js        ← Forwards /api/* to tRPC backend
├── netlify.toml
├── package.json
└── INTEGRATION.md          ← This file
```
