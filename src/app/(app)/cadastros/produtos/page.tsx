import { ProductsAdmin } from "@/components/products-admin";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ProdutosCadastroPage() {
  const users = await listUsers(true);
  return <ProductsAdmin users={users} />;
}
