import { listApi4comDialIdentities } from "@/lib/api4com/dial-identity";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  if (!user.roles.includes("admin")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const items = await listApi4comDialIdentities();
  return Response.json({ items });
}
