import { redirect } from "next/navigation";
import { consumeOAuthState, saveTokensFromCode, isGoogleOAuthConfigured } from "@/lib/google-calendar";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    redirect("/cadastros/integracoes?error=not_configured");
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    redirect("/cadastros/integracoes?error=oauth_denied");
  }
  const userId = await consumeOAuthState(state);
  if (!userId) {
    redirect("/cadastros/integracoes?error=invalid_state");
  }
  try {
    await saveTokensFromCode(code, userId);
    redirect("/cadastros/integracoes?connected=1");
  } catch {
    redirect("/cadastros/integracoes?error=token_failed");
  }
}
