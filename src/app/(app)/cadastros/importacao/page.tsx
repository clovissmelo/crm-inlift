import { ImportWizard } from "@/components/import-wizard";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ImportacaoPage() {
  const { products, bdrs } = await loadCatalog();
  return <ImportWizard products={products} bdrs={bdrs} />;
}
