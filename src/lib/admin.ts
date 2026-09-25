import { redirect } from "next/navigation";
import type { User, UserRole } from "@/lib/types";

export function isAdmin(user: Pick<User, "roles">): boolean {
  return user.roles.includes("admin");
}

export function requireAdminPage(user: Pick<User, "roles">) {
  if (!isAdmin(user)) redirect("/dashboard");
}

export function requireAdminApi(user: Pick<User, "roles"> | null): Response | null {
  if (!user || !isAdmin(user)) {
    return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }
  return null;
}

export const ADMIN_NAV_ROLES: UserRole[] = ["admin"];
