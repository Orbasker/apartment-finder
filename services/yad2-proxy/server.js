import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8080);
const PROXY_SECRET = process.env.PROXY_SECRET ?? "";
const ALLOWED_HOSTS = new Set(["www.yad2.co.il", "gw.yad2.co.il", "m.yad2.co.il", "yad2.co.il"]);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20000);

const UPSTREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
  Referer: "https://www.yad2.co.il/",
  Origin: "https://www.yad2.co.il",
};

if (!PROXY_SECRET) {
  console.error("PROXY_SECRET is required");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method !== "GET" || url.pathname !== "/fetch") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  const providedSecret = req.headers["x-proxy-secret"];
  if (providedSecret !== PROXY_SECRET) {
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("unauthorized");
    return;
  }

  const target = url.searchParams.get("url");
  if (!target) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("missing ?url=");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("invalid url");
    return;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("host not allowed");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: UPSTREAM_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
    };
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) headers["cache-control"] = cacheControl;

    res.writeHead(upstream.status, headers);
    res.end(body);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error("proxy upstream failed:", err);
    res.writeHead(aborted ? 504 : 502, { "content-type": "text/plain" });
    res.end(aborted ? "upstream timeout" : "upstream error");
  } finally {
    clearTimeout(timer);
  }
});

server.listen(PORT, () => {
  console.log(`yad2-proxy listening on :${PORT}`);
});
