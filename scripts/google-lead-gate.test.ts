/**
 * npx tsx scripts/google-lead-gate.test.ts
 */
import assert from "node:assert/strict";
import {
  googleHasLeadContactSignals,
  googleWebsiteIsInstagram
} from "../src/lib/lead-generation/google-lead-gate";

assert.equal(googleHasLeadContactSignals(null), false);
assert.equal(googleHasLeadContactSignals({ phone_digits: "", website: "" }), false);
assert.equal(googleHasLeadContactSignals({ phone_digits: "11999998888", website: "" }), true);
assert.equal(googleHasLeadContactSignals({ phone_digits: "", website: "https://posto.example.com" }), true);
assert.equal(
  googleHasLeadContactSignals({ phone_digits: "", website: "https://instagram.com/posto" }),
  true
);
assert.ok(googleWebsiteIsInstagram("https://www.instagram.com/posto"));

console.log("google-lead-gate.test.ts OK");
