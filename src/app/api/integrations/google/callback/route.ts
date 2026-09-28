import type { Route } from "next";
import { redirect } from "next/navigation";
import { consumeOAuthState, saveTokensFromCode, isGoogleOAuthConfigured } from "@/lib/google-calendar";
import { getRequestOrigin } from "@/lib/request-origin";

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
    redirect("/admin/integracoes/google-agenda?connected=1" as Route);
  } catch {
    redirect("/admin/integracoes/google-agenda?error=token_failed" as Route);
  }
}
