import { UsersAdmin } from "@/components/users-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UsuariosCadastroPage() {
  const user = await requireUser();
  return <UsersAdmin canDelete={isAdmin(user)} />;
}
