import { ProspeccaoListView } from "@/components/prospeccao-list-view";
import { loadCatalog } from "@/lib/catalog";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
  const { products, bdrs, companies } = await loadCatalog();
  const { items, total } = await queryProspeccaoQueue({ limit: 50, offset: 0 });
  return (
    <ProspeccaoListView initialItems={items} initialTotal={total} products={products} bdrs={bdrs} companies={companies} />
  );
}
