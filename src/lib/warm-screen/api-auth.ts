import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { isWarmScreenRunner } from "@/lib/warm-screen/permissions";

export async function requireWarmScreenApiUser() {
  const user = await requireApiUser();
  if (!user) return { user: null as null, denied: jsonUnauthorized() };
  if (!isWarmScreenRunner(user)) {
    return {
      user: null as null,
      denied: Response.json({ error: "Sem permissão para o motor de aquecimento." }, { status: 403 })
    };
  }
  return { user, denied: null as null };
}

export function isManagerOrAdmin(user: { roles: string[] }) {
  return user.roles.includes("admin") || user.roles.includes("manager");
}
