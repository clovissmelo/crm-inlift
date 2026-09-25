import { AbordagensAdmin } from "@/components/abordagens-admin";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function AbordagensPage() {
  const { products } = await loadCatalog();
  return <AbordagensAdmin products={products} />;
}
