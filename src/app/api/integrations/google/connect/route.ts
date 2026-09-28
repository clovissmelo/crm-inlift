import type { Route } from "next";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireApiUser } from "@/lib/auth";
import { buildGoogleAuthUrl, createOAuthState, isGoogleOAuthConfigured } from "@/lib/google-calendar";
import { getRequestOrigin } from "@/lib/request-origin";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    redirect("/login");
  }
  const origin = getRequestOrigin(request);
  if (!(await isGoogleOAuthConfigured(origin))) {
    redirect("/admin/integracoes/google-agenda?error=not_configured" as Route);
  }
  const state = await createOAuthState(user.id);
  const url = await buildGoogleAuthUrl(state, origin);
  return NextResponse.redirect(url);
}
