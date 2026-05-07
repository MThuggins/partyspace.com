(function (global) {
  const API_BASE = "/api/trpc";
  const APP_SCHEME = "manus20260209214049";

  const Auth = {
    getToken: () => localStorage.getItem("partyspace_token"),
    setToken: (token) => localStorage.setItem("partyspace_token", token),
    clearToken: () => localStorage.removeItem("partyspace_token"),
    getUser: () => {
      try {
        return JSON.parse(localStorage.getItem("partyspace_user") || "null");
      } catch { return null; }
    },
    setUser: (user) => localStorage.setItem("partyspace_user", JSON.stringify(user)),
    isLoggedIn: () => !!localStorage.getItem("partyspace_token"),
  };

  async function trpcQuery(procedure, input) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const url = `${API_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`;
    const res = await fetch(url, { method: "GET", headers, credentials: "include" });
    if (!res.ok) throw new Error(`API error ${res.status}: ${procedure}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.json?.message || json.error.message || "Unknown error");
    return json.result?.data?.json ?? json.result?.data;
  }

  async function trpcMutation(procedure, input) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/${procedure}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ json: input ?? {} }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${procedure}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.json?.message || json.error.message || "Unknown error");
    return json.result?.data?.json ?? json.result?.data;
  }

  const Venues = {
    list: (input = {}) => trpcQuery("venues.list", input),
    getById: (id) => trpcQuery("venues.getById", { id }),
    myVenues: () => trpcQuery("venues.myVenues", {}),
  };

  const Auth_API = {
    login: async (email, password) => {
      const result = await trpcMutation("auth.loginEmail", { email, password });
      if (result?.success) {
        Auth.setUser({ name: result.name, email: result.email });
      }
      return result;
    },
    signup: async (name, email, password) => {
      const result = await trpcMutation("auth.signupEmail", { name, email, password });
      if (result?.success) {
        Auth.setUser({ name, email });
      }
      return result;
    },
    logout: async () => {
      await trpcMutation("auth.logout", {});
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
    list: () => trpcQuery("bookings.myBookings", {}),
    getById: (id) => trpcQuery("bookings.getById", { id }),
  };

  const Analytics = {
    ownerDashboard: () => trpcQuery("analytics.ownerDashboard", {}),
  };

  const DeepLink = {
    openVenue: (venueId) => {
      window.location.href = `${APP_SCHEME}://venue/${venueId}`;
      setTimeout(() => { if (!document.hidden) window.location.href = `/venues/${venueId}`; }, 1500);
    },
    openHostDashboard: () => { window.location.href = `${APP_SCHEME}://host-dashboard`; },
    openBookings: () => { window.location.href = `${APP_SCHEME}://bookings`; },
  };

  const QR = {
    imageUrl: (data, size = 200) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`,
    appDownload: (platform = "universal") => {
      const urls = {
        ios: "https://apps.apple.com/app/partyspace",
        android: "https://play.google.com/store/apps/details?id=space.manus.partyspace.app.t20260209214049",
        universal: "https://partyspace.com/download",
      };
      return QR.imageUrl(urls[platform] || urls.universal);
    },
    venue: (venueId) => QR.imageUrl(`${APP_SCHEME}://venue/${venueId}`),
    render: (elementId, data, size = 160) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.innerHTML = `<img src="${QR.imageUrl(data, size)}" alt="Scan to open in PartySpace app" style="border-radius:12px;width:${size}px;height:${size}px;" loading="lazy">`;
    },
  };

  const DEMO_VENUES = [
    { id: 1, name: "The Grand Atrium", city: "New York", state: "NY", category: "wedding", pricePerHour: "180.00", capacityMin: 50, capacityMax: 300, rating: "4.9", reviewCount: 128, amenities: ["parking", "catering", "wifi", "bar"] },
    { id: 2, name: "Bloom Garden Estate", city: "Beverly Hills", state: "CA", category: "wedding", pricePerHour: "95.00", capacityMin: 20, capacityMax: 150, rating: "4.8", reviewCount: 94, amenities: ["outdoor", "photography", "parking"] },
    { id: 3, name: "SkyLine Terrace", city: "Chicago", state: "IL", category: "corporate", pricePerHour: "220.00", capacityMin: 30, capacityMax: 200, rating: "4.9", reviewCount: 211, amenities: ["rooftop", "bar", "sound_system"] },
    { id: 4, name: "Pinnacle Conference Hall", city: "Atlanta", state: "GA", category: "conference", pricePerHour: "140.00", capacityMin: 100, capacityMax: 500, rating: "4.7", reviewCount: 76, amenities: ["av_setup", "catering", "wifi"] },
    { id: 5, name: "Party Palace Suite", city: "New York", state: "NY", category: "birthday", pricePerHour: "65.00", capacityMin: 10, capacityMax: 80, rating: "4.8", reviewCount: 152, amenities: ["dance_floor", "games", "bar"] },
    { id: 6, name: "Ivory Rose Ballroom", city: "Miami", state: "FL", category: "wedding", pricePerHour: "350.00", capacityMin: 100, capacityMax: 400, rating: "5.0", reviewCount: 63, amenities: ["decor", "valet", "catering"] },
  ];

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

  global.PartyAPI = {
    venues: Venues,
    auth: Auth_API,
    reviews: Reviews,
    favorites: Favorites,
    bookings: Bookings,
    analytics: Analytics,
    deepLink: DeepLink,
    qr: QR,
    token: Auth,
    getVenuesWithFallback,
    APP_SCHEME,
    DEMO_VENUES,
  };
})(window);
