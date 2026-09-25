import { FunilKanbanView } from "@/components/funil-kanban-view";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const { products, bdrs, users } = await loadCatalog();
  return <FunilKanbanView products={products} bdrs={bdrs} users={users} />;
}
