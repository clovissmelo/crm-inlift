import { AbordagensAdmin } from "@/components/abordagens-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function AbordagensPage() {
  const user = await requireUser();
  const { products } = await loadCatalog();
  return <AbordagensAdmin products={products} canDelete={isAdmin(user)} />;
}
