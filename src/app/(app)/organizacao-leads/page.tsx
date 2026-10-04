import { OrganizacaoLeadsView } from "@/components/organizacao-leads-view";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function OrganizacaoLeadsPage() {
  const user = await requireUser();
  const { products, bdrs } = await loadCatalog();
  return (
    <OrganizacaoLeadsView
      bdrs={bdrs}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      isAdmin={isAdmin(user)}
    />
  );
}
