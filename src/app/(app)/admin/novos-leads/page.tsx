import { AdminNovosLeadsWizard } from "@/components/admin-novos-leads-wizard";
import { requireAdminPage } from "@/lib/admin-server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminNovosLeadsPage() {
  const user = await requireUser();
  await requireAdminPage(user);
  return <AdminNovosLeadsWizard />;
}
