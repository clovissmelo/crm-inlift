import { ConvertedDealsView } from "@/components/converted-deals-view";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function NegociosConvertidosPage() {
  const { products, bdrs, users, companies } = await loadCatalog();
  return <ConvertedDealsView products={products} bdrs={bdrs} users={users} companies={companies} />;
}
