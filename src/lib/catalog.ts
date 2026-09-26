import { listCompanies } from "@/lib/companies";
import { listProducts } from "@/lib/products";
import { listUsers } from "@/lib/users";

export async function loadCatalog() {
  const [products, users, companies] = await Promise.all([listProducts(), listUsers(true), listCompanies()]);
  const bdrs = users.filter((u) => u.roles.includes("bdr"));
  return {
    products,
    users,
    companies,
    bdrs: bdrs.length ? bdrs : users
  };
}
