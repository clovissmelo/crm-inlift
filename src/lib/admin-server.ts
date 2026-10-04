import { userHasFullMenuAccess } from "@/lib/access-profiles";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";

export async function requireAdminPage(user: Pick<User, "id" | "roles">) {
  if (isAdmin(user)) return;
  if (await userHasFullMenuAccess(user.id)) return;
  redirect("/dashboard");
}
