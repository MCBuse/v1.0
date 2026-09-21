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
  if (url.pathname.startsWith("/api/v1/staff/")) {
    if (!["staff-access", "staff-refreshed"].includes(token)) {
      send(response, token && token !== "expired-access" ? 403 : 401, { message: "Credit analyst access required" });
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
