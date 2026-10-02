/**
 * npx tsx scripts/trade-name.test.ts
 */
import assert from "node:assert/strict";
import { resolveNomeFantasia, stripCorporateLegalSuffix } from "../src/lib/lead-motor/trade-name";

assert.equal(stripCorporateLegalSuffix("AUTO POSTO ACRELANDIA LTDA"), "AUTO POSTO ACRELANDIA");
assert.equal(stripCorporateLegalSuffix("FOO S/A"), "FOO");
assert.equal(stripCorporateLegalSuffix("FOO S.A."), "FOO");
assert.equal(stripCorporateLegalSuffix("FOO SA"), "FOO");

assert.equal(
  resolveNomeFantasia({
    receitaNomeFantasia: "",
    razaoSocial: "AUTO POSTO ACRELANDIA LTDA"
  }),
  "AUTO POSTO ACRELANDIA"
);

assert.equal(
  resolveNomeFantasia({
    receitaNomeFantasia: "Posto Shell Centro",
    razaoSocial: "AUTO POSTO ACRELANDIA LTDA"
  }),
  "Posto Shell Centro"
);

assert.equal(
  resolveNomeFantasia({
    receitaNomeFantasia: "AUTO POSTO ACRELANDIA LTDA",
    razaoSocial: "AUTO POSTO ACRELANDIA LTDA"
  }),
  "AUTO POSTO ACRELANDIA"
);

console.log("trade-name.test.ts OK");
