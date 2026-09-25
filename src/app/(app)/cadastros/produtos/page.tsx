import { ProductsAdmin } from "@/components/products-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ProdutosCadastroPage() {
  const user = await requireUser();
  const users = await listUsers(true);
  return <ProductsAdmin users={users} canDelete={isAdmin(user)} />;
}
