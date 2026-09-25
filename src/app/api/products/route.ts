import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listProducts, saveProduct } from "@/lib/products";
import { productSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const products = await listProducts();
  return Response.json({ products });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const id = await saveProduct(parsed.data);
  return Response.json({ id }, { status: 201 });
}
