/**
 * PartySpace Website Server — Node.js 24
 *
 * Serves the static website AND proxies API calls to the tRPC backend.
 * This means the website and app share ONE backend with NO CORS issues.
 *
 * Routes:
 *   GET  /              → public/index.html
 *   GET  /api/trpc/*    → proxied to TRPC_API_URL (the real backend)
 *   POST /api/trpc/*    → proxied to TRPC_API_URL (the real backend)
 *   GET  /.well-known/* → served from public/.well-known/ (Universal Links)
 *   GET  /*             → public/index.html (SPA fallback)
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ─── tRPC Backend URL ─────────────────────────────────────────────────────────
// Set TRPC_API_URL in your .env or hosting environment variables.
// Example: https://partyspace-api.railway.app/trpc
// If not set, API calls will return a 503 with a helpful message.
const TRPC_API_URL = process.env.TRPC_API_URL || "";

// ─── MIME Types ───────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

// ─── Static File Server ───────────────────────────────────────────────────────
function serveStatic(res, filePath, ext) {
  try {
    const content = readFileSync(filePath);
    const isHtml = ext === ".html";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": isHtml ? "no-cache, no-store" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Security headers
      ...(isHtml && {
        "X-Frame-Options": "SAMEORIGIN",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      }),
    });
    res.end(content);
  } catch {
    serveIndex(res);
  }
}

function serveIndex(res) {
  try {
    const content = readFileSync(join(__dirname, "public", "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("Server error — index.html not found");
  }
}

// ─── API Proxy to tRPC Backend ────────────────────────────────────────────────
// Forwards /api/trpc/* → TRPC_API_URL/*
// This lets the website and app share the exact same backend.
async function proxyToTRPC(req, res, trpcPath) {
  if (!TRPC_API_URL) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "TRPC_API_URL not configured. Set this environment variable to your PartySpace backend URL (e.g. https://api.partyspace.com/trpc)",
        },
      })
    );
    return;
  }

  const targetUrl = `${TRPC_API_URL}/${trpcPath}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

  try {
    // Collect request body for mutations (POST)
    let body = "";
    if (req.method === "POST") {
      for await (const chunk of req) body += chunk;
    }

    // Forward request to tRPC backend
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        // Forward auth token from browser to backend
        ...(req.headers["authorization"] && {
          Authorization: req.headers["authorization"],
        }),
      },
      ...(body && { body }),
    });

    const data = await response.text();
    res.writeHead(response.status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: `Proxy error: ${err.message}` } }));
  }
}

// ─── Universal Links Files ────────────────────────────────────────────────────
// These tell iOS and Android to open the app instead of the browser
// for partyspace.com/venues/*, /hosts/*, /booking/*
function serveUniversalLinks(res, filename) {
  const files = {
    "apple-app-site-association": JSON.stringify({
      applinks: {
        apps: [],
        details: [
          {
            // Replace YOUR_TEAM_ID with your Apple Developer Team ID
            appID: "YOUR_TEAM_ID.space.manus.partyspace.app.t20260209214049",
            paths: ["/venues/*", "/hosts/*", "/booking/*", "/profile/*"],
          },
        ],
      },
    }),
    "assetlinks.json": JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "space.manus.partyspace.app.t20260209214049",
          // Replace with your actual SHA-256 cert fingerprint from Play Console
          sha256_cert_fingerprints: ["YOUR_SHA256_CERT_FINGERPRINT_HERE"],
        },
      },
    ]),
  };

  const content = files[filename];
  if (content) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ─── Main Request Handler ─────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(req.url.split("?")[0]);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" });
    res.end();
    return;
  }

  // ── API Proxy: /api/trpc/<procedure> ──────────────────────────────────────
  if (pathname.startsWith("/api/trpc/")) {
    const trpcPath = pathname.replace("/api/trpc/", "");
    await proxyToTRPC(req, res, trpcPath);
    return;
  }

  // ── Universal Links ───────────────────────────────────────────────────────
  if (pathname.startsWith("/.well-known/")) {
    const filename = pathname.replace("/.well-known/", "");
    serveUniversalLinks(res, filename);
    return;
  }

  // ── Static Files ──────────────────────────────────────────────────────────
  const ext = extname(pathname);
  if (ext && ext !== ".html") {
    const filePath = join(__dirname, "public", pathname);
    if (existsSync(filePath)) {
      serveStatic(res, filePath, ext);
      return;
    }
  }

  // ── SPA Fallback → index.html ─────────────────────────────────────────────
  serveIndex(res);
});

server.listen(PORT, () => {
  console.log(`\n🎉 PartySpace website running on http://localhost:${PORT}`);
  console.log(`   Node.js ${process.version}`);
  console.log(`   tRPC Backend: ${TRPC_API_URL || "⚠️  Not configured (set TRPC_API_URL)"}\n`);
});
