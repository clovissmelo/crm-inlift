import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { deleteProduct, getProduct, saveProduct } from "@/lib/products";
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

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const productId = Number(id);
  const product = await getProduct(productId);
  if (!product) return Response.json({ error: "Não encontrado" }, { status: 404 });
  try {
    await deleteProduct(productId);
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
