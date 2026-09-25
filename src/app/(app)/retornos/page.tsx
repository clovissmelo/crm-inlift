import { RetornosView } from "@/components/retornos-view";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function RetornosPage() {
  const { products, bdrs } = await loadCatalog();
  return <RetornosView products={products} bdrs={bdrs} />;
}
