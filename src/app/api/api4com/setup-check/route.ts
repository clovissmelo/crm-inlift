import { probeApi4comDialSetup } from "@/lib/api4com/setup-probe";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  if (!user.roles.includes("bdr") && !user.roles.includes("admin")) {
    return Response.json({ error: "Disponível para perfis BDR." }, { status: 403 });
  }
  const probe = await probeApi4comDialSetup(user.id);
  return Response.json(probe);
}
