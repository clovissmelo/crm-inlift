import { PipelineStagesAdmin } from "@/components/pipeline-stages-admin";
import { requireAdminPage } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminEtapasFunilPage() {
  const user = await requireUser();
  await requireAdminPage(user);
  return <PipelineStagesAdmin />;
}
