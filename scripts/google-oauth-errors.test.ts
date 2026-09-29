import assert from "node:assert/strict";
import { userMessageForOAuthError } from "../src/lib/google-oauth-connect-error";

assert.ok(userMessageForOAuthError("token_exchange")?.includes("código"));
assert.ok(userMessageForOAuthError("missing_refresh_token")?.includes("refresh"));
assert.equal(userMessageForOAuthError(null), null);
console.log("google-oauth-errors.test: OK");
