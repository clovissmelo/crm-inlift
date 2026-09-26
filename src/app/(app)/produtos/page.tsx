import { ProductsAdmin } from "@/components/products-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/companies";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const user = await requireUser();
  const [users, companies] = await Promise.all([listUsers(true), listCompanies()]);
  return <ProductsAdmin users={users} companies={companies} canDelete={isAdmin(user)} />;
}
