import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const TRPC_API_URL = process.env.TRPC_API_URL || "http://localhost:3000/api/trpc";

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
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("Server error — index.html not found");
  }
}

async function proxyToTRPC(req, res, trpcPath) {
  const queryString = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `${TRPC_API_URL}/${trpcPath}${queryString}`;

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
        ...(req.headers["cookie"] && {
          Cookie: req.headers["cookie"],
        }),
      },
      ...(body && { body }),
    });

    const data = await response.text();
    const setCookie = response.headers.get("set-cookie");

    res.writeHead(response.status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://localhost:3001",
      "Access-Control-Allow-Credentials": "true",
      ...(setCookie && { "Set-Cookie": setCookie }),
    });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: `Proxy error: ${err.message}` } }));
  }
}

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
          package_name: "space.manus.partyspace.app.t20260209214049",
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

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(req.url.split("?")[0]);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "http://localhost:3001",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Credentials": "true",
    });
    res.end();
    return;
  }

  if (pathname.startsWith("/api/trpc/")) {
    const trpcPath = pathname.replace("/api/trpc/", "");
    await proxyToTRPC(req, res, trpcPath);
    return;
  }

  if (pathname.startsWith("/.well-known/")) {
    const filename = pathname.replace("/.well-known/", "");
    serveUniversalLinks(res, filename);
    return;
  }

  const ext = extname(pathname);
  if (ext && ext !== ".html") {
    const filePath = join(__dirname, "public", pathname);
    if (existsSync(filePath)) {
      serveStatic(res, filePath, ext);
      return;
    }
  }

  serveIndex(res);
});

server.listen(PORT, () => {
  console.log(`\n🎉 PartySpace website running on http://localhost:${PORT}`);
  console.log(`   Node.js ${process.version}`);
  console.log(`   tRPC Backend: ${TRPC_API_URL}\n`);
});
