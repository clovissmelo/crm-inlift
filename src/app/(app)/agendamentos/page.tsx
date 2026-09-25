import { AgendamentosView } from "@/components/agendamentos-view";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function AgendamentosPage() {
  const user = await requireUser();
  const { products, bdrs, users } = await loadCatalog();
  return <AgendamentosView products={products} bdrs={bdrs} allUsers={users} currentUserId={user.id} />;
}
