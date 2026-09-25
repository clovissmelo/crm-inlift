import { listProducts } from "@/lib/products";
import { listUsers } from "@/lib/users";

export async function loadCatalog() {
  const [products, users] = await Promise.all([listProducts(), listUsers(true)]);
  const bdrs = users.filter((u) => u.roles.includes("bdr"));
  return {
    products,
    users,
    bdrs: bdrs.length ? bdrs : users
  };
}
