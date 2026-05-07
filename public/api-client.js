(function (global) {
  // ─── Config ──────────────────────────────────────────────────────────────────
  const API_BASE = "/api/trpc";
  const APP_SCHEME = "manus20260209214049";

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
      body: JSON.stringify({ json: input ?? {} }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${procedure}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result?.data;
  }

  // ─── Anthropic AI Integration ────────────────────────────────────────────────
  const Anthropic = {
    generateVenueDescription: async (venueName, category, amenities) => {
      try {
        const result = await trpcMutation("anthropic.generateDescription", {
          venueName,
          category,
          amenities
        });
        return result?.description || "";
      } catch (err) {
        console.error("Anthropic description error:", err);
        return "";
      }
    },

    generateSearchSuggestions: async (query) => {
      try {
        const result = await trpcMutation("anthropic.searchSuggestions", { query });
        return result?.suggestions || [];
      } catch (err) {
        console.error("Anthropic suggestions error:", err);
        return [];
      }
    },

    recommendVenues: async (preferences) => {
      try {
        const result = await trpcMutation("anthropic.recommendVenues", preferences);
        return result?.recommendations || [];
      } catch (err) {
        console.error("Anthropic recommendations error:", err);
        return [];
      }
    },

    analyzeReviews: async (venueId) => {
      try {
        const result = await trpcMutation("anthropic.analyzeReviews", { venueId });
        return result?.analysis || "";
      } catch (err) {
        console.error("Anthropic review analysis error:", err);
        return "";
      }
    }
  };

  // ─── API Methods (mirror the app's tRPC routes) ───────────────────────────────
  const Venues = {
    list: (input = {}) => trpcQuery("venues.list", input),
    getById: (id) => trpcQuery("venues.getById", { id }),
    myVenues: () => trpcQuery("venues.myVenues", {}),
  };

  const Auth_API = {
    login: async (email, password) => {
      const result = await trpcMutation("auth.loginEmail", { email, password });
      if (result?.token) {
        Auth.setToken(result.token);
        Auth.setUser(result.user);
      }
      return result;
    },

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
    build: (path, fallbackUrl) => {
      return `${APP_SCHEME}://${path}`;
    },

    openVenue: (venueId) => {
      const appUrl = `${APP_SCHEME}://venue/${venueId}`;
      const webUrl = `/venues/${venueId}`;
      window.location.href = appUrl;
      setTimeout(() => {
        if (!document.hidden) window.location.href = webUrl;
      }, 1500);
    },

    openHostDashboard: () => {
      window.location.href = `${APP_SCHEME}://host-dashboard`;
    },

    openBookings: () => {
      window.location.href = `${APP_SCHEME}://bookings`;
    },
  };

  // ─── QR Code Generator ────────────────────────────────────────────────────────
  const QR = {
    imageUrl: (data, size = 200) => {
      return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data )}`;
    },

    appDownload: (platform = "universal") => {
      const urls = {
        ios: "https://apps.apple.com/app/partyspace/id000000000",
        android: "https://play.google.com/store/apps/details?id=space.manus.partyspace.app.t20260209214049",
        universal: "https://partyspace.com/download",
      };
      return QR.imageUrl(urls[platform] || urls.universal );
    },

    venue: (venueId) => {
      return QR.imageUrl(`${APP_SCHEME}://venue/${venueId}`);
    },

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

  async function getVenuesWithFallback(filters = {} ) {
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
    anthropic: Anthropic,
    getVenuesWithFallback,
    APP_SCHEME,
    DEMO_VENUES,
  };
})(window);
