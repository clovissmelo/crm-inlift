import { redirect } from "next/navigation";
import { consumeOAuthState, saveTokensFromCode, isGoogleOAuthConfigured } from "@/lib/google-calendar";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    redirect("/admin/variaveis?error=not_configured");
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    redirect("/admin/variaveis?error=oauth_denied");
  }
  const userId = await consumeOAuthState(state);
  if (!userId) {
    redirect("/admin/variaveis?error=invalid_state");
  }
  try {
    await saveTokensFromCode(code, userId);
    redirect("/admin/variaveis?connected=1");
  } catch {
    redirect("/admin/variaveis?error=token_failed");
  }
}
