const credit = {
  status: "ready",
  modelVersion: "george-html-2026.09.1",
  businessAgeMonths: 80,
  unavailableFields: [],
  financialProfile: { score: 62.3, scale: "0-100", breakdown: {} },
  profileConfidence: {
    label: "Medium",
    confidenceScore: 70,
    coveragePct: 69.2,
    dataReliabilityQualityPct: 70.8,
    fieldsFilled: 18,
    fieldsTotal: 26,
  },
  missingReasons: {},
  indicators: { verified_sales_eur: 1121 },
  provenance: { verified_sales_eur: "synthetic_demonstration" },
  integritySummary: ["Synthetic demonstration only; not merchant performance."],
};
let profile = {};
let consent = false;
const records = [];
// Change Intelligence operator ("Update now", plan §8). Token: operator-access.
const changeMerchants = [
  {
    merchantId: "7a0f6c1e-4a52-4c1f-9a64-0e7b8a5d2c11",
    publicId: "mrc_88d1fb39ebb04b24bb42",
    businessName: "Aci Café",
    ownerEmail: "owner@aci.example",
    lastSuccessfulUpdateAt: "2026-10-25T08:00:00.000Z",
    processing: "idle",
  },
  {
    merchantId: "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8",
    publicId: "mrc_7226ebf0b0b84c81b775",
    businessName: "MCBuse",
    ownerEmail: "fred@mcbuse.example",
    lastSuccessfulUpdateAt: null,
    processing: "failed",
  },
  {
    merchantId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    publicId: "mrc_0f1e2d3c4b5a69788796",
    businessName: "Bäckerei Nord",
    ownerEmail: "team@baeckerei.example",
    lastSuccessfulUpdateAt: "2026-10-25T07:00:00.000Z",
    processing: "pending",
  },
];
const updateNowStarted = new Map();
async function staffChangesMock(request, response, url, { send, readJson }) {
  if (url.pathname === "/api/v1/staff/me")
    send(response, 200, {
      permission: "change_intelligence_operator",
      permissions: ["change_intelligence_operator"],
    });
  else if (url.pathname === "/api/v1/staff/changes/merchants") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    send(response, 200, {
      merchants: changeMerchants.filter(
        (m) =>
          m.businessName.toLowerCase().includes(q) ||
          (m.ownerEmail ?? "").toLowerCase().includes(q),
      ),
    });
  } else if (
    url.pathname === "/api/v1/staff/changes/update-now" &&
    request.method === "POST"
  ) {
    const body = await readJson(request);
    const merchant = changeMerchants.find(
      (m) => m.merchantId === body.merchantId,
    );
    if (!body.reason?.trim() || body.reason.length > 200)
      send(response, 400, { message: ["reason should not be empty"] });
    else if (!merchant) send(response, 404, { message: "Not Found" });
    else {
      const last = updateNowStarted.get(merchant.merchantId) ?? 0;
      const recent = Date.now() - last < 60_000;
      if (!recent) updateNowStarted.set(merchant.merchantId, Date.now());
      send(response, 202, { status: recent ? "already_running" : "queued" });
    }
  } else send(response, 403, { message: "Credit analyst access required" });
  return true;
}
export async function creditPilotMock(
  request,
  response,
  url,
  { send, readJson, bearer },
) {
  const token = bearer(request);
  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    // Only consume this request when it is handled here; caller supplies parsed login.
    return false;
  }
  if (url.pathname.startsWith("/api/v1/staff/") && token === "operator-access")
    return staffChangesMock(request, response, url, { send, readJson });
  if (
    url.pathname.startsWith("/api/v1/staff/changes/") &&
    ["staff-access", "staff-refreshed"].includes(token)
  ) {
    send(response, 403, {
      message: "Change Intelligence operator access required",
    });
    return true;
  }
  if (url.pathname.startsWith("/api/v1/staff/")) {
    if (!["staff-access", "staff-refreshed"].includes(token)) {
      send(response, token && token !== "expired-access" ? 403 : 401, {
        message: "Credit analyst access required",
      });
      return true;
    }
    if (url.pathname === "/api/v1/staff/me")
      send(response, 200, { permission: "credit_analyst" });
    else if (url.pathname.endsWith("/merchants"))
      send(response, 200, {
        merchants: [],
        syntheticExamples: ["complete", "missing-margin", "optional-missing"],
      });
    else if (url.pathname.endsWith("/model"))
      send(response, 200, {
        modelVersion: "george-html-2026.09.1",
        validationStatus: "experimental_synthetic_only",
        predictionHorizon: null,
      });
    else if (
      url.pathname === "/api/v1/staff/credit-assessments" &&
      request.method === "POST"
    ) {
      const body = await readJson(request);
      const missing = body.exampleId === "missing-margin";
      const record = {
        id: crypto.randomUUID(),
        merchantId: null,
        synthetic: true,
        createdAt: new Date().toISOString(),
        modelVersion: credit.modelVersion,
        input: {
          values: { estimated_margin_pct: missing ? null : 33.03 },
          asOfDate: "2026-09-20",
          provenance: { estimated_margin_pct: "synthetic_demonstration" },
        },
        result: {
          ...credit,
          ...(missing
            ? {
                financialProfile: null,
                unavailableFields: ["estimated_margin_pct"],
                missingReasons: {
                  estimated_margin_pct:
                    "Deliberately missing in this synthetic example.",
                },
              }
            : {}),
          experimentalCredit: missing
            ? null
            : {
                experimental: true,
                disclaimer:
                  "Experimental: synthetic training data. Not a lending decision.",
                probabilityOfDefault: 0.13,
                statisticalScore: 637,
                policyOverlayPoints: 22.5,
                creditScore: 660,
                creditGrade: "Acceptable",
                scale: "300-850",
                overlayBreakdown: {},
              },
        },
      };
      records.unshift(record);
      send(response, 201, record);
    } else if (url.pathname === "/api/v1/staff/credit-assessments")
      send(response, 200, { assessments: records });
    else {
      const r = records.find((x) => url.pathname.endsWith("/" + x.id));
      send(response, r ? 200 : 404, r ?? { message: "Not found" });
    }
    return true;
  }
  if (url.pathname === "/api/v1/merchants/me/credit-profile") {
    if (!["test-only", "merchant-access", "refreshed-access"].includes(token)) {
      send(response, 403, { message: "Merchant access required" });
      return true;
    }
    if (request.method === "PATCH")
      profile = { ...profile, ...(await readJson(request)).data };
    send(response, 200, profile);
    return true;
  }
  if (url.pathname === "/api/v1/merchants/me/credit-pilot-consent") {
    if (!["test-only", "merchant-access", "refreshed-access"].includes(token)) {
      send(response, 403, { message: "Merchant access required" });
      return true;
    }
    if (request.method === "POST") consent = (await readJson(request)).active;
    send(response, 200, {
      active: consent,
      purpose: "credit_pilot_assessment",
      version: "2026-09-credit-pilot-v1",
      recordedAt: null,
    });
    return true;
  }
  return false;
}
