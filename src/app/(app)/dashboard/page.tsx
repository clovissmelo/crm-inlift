import { DashboardView } from "@/components/dashboard-view";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { products, bdrs } = await loadCatalog();
  return <DashboardView products={products} bdrs={bdrs} />;
}
