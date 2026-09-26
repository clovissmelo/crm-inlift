import { CompaniesAdmin } from "@/components/companies-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  const user = await requireUser();
  const users = await listUsers(true);
  return <CompaniesAdmin users={users} canDelete={isAdmin(user)} />;
}
