/**
 * Classificação de erros Places API (New) — sem chamadas de rede.
 * npx tsx scripts/places-api-new-errors.test.ts
 */
import assert from "node:assert/strict";
import { classifyPlacesApiError, humanizePlacesApiError } from "../src/lib/lead-motor/places-api-new";

assert.equal(
  classifyPlacesApiError(403, "You're calling a legacy API, which is not enabled for your project."),
  "legacy_api"
);
assert.equal(classifyPlacesApiError(403, "Places API (New) has not been used in project"), "api_disabled");
assert.equal(classifyPlacesApiError(429, "Quota exceeded"), "quota");
assert.ok(humanizePlacesApiError("billing", "").includes("Faturamento"));

console.log("places-api-new-errors.test: OK");
