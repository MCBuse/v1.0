import { createServer } from "node:http";
import process from "node:process";

const host = "127.0.0.1";
const port = 4011;

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(payload === undefined ? undefined : JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function bearer(request) {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
}

function isMerchantAccess(token) {
  return ["test-only", "merchant-access", "refreshed-access"].includes(token);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    return send(response, 200, { status: "ok" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    const body = await readJson(request).catch(() => ({}));
    if (
      body.email === "merchant@example.test" &&
      body.password === "merchant-password"
    )
      return send(response, 200, {
        accessToken: "merchant-access",
        refreshToken: "merchant-refresh",
      });
    if (
      body.email === "consumer@example.test" &&
      body.password === "consumer-password"
    )
      return send(response, 200, {
        accessToken: "consumer-access",
        refreshToken: "consumer-refresh",
      });
    return send(response, 401, { message: "Unauthorized" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
    const body = await readJson(request).catch(() => ({}));
    if (["merchant-refresh", "expired-refresh"].includes(body.refreshToken))
      return send(response, 200, {
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
      });
    return send(response, 401, { message: "Unauthorized" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
    return send(response, 204);
  }

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me") {
    if (bearer(request) === "consumer-access")
      return send(response, 403, {
        message: "Merchant access is not provisioned",
      });
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
      id: "00000000-0000-4000-8000-000000000001",
      businessName: "Test Merchant",
      timezone: "Europe/Berlin",
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me/products") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 1,
    });
  }

  return send(response, 404, { message: "Not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`Portal test API listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
