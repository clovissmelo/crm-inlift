import { requireApiUser, jsonUnauthorized } from "@/lib/auth";
import { resolveApi4comWebphoneConfigForSession } from "@/lib/api4com/webphone-config-server";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const rawUserId = url.searchParams.get("user_id");
  const targetUserId = rawUserId ? Number(rawUserId) : user.id;
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return Response.json({ error: "user_id inválido" }, { status: 400 });
  }

  const result = await resolveApi4comWebphoneConfigForSession(user, targetUserId);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(result);
}
