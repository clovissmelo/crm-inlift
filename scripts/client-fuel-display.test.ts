import assert from "node:assert/strict";
import {
  extractScriptSummaryFromApproachNotes,
  formatCallScriptLogAnswers,
  normalizeCallScriptLog
} from "../src/lib/call-script-log";
import {
  formatParticipatesInBrandNetwork,
  parseLeadMotorNotes,
  resolveClientFuelDisplay
} from "../src/lib/client-fuel-display";

const sample =
  "Origem: geração de leads #20\nGoogle Place ID: ChIJg5td0RxB1ZMR5JQ95u3KMv0\nProdutos ANP: ETANOL HIDRATADO COMUM (1 bicos); GASOLINA C COMUM (2 bicos)";

const parsed = parseLeadMotorNotes(sample);
assert.equal(parsed.leadGenerationRunId, 20);
assert.equal(parsed.googlePlaceId, "ChIJg5td0RxB1ZMR5JQ95u3KMv0");
assert.equal(parsed.anpProductsSummary, "ETANOL HIDRATADO COMUM (1 bicos); GASOLINA C COMUM (2 bicos)");
assert.equal(parsed.userNotes, null);

const display = resolveClientFuelDisplay({
  notes: sample,
  anp_fuel_brand: "IPIRANGA",
  anp_white_flag: false
});
assert.equal(display.fuelBrand, "IPIRANGA");
assert.equal(display.participatesInBrandNetwork, true);
assert.equal(display.anpProducts.length, 2);
assert.equal(formatParticipatesInBrandNetwork(false), "Não (bandeira branca)");

const inline =
  "Origem: geração de leads #20 Google Place ID: ChIJg5td0RxB1ZMR5JQ95u3KMv0 Produtos ANP: ETANOL HIDRATADO COMUM (1 bicos); GASOLINA C COMUM (2 bicos)";
const inlineParsed = parseLeadMotorNotes(inline);
assert.equal(inlineParsed.leadGenerationRunId, 20);
assert.equal(inlineParsed.anpProductsSummary?.includes("ETANOL"), true);

const log = normalizeCallScriptLog([
  {
    at: "2026-01-01T00:00:00Z",
    step_id: "s1",
    step_title: "Quem é o responsável?",
    action: "choice",
    choice_label: "Gerente"
  }
]);
assert.equal(formatCallScriptLogAnswers(log), "Quem é o responsável?: Gerente");

const notes = "Roteiro da ligação:\n· Quem faz a compra?: Dono\n\nObs extra";
assert.equal(extractScriptSummaryFromApproachNotes(notes)?.includes("Quem faz a compra"), true);

console.log("client-fuel-display.test.ts OK");
