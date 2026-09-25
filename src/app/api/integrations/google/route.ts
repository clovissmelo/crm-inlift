import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getGooglePublicStatus, isGoogleOAuthConfigured } from "@/lib/google-calendar";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const status = await getGooglePublicStatus();
  return Response.json({
    ...status,
    message: !isGoogleOAuthConfigured()
      ? "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no servidor."
      : status.connected
        ? null
        : "Google Agenda não conectado"
  });
}
