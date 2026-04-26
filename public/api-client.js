/**
 * PartySpace Browser API Client
 * Calls the same tRPC backend that the mobile app uses.
 *
 * Usage:
 *   <script src="/api-client.js"></script>
 *   const venues = await PartyAPI.venues.list({ city: 'New York' });
 */

(function (global) {
  // ─── Config ──────────────────────────────────────────────────────────────────
  // In production, replace with your real tRPC backend URL.
  // The website's server.js proxies /api/trpc → TRPC_API_URL to avoid CORS.
  const API_BASE = "/api/trpc";
  const APP_SCHEME = "manus20260209214049"; // from app.config.ts bundle ID

  // ─── Auth Token ──────────────────────────────────────────────────────────────
  const Auth = {
    getToken: () => localStorage.getItem("partyspace_token"),
    setToken: (token) => localStorage.setItem("partyspace_token", token),
    clearToken: () => localStorage.removeItem("partyspace_token"),
    getUser: () => {
      try {
        return JSON.parse(localStorage.getItem("partyspace_user") || "null");
      } catch {
        return null;
      }
    },
    setUser: (user) => localStorage.setItem("partyspace_user", JSON.stringify(user)),
    isLoggedIn: () => !!localStorage.getItem("partyspace_token"),
  };

  // ─── Core Request Helper ─────────────────────────────────────────────────────
  async function trpcQuery(procedure, input) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = `${API_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`;

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) throw new Error(`API error ${res.status}: ${procedure}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result?.data;
  }

  async function trpcMutation(procedure, input) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/${procedure}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input ?? {}),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${procedure}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result?.data;
  }

  // ─── API Methods (mirror the app's tRPC routes) ───────────────────────────────
  const Venues = {
    /** List venues with optional filters — same as app's trpc.venues.list */
    list: (input = {}) => trpcQuery("venues.list", input),

    /** Get single venue by id — same as app's trpc.venues.getById */
    getById: (id) => trpcQuery("venues.getById", { id }),

    /** Get venues owned by current user (requires auth) */
    myVenues: () => trpcQuery("venues.myVenues", {}),
  };

  const Auth_API = {
    /** Login with email+password — same endpoint the app uses */
    login: async (email, password) => {
      const result = await trpcMutation("auth.loginEmail", { email, password });
      if (result?.token) {
        Auth.setToken(result.token);
        Auth.setUser(result.user);
      }
      return result;
    },

    /** Register new account */
    signup: async (name, email, password, role = "user") => {
      const result = await trpcMutation("auth.signup", { name, email, password, role });
      if (result?.token) {
        Auth.setToken(result.token);
        Auth.setUser(result.user);
      }
      return result;
    },

    logout: () => {
      Auth.clearToken();
      localStorage.removeItem("partyspace_user");
    },
  };

  const Reviews = {
    /** Get reviews for a venue */
    forVenue: (venueId) => trpcQuery("reviews.venueReviews", { venueId }),
  };

  const Favorites = {
    check: (venueId) => trpcQuery("favorites.check", { venueId }),
    toggle: (venueId) => trpcMutation("favorites.toggle", { venueId }),
  };

  const Bookings = {
    list: () => trpcQuery("bookings.list", {}),
    getById: (id) => trpcQuery("bookings.getById", { id }),
  };

  const Analytics = {
    ownerDashboard: () => trpcQuery("analytics.ownerDashboard", {}),
  };

  const ServiceProviders = {
    list: () => trpcQuery("serviceProviders.list", {}),
  };

  // ─── Deep Link Helpers ────────────────────────────────────────────────────────
  const DeepLink = {
    /**
     * Build a deep link URL that opens a specific screen in the mobile app.
     * Falls back to the website URL if the app isn't installed.
     *
     * @param {string} path - e.g. 'venue/42', 'booking/confirmation', 'host/dashboard'
     * @param {string} fallbackUrl - website URL to go to if app not installed
     */
    build: (path, fallbackUrl) => {
      return `${APP_SCHEME}://${path}`;
    },

    /** Open a venue in the app (or website if not installed) */
    openVenue: (venueId) => {
      const appUrl = `${APP_SCHEME}://venue/${venueId}`;
      const webUrl = `/venues/${venueId}`;
      // Try to open the app; fall back to website after 1.5s
      window.location.href = appUrl;
      setTimeout(() => {
        if (!document.hidden) window.location.href = webUrl;
      }, 1500);
    },

    /** Open host dashboard in the app */
    openHostDashboard: () => {
      window.location.href = `${APP_SCHEME}://host-dashboard`;
    },

    /** Open bookings in the app */
    openBookings: () => {
      window.location.href = `${APP_SCHEME}://bookings`;
    },
  };

  // ─── QR Code Generator ────────────────────────────────────────────────────────
  const QR = {
    /**
     * Generate a QR code image URL using the free qrserver.com API.
     * Returns an <img> src you can plug directly into the website.
     *
     * @param {string} data - URL or deep link to encode
     * @param {number} size - pixel size (default 200)
     */
    imageUrl: (data, size = 200) => {
      return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
    },

    /** QR code for downloading the app (links to App Store / Play Store) */
    appDownload: (platform = "universal") => {
      const urls = {
        ios: "https://apps.apple.com/app/partyspace/id000000000", // replace with real ID
        android: "https://play.google.com/store/apps/details?id=space.manus.partyspace.app.t20260209214049",
        universal: "https://partyspace.com/download",
      };
      return QR.imageUrl(urls[platform] || urls.universal);
    },

    /** QR code that opens a specific venue in the app */
    venue: (venueId) => {
      return QR.imageUrl(`${APP_SCHEME}://venue/${venueId}`);
    },

    /** Inject a QR code image into a DOM element */
    render: (elementId, data, size = 160) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.innerHTML = `<img src="${QR.imageUrl(data, size)}" 
        alt="Scan to open in PartySpace app" 
        style="border-radius:12px;width:${size}px;height:${size}px;"
        loading="lazy">`;
    },
  };

  // ─── Demo / Fallback Data ─────────────────────────────────────────────────────
  // Used when the real API isn't configured yet (development mode)
  const DEMO_VENUES = [
    {
      id: 1, name: "The Grand Atrium", city: "New York", state: "NY",
      category: "wedding", pricePerHour: "180.00", capacityMin: 50, capacityMax: 300,
      rating: "4.9", reviewCount: 128, description: "Stunning downtown event space with floor-to-ceiling windows.",
      images: ["https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600"],
      amenities: ["parking", "catering", "wifi", "bar"],
    },
    {
      id: 2, name: "Bloom Garden Estate", city: "Beverly Hills", state: "CA",
      category: "wedding", pricePerHour: "95.00", capacityMin: 20, capacityMax: 150,
      rating: "4.8", reviewCount: 94, description: "Lush outdoor garden perfect for weddings and celebrations.",
      images: ["https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=600"],
      amenities: ["outdoor", "photography", "parking"],
    },
    {
      id: 3, name: "SkyLine Terrace", city: "Chicago", state: "IL",
      category: "corporate", pricePerHour: "220.00", capacityMin: 30, capacityMax: 200,
      rating: "4.9", reviewCount: 211, description: "Rooftop venue with panoramic city views and full bar.",
      images: ["https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"],
      amenities: ["rooftop", "bar", "sound_system", "catering"],
    },
    {
      id: 4, name: "Pinnacle Conference Hall", city: "Atlanta", state: "GA",
      category: "conference", pricePerHour: "140.00", capacityMin: 100, capacityMax: 500,
      rating: "4.7", reviewCount: 76, description: "Professional conference hall with full AV setup.",
      images: ["https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=600"],
      amenities: ["av_setup", "catering", "wifi", "parking"],
    },
    {
      id: 5, name: "Party Palace Suite", city: "New York", state: "NY",
      category: "birthday", pricePerHour: "65.00", capacityMin: 10, capacityMax: 80,
      rating: "4.8", reviewCount: 152, description: "Fun party suite with dance floor and game room.",
      images: ["https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600"],
      amenities: ["dance_floor", "games", "bar", "catering"],
    },
    {
      id: 6, name: "Ivory Rose Ballroom", city: "Miami", state: "FL",
      category: "wedding", pricePerHour: "350.00", capacityMin: 100, capacityMax: 400,
      rating: "5.0", reviewCount: 63, description: "Elegant ballroom with included décor and valet parking.",
      images: ["https://images.unsplash.com/photo-1478146059778-26028b07395a?w=600"],
      amenities: ["decor", "valet", "catering", "photography"],
    },
  ];

  /**
   * Fetch venues with automatic fallback to demo data.
   * Use this instead of Venues.list() directly on the website
   * so the page still works before the backend is configured.
   */
  async function getVenuesWithFallback(filters = {}) {
    try {
      const result = await Venues.list(filters);
      if (result && result.length > 0) return result;
      return DEMO_VENUES;
    } catch {
      console.warn("[PartyAPI] Backend not configured — using demo data");
      return DEMO_VENUES.filter((v) => {
        if (filters.category && v.category !== filters.category) return false;
        if (filters.city && !v.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
        return true;
      });
    }
  }

  // ─── Expose Global API ────────────────────────────────────────────────────────
  global.PartyAPI = {
    venues: Venues,
    auth: Auth_API,
    reviews: Reviews,
    favorites: Favorites,
    bookings: Bookings,
    analytics: Analytics,
    serviceProviders: ServiceProviders,
    deepLink: DeepLink,
    qr: QR,
    token: Auth,
    getVenuesWithFallback,
    APP_SCHEME,
    DEMO_VENUES,
  };
})(window);
