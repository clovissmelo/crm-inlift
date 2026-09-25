import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireApiUser } from "@/lib/auth";
import { buildGoogleAuthUrl, createOAuthState, isGoogleOAuthConfigured } from "@/lib/google-calendar";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    redirect("/login");
  }
  if (!isGoogleOAuthConfigured()) {
    redirect("/admin/variaveis?error=not_configured");
  }
  const state = await createOAuthState(user.id);
  const url = buildGoogleAuthUrl(state);
  return NextResponse.redirect(url);
}
