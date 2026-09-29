import type { Route } from "next";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { consumeOAuthState, saveTokensFromCode, isGoogleOAuthConfigured } from "@/lib/google-calendar";
import { getRequestOrigin } from "@/lib/request-origin";
import { GoogleOAuthConnectError, logGoogleOAuthFailure, oauthErrorQueryParam } from "@/lib/google-oauth-connect-error";

export async function GET(request: Request) {
  const origin = getRequestOrigin(request);
  if (!(await isGoogleOAuthConfigured(origin))) {
    redirect("/admin/integracoes/google-agenda?error=not_configured" as Route);
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    redirect("/admin/integracoes/google-agenda?error=oauth_denied" as Route);
  }
  const userId = await consumeOAuthState(state);
  if (!userId) {
    redirect("/admin/integracoes/google-agenda?error=invalid_state" as Route);
  }

  try {
    await saveTokensFromCode(code, userId, origin);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof GoogleOAuthConnectError) {
      redirect(`/admin/integracoes/google-agenda?error=${oauthErrorQueryParam(e.stage)}` as Route);
    }
    const msg = e instanceof Error ? e.message : String(e);
    logGoogleOAuthFailure("token_exchange", msg);
    redirect("/admin/integracoes/google-agenda?error=token_failed" as Route);
  }

  redirect("/admin/integracoes/google-agenda?connected=1" as Route);
}
