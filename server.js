const http = require("node:http");
const { Readable } = require("node:stream");

const PORT = Number(process.env.PORT || 8080);
const LEG = process.env.LEG || "1";

// Client-IP headers injected by the platform edge must not be forwarded:
// the target would attribute the request (and its rate-limit/quota) to the
// caller's real IP instead of this relay's egress.
const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-length",
  "x-relay-target", "x-relay-path",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto",
  "x-forwarded-server", "forwarded", "x-real-ip", "true-client-ip",
  "x-client-ip", "x-cluster-client-ip", "fastly-client-ip",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cdn-loop",
  "x-nf-client-connection-ip", "x-nf-request-id", "x-nf-geo",
  "x-vercel-forwarded-for", "x-vercel-proxied-for",
  "x-azure-clientip", "x-azure-socketip", "x-amz-cf-id",
]);

const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding"]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || "/").split("?")[0];

  if (pathname === "/__relay_health") {
    sendJson(res, 200, { ok: true, leg: LEG });
    return;
  }

  const target = req.headers["x-relay-target"];
  const relayPath = req.headers["x-relay-path"] || "/";

  if (!target) {
    sendJson(res, 400, { error: "Missing x-relay-target header" });
    return;
  }

  const targetUrl = String(target).replace(/\/$/, "") + String(relayPath);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (STRIP_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  const controller = new AbortController();
  req.on("aborted", () => controller.abort());

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: "half",
      signal: controller.signal,
    });

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (DROP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      responseHeaders[key] = value;
    });
    const cookies = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
    if (cookies.length > 0) responseHeaders["set-cookie"] = cookies;

    res.writeHead(upstream.status, responseHeaders);
    if (upstream.body) {
      const body = Readable.fromWeb(upstream.body);
      body.on("error", () => res.destroy());
      body.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 502, { error: (error && error.message) || "Relay fetch failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[relay] listening on " + PORT + " leg=" + LEG);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
