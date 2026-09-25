import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getProduct, saveProduct } from "@/lib/products";
import { productSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const product = await getProduct(Number(id));
  if (!product) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json({ product });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const productId = await saveProduct({ ...parsed.data, id: Number(id) });
  const product = await getProduct(productId);
  return Response.json({ product });
}
