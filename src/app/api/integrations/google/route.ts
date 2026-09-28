import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getGooglePublicStatus, isGoogleOAuthConfigured } from "@/lib/google-calendar";
import { getRequestOrigin } from "@/lib/request-origin";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const origin = getRequestOrigin(request);
  const status = await getGooglePublicStatus(origin);
  const configured = await isGoogleOAuthConfigured(origin);
  return Response.json({
    ...status,
    message: !configured
      ? "Configure Client ID e Client Secret em Admin → Integrações → Google Agenda."
      : status.connected
        ? null
        : "Google Agenda não conectado"
  });
}
