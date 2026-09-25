import Link from "next/link";
import { ImportWizard } from "@/components/import-wizard";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function AdminImportacaoPage() {
  const { products, bdrs } = await loadCatalog();
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <ImportWizard products={products} bdrs={bdrs} />
    </div>
  );
}
