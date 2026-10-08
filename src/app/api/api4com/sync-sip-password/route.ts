import { syncUserSipPasswordFromApi4com } from "@/lib/api4com/sync-sip-password";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

export async function POST() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  if (!user.roles.includes("bdr")) {
    return Response.json({ error: "Disponível para perfis BDR." }, { status: 403 });
  }
  const result = await syncUserSipPasswordFromApi4com(user.id, user.roles);
  const status = result.ok ? 200 : 400;
  return Response.json(result, { status });
}
