import Link from "next/link";
import { ClientListView } from "@/components/client-list-view";
import { loadCatalog } from "@/lib/catalog";
import { queryClients } from "@/lib/clients-query";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const { products, bdrs } = await loadCatalog();
  const { items, total } = await queryClients({ limit: 50, offset: 0 });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <Link className="btn btn-primary" href="/clientes/novo">
          Novo cliente
        </Link>
      </div>
      <ClientListView title="Lista de clientes" initialItems={items} initialTotal={total} products={products} bdrs={bdrs} />
    </div>
  );
}
