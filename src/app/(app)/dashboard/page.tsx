import { DashboardView } from "@/components/dashboard-view";
import { loadCatalog } from "@/lib/catalog";
import { loadDashboardStats } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { products, bdrs } = await loadCatalog();
  let initialStats = null;
  let initialError: string | null = null;
  try {
    initialStats = await loadDashboardStats({ period: "7d" });
  } catch (e) {
    console.error("[dashboard/page]", e);
    initialError = e instanceof Error ? e.message : "Erro ao carregar indicadores";
  }
  return (
    <DashboardView products={products} bdrs={bdrs} initialStats={initialStats} initialError={initialError} />
  );
}
