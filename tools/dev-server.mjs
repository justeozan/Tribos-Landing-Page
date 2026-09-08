import { createServer } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const readFileP = promisify(readFile);

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.argv[2]) || Number(process.env.CONDUCTOR_PORT) || 8000;
const FUNCTION_PATH = "/v1/functions/beta-signup/executions";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
};

function loadVars() {
  const vars = { ...process.env };
  try {
    const text = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim();
    }
  } catch {
    /* pas de .env : tant pis, la function signalera la config manquante */
  }
  if (!vars.RESEND_AUDIENCE_ID) {
    vars.RESEND_AUDIENCE_ID = "c1246662-846f-4c15-84e8-ce00990d4184";
  }
  return vars;
}

const VARS = loadVars();

for (const [k, v] of Object.entries(VARS)) {
  if (!(k in process.env)) process.env[k] = v;
}

function send(res, status, json) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function runBetaSignup(reqBody) {
  const fn = await import("./../functions/beta-signup/index.js").catch((e) => {
    return { error: e };
  });
  if (fn.error) throw fn.error;

  const result = {};
  const ctx = {
    req: {
      body: String(reqBody || ""),
      bodyRaw: String(reqBody || ""),
      headers: {},
      method: "POST",
      host: `127.0.0.1:${PORT}`,
      scheme: "http",
      query: {},
      queryString: "",
      port: PORT,
      url: "/",
      path: "/",
      variables: VARS,
    },
    res: {
      json: (obj, status = 200) => {
        result.status = status;
        result.payload = obj;
      },
    },
    log: (...a) => console.log("[function]", ...a),
    error: (...a) => console.error("[function]", ...a),
    env: VARS,
  };

  await fn.default(ctx);
  if (!result.status) {
    result.status = 200;
    result.payload = { success: true };
  }
  return result;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;

  if (req.method === "POST") {
    if (url.pathname !== FUNCTION_PATH) {
      send(res, 404, { success: false, error: "Endpoint inconnu." });
      return;
    }
    let bodyString = raw;
    if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.body === "string") bodyString = parsed.body;
      } catch {
        /* laissé tel quel */
      }
    }
    try {
      const out = await runBetaSignup(bodyString);
      send(res, 200, { statusCode: out.status, response: JSON.stringify(out.payload) });
    } catch (e) {
      console.error("[dev-server] function error:", e);
      send(res, 500, { statusCode: 500, response: JSON.stringify({ success: false, error: "Function error." }) });
    }
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const target = normalize(join(ROOT, pathname));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFileP(target);
    const type = MIME[extname(target)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    try {
      const data = await readFileP(join(ROOT, "404.html"));
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("404");
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Tribos dev server (site + function beta-signup) → http://127.0.0.1:${PORT}`);
});