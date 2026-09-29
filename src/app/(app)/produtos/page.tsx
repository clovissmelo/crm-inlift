import { ProductsAdmin } from "@/components/products-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/companies";
import { listLeadGenerationFlows } from "@/lib/lead-generation/flows-repo";
import { listLeadGenSegments } from "@/lib/lead-generation/segments-repo";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const user = await requireUser();
  const [users, companies, segments, flows] = await Promise.all([
    listUsers(true),
    listCompanies(),
    listLeadGenSegments({ activeOnly: true }).catch(() => []),
    listLeadGenerationFlows({ activeOnly: true }).catch(() => [])
  ]);
  return (
    <ProductsAdmin
      users={users}
      companies={companies}
      canDelete={isAdmin(user)}
      leadGenSegments={segments.map((s) => ({ slug: s.slug, label: s.label }))}
      leadGenFlows={flows.map((f) => ({ id: f.id, name: f.name }))}
    />
  );
}
