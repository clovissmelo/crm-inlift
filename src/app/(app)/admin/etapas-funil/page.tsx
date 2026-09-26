import Link from "next/link";
import { PipelineStagesAdmin } from "@/components/pipeline-stages-admin";
import { requireAdminPage } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminEtapasFunilPage() {
  const user = await requireUser();
  requireAdminPage(user);

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PipelineStagesAdmin />
    </div>
  );
}
