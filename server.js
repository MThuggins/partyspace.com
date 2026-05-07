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
const PORT = process.env.PORT || 3001;

// ─── tRPC Backend URL ─────────────────────────────────────────────────────────
// Set TRPC_API_URL in your .env or hosting environment variables.
// Example: https://partyspace-api.railway.app/trpc
// If not set, API calls will return a 503 with a helpful message.
const TRPC_API_URL = process.env.TRPC_API_URL || "http://localhost:3000/api/trpc";

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
async function proxyToTRPC(req, res, trpcPath) {
  if (!TRPC_API_URL) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "TRPC_API_URL not configured. Set this environment variable to your PartySpace backend URL.",
        },
      })
    );
    return;
  }

  const targetUrl = `${TRPC_API_URL}/${trpcPath}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

  try {
    let body = "";
    if (req.method === "POST") {
      for await (const chunk of req) body += chunk;
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
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
function serveUniversalLinks(res, filename) {
  const files = {
    "apple-app-site-association": JSON.stringify({
      applinks: {
        apps: [],
        details: [
          {
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
          packa
