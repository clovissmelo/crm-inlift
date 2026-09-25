import { all, nowIso, run } from "@/lib/db";
import type { Product } from "@/lib/types";

export async function listProducts() {
  const rows = await all<{
    id: number;
    name: string;
    description: string | null;
    status: "active" | "inactive";
    uses_proposal: boolean;
  }>("SELECT * FROM products ORDER BY name");

  const links = await all<{ product_id: number; user_id: number }>("SELECT product_id, user_id FROM product_responsibles");
  const map = new Map<number, number[]>();
  for (const l of links) {
    const list = map.get(l.product_id) ?? [];
    list.push(l.user_id);
    map.set(l.product_id, list);
  }

  return rows.map(
    (r): Product => ({
      ...r,
      uses_proposal: Boolean(r.uses_proposal),
      responsible_user_ids: map.get(r.id) ?? []
    })
  );
}

export async function getProduct(id: number) {
  const products = await listProducts();
  return products.find((p) => p.id === id) ?? null;
}

export async function saveProduct(input: {
  id?: number;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
  uses_proposal: boolean;
  responsible_user_ids: number[];
}) {
  let productId = input.id;
  if (productId) {
    await run(
      `
        UPDATE products SET name = @name, description = @description, status = @status,
          uses_proposal = @usesProposal, updated_at = @updatedAt
        WHERE id = @id
      `,
      {
        id: productId,
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        usesProposal: input.uses_proposal,
        updatedAt: nowIso()
      }
    );
  } else {
    const result = await run(
      `
        INSERT INTO products (name, description, status, uses_proposal, created_at, updated_at)
        VALUES (@name, @description, @status, @usesProposal, @createdAt, @updatedAt)
      `,
      {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        usesProposal: input.uses_proposal,
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    );
    productId = result.lastInsertRowid;
  }

  if (!productId) throw new Error("Produto inválido");
  await run("DELETE FROM product_responsibles WHERE product_id = @productId", { productId });
  for (const userId of input.responsible_user_ids) {
    await run("INSERT INTO product_responsibles (product_id, user_id) VALUES (@productId, @userId)", {
      productId,
      userId
    });
  }
  return productId;
}
