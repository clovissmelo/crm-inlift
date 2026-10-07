/**
 * npx tsx scripts/api4com-phone.test.ts
 */
import assert from "node:assert/strict";
import { normalizeApi4comCalledNumber, toApi4comCalledE164 } from "../src/lib/api4com/phone";

assert.equal(normalizeApi4comCalledNumber("(51) 99348-7868"), "5551993487868");
assert.equal(normalizeApi4comCalledNumber("51993487868"), "5551993487868");
assert.equal(normalizeApi4comCalledNumber("5551993487868"), "5551993487868");

assert.equal(toApi4comCalledE164("5551993487868"), "+5551993487868");

console.log("api4com-phone.test.ts OK");
