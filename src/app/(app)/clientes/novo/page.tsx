import { ClientForm } from "@/components/client-form";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  const { products, bdrs } = await loadCatalog();
  return <ClientForm products={products} bdrs={bdrs} />;
}
