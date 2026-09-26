import { AdminNovosLeadsWizard } from "@/components/admin-novos-leads-wizard";
import { requireAdminPage } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminNovosLeadsPage() {
  const user = await requireUser();
  requireAdminPage(user);
  return <AdminNovosLeadsWizard />;
}
