import { UsersAdmin } from "@/components/users-admin";
import { requireAdminPage } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const user = await requireUser();
  requireAdminPage(user);
  return <UsersAdmin canDelete />;
}
