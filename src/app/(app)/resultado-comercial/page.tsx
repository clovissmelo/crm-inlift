import { ClassificationAdminTabs } from "@/components/classification-admin-tabs";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResultadoComercialPage() {
  const user = await requireUser();
  return <ClassificationAdminTabs canDelete={isAdmin(user)} />;
}
